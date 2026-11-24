import { cn } from "../../lib/utils";

export function Badge({ className, children, style }: { className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", className)} style={style}>{children}</span>;
}
