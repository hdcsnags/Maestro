import { useState } from 'react';
import { Download, Eye, FileText, FileCode, Globe } from 'lucide-react';
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

export default function ArtifactDownload({ artifacts, agentColor }: Props) {
  const [previewing, setPreviewing] = useState<string | null>(null);

  if (!artifacts || artifacts.length === 0) return null;

  const handleDownload = (artifact: ResponseArtifact) => {
    const blob = new Blob([artifact.content], { type: artifact.content_type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePreview = (artifact: ResponseArtifact) => {
    if (previewing === artifact.filename) {
      setPreviewing(null);
      return;
    }
    if (artifact.content_type.includes('html')) {
      const blob = new Blob([artifact.content], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    setPreviewing(artifact.filename);
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
        return (
          <div
            key={artifact.filename}
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
