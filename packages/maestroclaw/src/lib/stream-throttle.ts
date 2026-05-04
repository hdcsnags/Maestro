/**
 * StreamThrottle — serialized, byte-bounded line batcher for streaming executor output.
 *
 * Design constraints per rubber-duck review:
 * - All flushes are serialized (no concurrent reportEvent calls for the same job).
 * - Batches are bounded by byte size (not line count) to stay within the 262 KB
 *   Supabase function body limit.
 * - drain() must be awaited before any retry/complete transitions to guarantee
 *   in-flight events are persisted before the job status changes.
 */

const MAX_BATCH_BYTES = 200_000; // ~200 KB, comfortably below the 262 KB cap
const FLUSH_INTERVAL_MS = 250;   // emit a batch roughly 4× per second

type FlushFn = (type: 'stdout' | 'stderr', lines: string[], seq: number) => Promise<void>;

interface Batch {
  type: 'stdout' | 'stderr';
  lines: string[];
  bytes: number;
}

export class StreamThrottle {
  private flushFn: FlushFn;
  private batches: Map<'stdout' | 'stderr', Batch> = new Map();
  private seq = 0;

  // Serialization queue — ensures only one flush runs at a time
  private queue: Promise<void> = Promise.resolve();

  // Timer for periodic flush
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(flushFn: FlushFn) {
    this.flushFn = flushFn;
  }

  emit(type: 'stdout' | 'stderr', line: string): void {
    const lineBytes = Buffer.byteLength(line, 'utf8') + 1; // +1 for newline

    let batch = this.batches.get(type);
    if (!batch) {
      batch = { type, lines: [], bytes: 0 };
      this.batches.set(type, batch);
    }

    // If adding this line would exceed the cap, flush first
    if (batch.bytes + lineBytes > MAX_BATCH_BYTES && batch.lines.length > 0) {
      this._enqueue(type);
      batch = { type, lines: [], bytes: 0 };
      this.batches.set(type, batch);
    }

    batch.lines.push(line);
    batch.bytes += lineBytes;

    // Schedule a periodic flush if not already pending
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = null;
        for (const t of (['stdout', 'stderr'] as const)) {
          const b = this.batches.get(t);
          if (b && b.lines.length > 0) this._enqueue(t);
        }
      }, FLUSH_INTERVAL_MS);
    }
  }

  /** Flush all pending lines and wait for all in-flight sends to complete. */
  async drain(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    for (const t of (['stdout', 'stderr'] as const)) {
      const b = this.batches.get(t);
      if (b && b.lines.length > 0) this._enqueue(t);
    }
    await this.queue;
  }

  private _enqueue(type: 'stdout' | 'stderr'): void {
    const batch = this.batches.get(type);
    if (!batch || batch.lines.length === 0) return;
    const lines = batch.lines.slice();
    const seq = ++this.seq;
    this.batches.set(type, { type, lines: [], bytes: 0 });

    // Chain onto the serialization queue — never run concurrent flushes
    this.queue = this.queue.then(() => this.flushFn(type, lines, seq)).catch(() => {
      // Best-effort: log but do not throw — streaming is non-critical
      console.warn(`StreamThrottle: flush failed for ${type} seq ${seq}`);
    });
  }
}
