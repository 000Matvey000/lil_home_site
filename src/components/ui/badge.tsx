import { cn } from "../../lib/utils";

const tones = {
  neutral: "bg-muted text-muted-foreground",
  primary: "bg-primary/12 text-primary",
  success: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
} as const;

export function Badge({ className, children, style, title, tone = "neutral" }: {
  className?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  title?: string;
  tone?: keyof typeof tones;
}) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)} style={style} title={title}>{children}</span>;
}
