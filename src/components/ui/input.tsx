import * as React from "react";
import { cn } from "../../lib/utils";

const controlClass =
  "w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-4 focus:ring-primary/15 disabled:opacity-60";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) =>
  <input ref={ref} className={cn(controlClass, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) =>
  <textarea ref={ref} className={cn(controlClass, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) =>
  <select ref={ref} className={cn(controlClass, "h-10 cursor-pointer pr-8", className)} {...props} />,
);
Select.displayName = "Select";

/** Label + control + optional hint, laid out consistently across all forms. */
export function Field({ label, hint, children, className, style }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <label className={cn("field", className)} style={style}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}
