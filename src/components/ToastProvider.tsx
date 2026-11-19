import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      window.setTimeout(() => {
        dismiss(id);
      }, 3600);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-4 right-4 z-[110] flex flex-col gap-2 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
      >
        {toasts.map((toast) => {
          const styles =
            toast.variant === 'error'
              ? 'border-[var(--status-error-border)] bg-[var(--surface-card)] text-[var(--text-primary)]'
              : toast.variant === 'info'
                ? 'border-[var(--status-info-border)] bg-[var(--surface-card)] text-[var(--text-primary)]'
                : 'border-[var(--status-success-border)] bg-[var(--surface-card)] text-[var(--text-primary)]';

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto animate-toast-in rounded-[12px] border px-3.5 py-3 shadow-[var(--shadow-elevated)] flex items-start gap-2.5 text-xs font-medium ${styles}`}
            >
              {toast.variant === 'error' ? (
                <AlertCircle
                  className="h-4 w-4 text-[var(--status-error)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : toast.variant === 'info' ? (
                <Info
                  className="h-4 w-4 text-[var(--status-info)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              ) : (
                <CheckCircle2
                  className="h-4 w-4 text-[var(--status-success)] shrink-0 mt-0.5"
                  aria-hidden="true"
                />
              )}
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Fechar notificação"
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
