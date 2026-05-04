import { useState } from 'react';
import { Check, XCircle } from 'lucide-react';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';
import type { ThreadMessage } from '../../../types';

export default function ExecutionApprovalCard({ message }: { message: ThreadMessage }) {
  const { state, dispatch } = useMaestro();
  const { approveExecutionJob, approveWithToken, pollJobStatus, addMessage, loadThreadMessages } = useThreads();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const event = message.metadata.system_event;
  const jobId = typeof message.metadata.job_id === 'string' ? message.metadata.job_id : null;

  // Check if this card's pending state matches the current active approval.
  const pending = state.pendingExecution?.threadId === message.thread_id
    ? state.pendingExecution
    : null;
  const tokenApproval = pending?.approvalToken && pending?.intent ? pending : null;

  const handleApprove = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (tokenApproval) {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-warn/30 bg-signal-warn/10 px-4 py-3 text-ink-1">
      <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-warn/90">
        {event?.title ?? 'Approval required'}
      </div>
      {event?.body && (
        <div className="mt-2 text-sm leading-7 text-ink-1">
          {event.body}
        </div>
      )}
      {event?.command && (
        <code className="mt-3 block overflow-x-auto rounded-lg bg-void-2 px-3 py-2 text-xs text-ink-1">
          {event.command}
        </code>
      )}
      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={handleApprove}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 rounded-lg bg-signal-ok/80 px-3 py-1.5 text-xs text-white transition-all hover:bg-signal-ok disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={12} />
          {isSubmitting ? 'Running…' : 'Approve'}
        </button>
        <button
          onClick={handleReject}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 rounded-lg bg-signal-risk/20 px-3 py-1.5 text-xs text-signal-risk transition-all hover:bg-signal-risk/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <XCircle size={12} />
          Reject
        </button>
      </div>
    </div>
  );
}
