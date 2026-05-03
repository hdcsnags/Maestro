import { Check, XCircle } from 'lucide-react';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';
import type { ThreadMessage } from '../../../types';

export default function ExecutionApprovalCard({ message }: { message: ThreadMessage }) {
  const { state, dispatch } = useMaestro();
  const { approveExecutionJob, approveWithToken, pollJobStatus, addMessage, loadThreadMessages } = useThreads();
  const event = message.metadata.system_event;
  const jobId = typeof message.metadata.job_id === 'string' ? message.metadata.job_id : null;

  // Check if this card's pending state matches the current active approval.
  const pending = state.pendingExecution?.threadId === message.thread_id
    ? state.pendingExecution
    : null;
  const tokenApproval = pending?.approvalToken && pending?.intent ? pending : null;

  const handleApprove = async () => {
    if (tokenApproval) {
      // HMAC token path: resubmit with the token to create an approved job.
      const job = await approveWithToken(
        tokenApproval.approvalToken!,
        tokenApproval.intent,
        message.thread_id,
      );
      if (!job) return;

      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        attempts += 1;
        const updated = await pollJobStatus(job.id, message.thread_id);
        if (updated && (updated.status === 'succeeded' || updated.status === 'failed')) break;
      }
      await loadThreadMessages(message.thread_id);
      return;
    }

    if (!jobId) return;
    // Legacy queued-job path.
    await approveExecutionJob(jobId, message.thread_id);
    dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });

    let attempts = 0;
    const maxAttempts = 30;
    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts += 1;
      const updated = await pollJobStatus(jobId, message.thread_id);
      if (updated && (updated.status === 'succeeded' || updated.status === 'failed')) break;
    }
    await loadThreadMessages(message.thread_id);
  };

  const handleReject = async () => {
    await addMessage(message.thread_id, 'system', 'Execution rejected by user.', undefined, {
      kind: 'execution_status',
      system_event: {
        tone: 'approval',
        title: 'Execution rejected',
        body: 'The command was not sent to the executor.',
      },
    });
    if (state.pendingExecution?.threadId === message.thread_id) {
      dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });
    }
    await loadThreadMessages(message.thread_id);
  };

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-warn/30 bg-signal-warn/10 px-4 py-3 text-white/80">
      <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-warn/90">
        {event?.title ?? 'Approval required'}
      </div>
      {event?.body && (
        <div className="mt-2 text-sm leading-7 text-white/75">
          {event.body}
        </div>
      )}
      {event?.command && (
        <code className="mt-3 block overflow-x-auto rounded-lg bg-black/20 px-3 py-2 text-xs text-white/70">
          {event.command}
        </code>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleApprove}
          className="flex items-center gap-1.5 rounded-lg bg-signal-ok/80 px-3 py-1.5 text-xs text-white transition-all hover:bg-signal-ok"
        >
          <Check size={12} />
          Approve
        </button>
        <button
          onClick={handleReject}
          className="flex items-center gap-1.5 rounded-lg bg-signal-risk/20 px-3 py-1.5 text-xs text-signal-risk transition-all hover:bg-signal-risk/30"
        >
          <XCircle size={12} />
          Reject
        </button>
      </div>
    </div>
  );
}
