import { cn } from "../../lib/utils";

export function Switch({ checked, onCheckedChange, disabled, className, ...aria }: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn("switch", className)}
      onClick={() => onCheckedChange(!checked)}
      {...aria}
    >
      <span className="switch-thumb" />
    </button>
  );
}
