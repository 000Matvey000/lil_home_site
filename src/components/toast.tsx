import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { toFriendlyErrorMessage } from "../lib/helpers";

type ToastKind = "success" | "error" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };
type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);
const DURATION: Record<ToastKind, number> = { success: 2800, info: 3600, error: 6000 };

/**
 * One notification system for the whole app (replaces the old inline error
 * banner, the top-of-screen error toast, and the Integration page's own toast,
 * which used to show the same error twice).
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);

  const push = useCallback((kind: ToastKind, raw: string) => {
    const message = kind === "error" ? toFriendlyErrorMessage(raw) : raw;
    setItems((current) => {
      // Collapse identical messages instead of stacking duplicates.
      const withoutDuplicate = current.filter((item) => !(item.kind === kind && item.message === message));
      return [...withoutDuplicate, { id: nextId.current++, kind, message }].slice(-4);
    });
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (message) => push("success", message),
    error: (message) => push("error", message),
    info: (message) => push("info", message),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" aria-live="polite">
        {items.map((item) => <ToastView key={item.id} item={item} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), DURATION[item.kind]);
    return () => window.clearTimeout(timer);
  }, [item.id, item.kind, onDismiss]);
  const Icon = item.kind === "success" ? CheckCircle2 : item.kind === "error" ? AlertTriangle : Info;
  return (
    <div className="toast" data-kind={item.kind} role={item.kind === "error" ? "alert" : "status"}>
      <Icon size={18} className="toast-icon" />
      <span className="toast-message">{item.message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => onDismiss(item.id)}><X size={15} /></button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
