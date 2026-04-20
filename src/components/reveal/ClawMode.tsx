import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, ChevronDown, X, Loader2, Bot, User, AlertCircle } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CONCIERGE_MODELS, type ThreadMessage } from '../../types';

export default function ClawMode() {
  const { state, dispatch } = useMaestro();
  const { ensureConciergeThread, sendToConcierge, loadThreadMessages } = useThreads();
  const { createSession } = useWorkspace();
  const [input, setInput] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);

  // Filtered messages for the active thread
  const messages = useMemo(() => {
    if (!state.activeThread) return [];
    return state.threadMessages
      .filter(m => m.thread_id === state.activeThread!.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [state.activeThread, state.threadMessages]);

  // Current concierge model label
  const currentModelLabel = useMemo(() => {
    const found = CONCIERGE_MODELS.find(m => m.id === state.conciergeModel);
    return found?.label ?? state.conciergeModel;
  }, [state.conciergeModel]);

  // Initialize concierge thread on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      let sessionId = state.activeSession?.id;
      if (!sessionId && state.workspace) {
        const session = await createSession(state.workspace.id, 'ask');
        if (!session) return;
        sessionId = session.id;
      }
      if (!sessionId) return;

      const thread = await ensureConciergeThread(sessionId);
      if (thread) {
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
        await loadThreadMessages(thread.id);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending || !state.activeThread) return;

    setInput('');
    await sendToConcierge(state.activeThread.id, text);
  }, [input, state.isConciergeSending, state.activeThread, sendToConcierge]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'SET_CLAW_MODE_ACTIVE', payload: false });
  }, [dispatch]);

  const handleModelSelect = useCallback((modelId: string) => {
    dispatch({ type: 'SET_CONCIERGE_MODEL', payload: modelId });
    setModelPickerOpen(false);
  }, [dispatch]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col reveal-bg" style={{ isolation: 'isolate' }}>
      <div className="grain-layer" />
      <div className="vignette-layer" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
          <span className="text-sm font-medium text-white/80 tracking-wide uppercase">
            Claw Mode
          </span>
          <span className="text-xs text-white/30">·</span>
          <span className="text-xs text-white/40">Concierge</span>
        </div>

        {/* Model picker */}
        <div className="relative z-[60]">
          <button
            onClick={(e) => { e.stopPropagation(); setModelPickerOpen(!modelPickerOpen); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 
                       text-xs text-white/60 hover:text-white/80 transition-all"
          >
            <Bot size={12} />
            {currentModelLabel}
            <ChevronDown size={12} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
          </button>

          {modelPickerOpen && (
            <>
              <div className="fixed inset-0 z-[59]" onClick={() => setModelPickerOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-56 rounded-lg bg-void-2 border border-white/10 
                              shadow-xl overflow-hidden z-[60]">
                {CONCIERGE_MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={(e) => { e.stopPropagation(); handleModelSelect(m.id); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                      ${m.id === state.conciergeModel
                        ? 'bg-gold/10 text-gold'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                      }`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs opacity-50 mt-0.5">{m.provider}</div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <button
          onClick={handleClose}
          className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && !state.isConciergeSending && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mb-4">
              <Bot size={28} className="text-gold/60" />
            </div>
            <h3 className="text-lg font-medium text-white/70 mb-2">Concierge is ready</h3>
            <p className="text-sm text-white/30 max-w-md">
              Chat directly with your concierge. Ask questions, plan your build,
              or direct the orchestra. Switch models anytime from the header.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <MessageBubble key={msg.id} message={msg} conciergeModel={currentModelLabel} />
        ))}

        {state.isConciergeSending && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Bot size={14} className="text-gold/60" />
            </div>
            <div className="flex items-center gap-2 py-3 text-white/30 text-sm">
              <Loader2 size={14} className="animate-spin" />
              Thinking...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="relative z-10 border-t border-white/5 px-6 py-4">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to Concierge..."
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/5 border border-white/10 
                       px-4 py-3 text-sm text-white/90 placeholder:text-white/20
                       focus:outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/20
                       transition-all min-h-[44px] max-h-[200px]"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || state.isConciergeSending}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-gold/80 
                       hover:bg-gold text-void disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <div className="text-center mt-2">
          <span className="text-[10px] text-white/15">
            Shift+Enter for new line · Esc to close
          </span>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, conciergeModel }: { message: ThreadMessage; conciergeModel: string }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={14} className="text-red-400/60" />
        </div>
        <div className="py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/10 text-sm text-red-300/70 max-w-[80%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="py-2.5 px-4 rounded-2xl rounded-br-sm bg-gold/10 border border-gold/10 
                        text-sm text-white/80 max-w-[80%] whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={14} className="text-white/40" />
        </div>
      </div>
    );
  }

  // Concierge / agent message
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Bot size={14} className="text-gold/60" />
      </div>
      <div className="flex-1 max-w-[80%]">
        <div className="text-[10px] text-white/20 mb-1">{conciergeModel}</div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.03] border border-white/5 
                        text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}
