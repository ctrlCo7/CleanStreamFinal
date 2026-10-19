import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog } from '../components/Dialog';

// ─── Toasts ──────────────────────────────────────────────────────────────────

interface Toast { id: number; kind: 'success' | 'error'; text: string }
interface ToastApi { success: (text: string) => void; error: (text: string) => void }
const ToastContext = createContext<ToastApi | null>(null);

// ─── Confirm dialog ──────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  danger?: boolean;
}
type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId.current++;
    // Keep only the latest few so a burst of actions can't bury the page.
    setToasts((t) => [...t, { id, kind, text }].slice(-4));
    // Errors stay longer: they often need to be read and acted on.
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 4500);
  }, []);

  const toastApi = useMemo<ToastApi>(
    () => ({ success: (t) => push('success', t), error: (t) => push('error', t) }),
    [push],
  );

  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback<ConfirmFn>(
    (options) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );
  const settle = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <ToastContext.Provider value={toastApi}>
      <ConfirmContext.Provider value={confirm}>
        {children}
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} title="Click to dismiss">{t.text}</div>
          ))}
        </div>
        {pending && (
          <Dialog title={pending.options.title} onClose={() => settle(false)} size="sm">
            <div className="dialog-body">{pending.options.message}</div>
            <div className="dialog-actions">
              <button className="btn" onClick={() => settle(false)}>Cancel</button>
              <button
                className={`btn ${pending.options.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => settle(true)}
                autoFocus
              >
                {pending.options.confirmLabel}
              </button>
            </div>
          </Dialog>
        )}
      </ConfirmContext.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <FeedbackProvider>');
  return ctx;
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <FeedbackProvider>');
  return ctx;
}

/** Re-renders on a timer so relative times ("5 min ago") stay fresh. */
export function useTick(ms = 60000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}
