import { useState } from "react";
import { errorMessage } from "../lib/helpers";
import { useToast } from "./toast";

/**
 * Compact whole-number "Order" box. Saves on Enter or when focus leaves;
 * Escape restores the saved value. Lower numbers come first.
 */
export function OrderInput({ value, label, onCommit }: {
  value: number;
  /** Accessible name, e.g. "Order for Photos". */
  label: string;
  onCommit: (next: number) => Promise<unknown> | void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit() {
    if (draft === null) return;
    const next = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(next)) {
      toast.error("Order must be a whole number.");
      setDraft(null);
      return;
    }
    if (next === value) {
      setDraft(null);
      return;
    }
    setSaving(true);
    try {
      await onCommit(next);
    } catch (error) {
      toast.error(errorMessage(error, "Could not save the order"));
    } finally {
      setDraft(null);
      setSaving(false);
    }
  }

  return (
    <label className="order-input" title="Order: lower numbers come first">
      <span aria-hidden="true">#</span>
      <input
        type="number"
        step={1}
        inputMode="numeric"
        value={draft ?? String(value)}
        aria-label={label}
        disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
          }
        }}
      />
    </label>
  );
}
