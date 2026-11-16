export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastPayload {
  id: string;
  variant: ToastVariant;
  message: string;
  durationMs?: number;
}

const TOAST_EVENT = 'portal_app_toast';

function emitToast(variant: ToastVariant, message: string, durationMs = 4200) {
  if (typeof window === 'undefined') return;
  const payload: ToastPayload = {
    id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    variant,
    message,
    durationMs,
  };
  window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: payload }));
}

export const toast = {
  success: (message: string, durationMs?: number) => emitToast('success', message, durationMs),
  error: (message: string, durationMs?: number) => emitToast('error', message, durationMs ?? 5500),
  warning: (message: string, durationMs?: number) => emitToast('warning', message, durationMs ?? 5000),
  info: (message: string, durationMs?: number) => emitToast('info', message, durationMs),
  EVENT_NAME: TOAST_EVENT,
};
