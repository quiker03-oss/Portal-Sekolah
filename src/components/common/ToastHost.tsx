import React, { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { toast, ToastPayload } from '../../utils/toast';

export const ToastHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    const handleToast = (e: Event) => {
      const custom = e as CustomEvent<ToastPayload>;
      const detail = custom.detail;
      if (!detail || !detail.message) return;

      setToasts((prev) => [...prev.slice(-3), detail]);

      const duration = detail.durationMs ?? 4200;
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== detail.id));
      }, duration);
    };

    window.addEventListener(toast.EVENT_NAME, handleToast);
    return () => window.removeEventListener(toast.EVENT_NAME, handleToast);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toasts.map((t) => {
        const styles =
          t.variant === 'success'
            ? 'bg-emerald-950/95 border-emerald-700 text-emerald-50'
            : t.variant === 'error'
            ? 'bg-rose-950/95 border-rose-700 text-rose-50'
            : t.variant === 'warning'
            ? 'bg-amber-950/95 border-amber-700 text-amber-50'
            : 'bg-slate-900/95 border-slate-700 text-slate-50';

        const Icon =
          t.variant === 'success'
            ? CheckCircle2
            : t.variant === 'error'
            ? XCircle
            : t.variant === 'warning'
            ? AlertTriangle
            : Info;

        const iconColor =
          t.variant === 'success'
            ? 'text-emerald-400'
            : t.variant === 'error'
            ? 'text-rose-400'
            : t.variant === 'warning'
            ? 'text-amber-400'
            : 'text-sky-400';

        return (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md flex items-start gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200 ${styles}`}
          >
            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
            <p className="text-xs font-medium leading-relaxed flex-1 whitespace-pre-line">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="text-white/60 hover:text-white p-0.5 rounded-lg cursor-pointer"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
