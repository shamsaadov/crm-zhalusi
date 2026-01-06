import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { OrderWithRelations } from "./types";

interface DeleteOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithRelations | null;
  onConfirm: () => void;
  isPending: boolean;
}

export function DeleteOrderDialog({
  open,
  onOpenChange,
  order,
  onConfirm,
  isPending,
}: DeleteOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Удалить заказ?</DialogTitle>
        </DialogHeader>
        <p>
          Вы уверены, что хотите удалить заказ #{order?.orderNumber}? Это
          действие необратимо.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="button-confirm-delete"
          >
            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Удалить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


