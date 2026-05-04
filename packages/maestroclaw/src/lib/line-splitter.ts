/**
 * LineSplitter — buffers arbitrary byte chunks and emits complete lines.
 * Handles mixed \r\n, \r, and \n line endings.
 * Call drain() at process exit to flush any unterminated final line.
 */
export class LineSplitter {
  private buf = '';

  push(chunk: string, onLine: (line: string) => void): void {
    // Normalize \r\n and bare \r to \n
    const normalized = chunk.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    this.buf += normalized;

    let lineEnd: number;
    while ((lineEnd = this.buf.indexOf('\n')) !== -1) {
      onLine(this.buf.slice(0, lineEnd));
      this.buf = this.buf.slice(lineEnd + 1);
    }
  }

  drain(onLine: (line: string) => void): void {
    if (this.buf.length > 0) {
      onLine(this.buf);
      this.buf = '';
    }
  }
}
