// Подтверждение в стиле УЭС (ues-confirm).

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-[13.5px] text-[var(--ues-muted)]">{text}</p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="ues-btn" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="ues-btn danger !border-[var(--ues-danger)]" onClick={onConfirm} data-testid="button-confirm">
            {confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
