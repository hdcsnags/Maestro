import type { ThreadMessage } from '../../../types';
import CommandResultCard from './CommandResultCard';
import ErrorRetryCard from './ErrorRetryCard';
import ExecutionApprovalCard from './ExecutionApprovalCard';
import FileManifestCard from './FileManifestCard';
import InfoCard from './InfoCard';
import PrOpenedCard from './PrOpenedCard';

export default function SystemEventCard({ message }: { message: ThreadMessage }) {
  switch (message.metadata.kind) {
    case 'execution_approval':
      return <ExecutionApprovalCard message={message} />;
    case 'pr_opened':
      return <PrOpenedCard message={message} />;
    case 'file_manifest':
      return <FileManifestCard message={message} />;
    case 'error_retry':
      return <ErrorRetryCard message={message} />;
    case 'execution_intent':
    case 'execution_status':
    case 'build_status':
      return <CommandResultCard message={message} />;
    case 'info':
    default:
      return <InfoCard message={message} />;
  }
}
