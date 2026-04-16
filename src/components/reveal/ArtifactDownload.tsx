import { useState } from 'react';
import { Download, Eye, FileText, FileCode, Globe, AlertTriangle } from 'lucide-react';
import { ResponseArtifact } from '../../types';

interface Props {
  artifacts: ResponseArtifact[];
  agentColor: string;
}

function getIcon(contentType: string) {
  if (contentType.includes('html')) return Globe;
  if (contentType.includes('markdown') || contentType.includes('md')) return FileText;
  return FileCode;
}

function formatSize(content: string) {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function clientNormalize(content: string): string {
  let decoded = content;
  // Strip code fences
  const fenced = decoded.trim().match(/^```(?:html|markdown|md|json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) decoded = fenced[1];
  // Unwrap JSON string
  if (decoded.trim().startsWith('"') && decoded.trim().endsWith('"')) {
    try {
      const unwrapped = JSON.parse(decoded);
      if (typeof unwrapped === 'string') decoded = unwrapped;
    } catch { /* not JSON */ }
  }
  // Unescape
  for (let i = 0; i < 3; i++) {
    const next = decoded
      .replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t').replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

export default function ArtifactDownload({ artifacts, agentColor }: Props) {
  const [previewError, setPreviewError] = useState<string | null>(null);

  if (!artifacts || artifacts.length === 0) return null;

  const handleDownload = (artifact: ResponseArtifact) => {
    const content = clientNormalize(artifact.content);
    const blob = new Blob([content], { type: artifact.content_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadRaw = (artifact: ResponseArtifact) => {
    const raw = artifact.raw_content ?? artifact.content;
    const blob = new Blob([raw], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `raw-${artifact.filename}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = (artifact: ResponseArtifact) => {
    setPreviewError(null);
    try {
      const content = clientNormalize(artifact.content);
      if (!content.includes('<') || !content.includes('>')) {
        setPreviewError(artifact.filename);
        return;
      }
      if (artifact.content_type.includes('html')) {
        const blob = new Blob([content], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    } catch {
      setPreviewError(artifact.filename);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.045)', paddingTop: '16px' }}>
      <span
        className="font-mono-dm"
        style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}
      >
        Artifacts
      </span>
      {artifacts.map((artifact) => {
        const Icon = getIcon(artifact.content_type);
        const isHtml = artifact.content_type.includes('html');
        const hasFailed = previewError === artifact.filename;
        return (
          <div key={artifact.filename}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '14px',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  background: `${agentColor}14`,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={13} style={{ color: agentColor }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {artifact.filename}
                  {artifact.normalized && (
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: '6px' }}>
                      (normalized)
                    </span>
                  )}
                </div>
                <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                  {formatSize(artifact.content)}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isHtml && (
                  <button
                    onClick={() => handlePreview(artifact)}
                    className="keycap"
                    style={{ width: '26px', height: '26px' }}
                    title="Preview in new tab"
                  >
                    <Eye size={11} />
                  </button>
                )}
                <button
                  onClick={() => handleDownload(artifact)}
                  className="keycap"
                  style={{ width: '26px', height: '26px' }}
                  title="Download"
                >
                  <Download size={11} />
                </button>
                {artifact.raw_content && (
                  <button
                    onClick={() => handleDownloadRaw(artifact)}
                    className="keycap"
                    style={{ width: '26px', height: '26px' }}
                    title="Download raw (debug)"
                  >
                    <FileCode size={11} />
                  </button>
                )}
              </div>
            </div>
            {hasFailed && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', fontSize: '11px', color: 'var(--signal-warn)',
              }}>
                <AlertTriangle size={12} />
                Preview failed — download raw artifact to inspect
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
