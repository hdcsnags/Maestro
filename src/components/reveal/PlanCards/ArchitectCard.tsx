import { useState } from 'react';
import type { ThreadMessage } from '../../../types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, ScanSearch, Sparkles } from 'lucide-react';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

export default function ArchitectCard({ message }: { message: ThreadMessage }) {
  const {
    projectType,
    activeRepoConnection,
    architectMd,
    scanResult,
    generateArchitect,
    scanRepository,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);
  const [generating, setGenerating] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    setScanning(true);
    setError('');
    try {
      await scanRepository();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      await generateArchitect();
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'Architect generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <PlanCardFrame
      title="Architect plan"
      status={architectMd ? 'Generated' : 'Pending'}
      description="Generate ARCHITECT.md once the builder roster is set. The preview stays full-height in the thread instead of clipped into the drawer."
      onOpenAdvancedView={openAdvancedView}
    >
      <div className="flex flex-wrap gap-2">
        {projectType === 'existing' && (
          <button
            onClick={() => void handleScan()}
            disabled={!activeRepoConnection || scanning}
            className="reveal-pill"
            style={{ height: '36px', fontSize: '11px', padding: '0 14px', opacity: !activeRepoConnection || scanning ? 0.6 : 1 }}
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
            {scanResult ? 'Refresh scan' : 'Scan repo'}
          </button>
        )}
        <button
          onClick={() => void handleGenerate()}
          disabled={generating}
          className="reveal-pill"
          style={{ height: '36px', fontSize: '11px', padding: '0 14px', background: 'var(--gold)', color: 'var(--void)', borderColor: 'transparent', opacity: generating ? 0.6 : 1 }}
        >
          {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {architectMd ? 'Regenerate ARCHITECT.md' : 'Generate ARCHITECT.md'}
        </button>
      </div>
      {error && (
        <div className="mt-3 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
          {error}
        </div>
      )}
      {architectMd && (
        <div className="claw-prose mt-4 rounded-xl border border-white/[0.08] bg-black/10 px-4 py-4 text-sm text-white/75">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {architectMd}
          </ReactMarkdown>
        </div>
      )}
    </PlanCardFrame>
  );
}
