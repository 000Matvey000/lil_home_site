import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/button";
import { useToast } from "./toast";
import { errorMessage } from "../lib/helpers";

/** Wraps a trigger (usually a delete button) with an "Are you sure?" step. */
export function ConfirmDialog({ children, title, description, confirmLabel = "Delete", onConfirm }: {
  children: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => Promise<unknown> | void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error, "Action failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-sm" role="alertdialog">
          <Dialog.Title className="dialog-title">{title}</Dialog.Title>
          <Dialog.Description className="dialog-description">{description ?? "This cannot be undone."}</Dialog.Description>
          <div className="dialog-actions">
            <Dialog.Close asChild><Button variant="outline" disabled={pending}>Cancel</Button></Dialog.Close>
            <Button variant="destructive" onClick={confirm} disabled={pending}>{pending ? "Working…" : confirmLabel}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
