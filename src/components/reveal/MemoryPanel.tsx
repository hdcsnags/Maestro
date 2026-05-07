import { useState } from 'react';
import { useRepoMemory } from '../../hooks/useRepoMemory';

const MAX_MANUAL_BYTES = 16384;
const WARN_BYTES = 8192;

function byteCount(str: string): number {
  return new TextEncoder().encode(str).length;
}

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export default function MemoryPanel() {
  const { memory, repoFullName, triggerSummarize, saveDirectEdit, forget } = useRepoMemory();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const [confirmForget, setConfirmForget] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!repoFullName) {
    return (
      <div style={{ padding: '12px 0', color: 'var(--text-dim)', fontSize: '13px' }}>
        No repository bound to this session. Memory is only available when a GitHub repo is connected.
      </div>
    );
  }

  const currentBytes = memory ? memory.byte_count : 0;
  const draftBytes = editing ? byteCount(draft) : 0;
  const displayBytes = editing ? draftBytes : currentBytes;
  const isOverWarn = displayBytes > WARN_BYTES;
  const isOverMax = editing && draftBytes > MAX_MANUAL_BYTES;

  function startEdit() {
    setDraft(memory?.content ?? '');
    setEditing(true);
    setStatusMsg(null);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft('');
  }

  async function handleSaveEdit() {
    if (isOverMax) return;
    setSaving(true);
    setStatusMsg(null);
    const ok = await saveDirectEdit(draft);
    setSaving(false);
    if (ok) {
      setEditing(false);
      setDraft('');
      setStatusMsg('Saved.');
    } else {
      setStatusMsg('Save failed. Check console.');
    }
  }

  async function handleRefresh() {
    setSummarizing(true);
    setStatusMsg(null);
    const ok = await triggerSummarize();
    setSummarizing(false);
    setStatusMsg(ok ? 'Memory updated from current session.' : 'Update failed (check Anthropic key or console).');
  }

  async function handleForget() {
    if (!confirmForget) {
      setConfirmForget(true);
      return;
    }
    setForgetting(true);
    const ok = await forget();
    setForgetting(false);
    setConfirmForget(false);
    if (!ok) setStatusMsg('Delete failed. Check console.');
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="reveal-label" style={{ marginBottom: '2px' }}>Repo</div>
          <div style={{ fontSize: '13px', color: 'var(--text)', fontFamily: 'monospace' }}>{repoFullName}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div
            className="reveal-label"
            style={{ marginBottom: '2px', color: isOverWarn ? 'var(--warn)' : undefined }}
          >
            {formatBytes(displayBytes)} / 8 KB
          </div>
          {memory?.last_summarized_at && (
            <div style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
              Updated {formatDate(memory.last_summarized_at)}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {!editing && (
        <div className="flex gap-2 flex-wrap">
          <button
            className="reveal-pill"
            onClick={startEdit}
            disabled={summarizing}
          >
            Edit
          </button>
          <button
            className="reveal-pill"
            onClick={handleRefresh}
            disabled={summarizing || saving}
          >
            {summarizing ? 'Updating…' : 'Refresh from session'}
          </button>
          <button
            className="reveal-pill"
            onClick={handleForget}
            disabled={forgetting || !memory}
            style={confirmForget ? { color: 'var(--risk)', borderColor: 'var(--risk)' } : undefined}
          >
            {forgetting ? 'Deleting…' : confirmForget ? 'Confirm forget?' : 'Forget repo'}
          </button>
          {confirmForget && (
            <button className="reveal-pill" onClick={() => setConfirmForget(false)}>
              Cancel
            </button>
          )}
        </div>
      )}

      {/* Status message */}
      {statusMsg && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{statusMsg}</div>
      )}

      {/* Content area */}
      {editing ? (
        <div className="flex flex-col gap-2">
          {isOverMax && (
            <div style={{ fontSize: '12px', color: 'var(--risk)' }}>
              Manual edits capped at 16 KB. Trim content before saving.
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={16}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.04)',
              border: `1px solid ${isOverMax ? 'var(--risk)' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: '8px',
              padding: '10px 12px',
              color: 'var(--text)',
              fontSize: '12px',
              fontFamily: 'monospace',
              lineHeight: 1.5,
              resize: 'vertical',
              outline: 'none',
            }}
          />
          <div
            style={{ fontSize: '11px', color: isOverMax ? 'var(--risk)' : isOverWarn ? 'var(--warn)' : 'var(--text-dim)' }}
          >
            {formatBytes(draftBytes)} / 16 KB manual cap · auto-summarize compresses back to 8 KB
          </div>
          <div className="flex gap-2">
            <button
              className="reveal-pill primary"
              onClick={handleSaveEdit}
              disabled={saving || isOverMax}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button className="reveal-pill" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </div>
      ) : memory?.content ? (
        <div
          className="reveal-codeblock"
          style={{
            fontSize: '12px',
            lineHeight: 1.5,
            maxHeight: '320px',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {memory.content}
        </div>
      ) : (
        <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>
          No memory yet. Complete a build or click "Refresh from session" to create it.
        </div>
      )}
    </div>
  );
}
