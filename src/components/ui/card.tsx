import * as React from "react";
import { cn } from "../../lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("surface rounded-2xl border border-border bg-card text-foreground", className)} {...props} />;
}

/** A titled settings panel used throughout the admin area. */
export function Panel({ title, description, icon, actions, children, className }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("panel", className)}>
      <div className="panel-header">
        <div className="panel-heading">
          {icon && <span className="panel-icon">{icon}</span>}
          <div>
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </div>
      <div className="panel-body">{children}</div>
    </Card>
  );
}
