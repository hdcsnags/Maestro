import type { ThreadMessage } from '../../../types';
import ArchitectCard from './ArchitectCard';
import BackendCard from './BackendCard';
import BuilderRosterCard from './BuilderRosterCard';
import LaneCard from './LaneCard';
import ProjectTypeCard from './ProjectTypeCard';
import RepoCard from './RepoCard';
import SpecLockCard from './SpecLockCard';

export default function PlanCardRenderer({ message }: { message: ThreadMessage }) {
  switch (message.metadata.plan_card?.card) {
    case 'project_type':
      return <ProjectTypeCard message={message} />;
    case 'repo':
      return <RepoCard message={message} />;
    case 'builder_roster':
      return <BuilderRosterCard message={message} />;
    case 'backend':
      return <BackendCard message={message} />;
    case 'architect':
      return <ArchitectCard message={message} />;
    case 'lane':
      return <LaneCard message={message} />;
    case 'spec_lock':
      return <SpecLockCard message={message} />;
    default:
      return null;
  }
}
