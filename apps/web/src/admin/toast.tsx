/**
 * Toast notifications for the office console.
 *
 * Wrap the shell in <ToastProvider>, then call useToast() from any page to
 * confirm an action ("User added") or surface a failure ("Could not archive").
 * Toasts auto-dismiss; failures linger a little longer so they're not missed.
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type ToastTone = 'success' | 'error';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi>({ success: () => {}, error: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setToasts((list) => [...list, { id, tone, message }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 6000 : 3500);
    },
    [dismiss],
  );

  const api = useRef<ToastApi>({
    success: (m) => push('success', m),
    error: (m) => push('error', m),
  });
  // Keep the closures current without changing identity for consumers.
  api.current.success = (m) => push('success', m);
  api.current.error = (m) => push('error', m);

  return (
    <ToastContext.Provider value={api.current}>
      {children}
      <div className="admin__toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`admin__toast admin__toast--${t.tone}`}>
            <span>{t.message}</span>
            <button
              className="admin__toast-x"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
