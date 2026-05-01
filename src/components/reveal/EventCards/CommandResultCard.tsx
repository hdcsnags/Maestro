import InfoCard from './InfoCard';
import type { ThreadMessage } from '../../../types';

export default function CommandResultCard({ message }: { message: ThreadMessage }) {
  return <InfoCard message={message} />;
}
