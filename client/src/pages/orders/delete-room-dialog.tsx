import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import type { Room } from "./types";

interface DeleteRoomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: Room | null;
  sashCount: number;
  otherRooms: Room[];
  onConfirm: (moveSashesTo: number | null) => void;
}

const DELETE_VALUE = "__delete__";

function sashWord(n: number): string {
  if (n % 10 === 1 && n % 100 !== 11) return "створка";
  if ([2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100))
    return "створки";
  return "створок";
}

export function DeleteRoomDialog({
  open,
  onOpenChange,
  room,
  sashCount,
  otherRooms,
  onConfirm,
}: DeleteRoomDialogProps) {
  const [selected, setSelected] = useState<string>(DELETE_VALUE);

  useEffect(() => {
    if (!open) return;
    setSelected(
      otherRooms.length > 0 ? String(otherRooms[0].id) : DELETE_VALUE
    );
    // Intentionally depend only on `open`: we want to reset the selection once
    // per dialog opening, not every time the parent re-renders a fresh
    // `otherRooms` reference. If the selected room is removed from
    // `otherRooms` mid-dialog (very unlikely), the next `open` cycle fixes it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!room) return null;

  const displayName = room.name || "без названия";

  const handleApply = () => {
    if (selected === DELETE_VALUE) {
      onConfirm(null);
    } else {
      onConfirm(parseInt(selected, 10));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Удалить комнату «{displayName}»?</DialogTitle>
          <DialogDescription>
            В ней {sashCount} {sashWord(sashCount)}. Выбери, что с ними делать:
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selected}
          onValueChange={setSelected}
          className="gap-3 py-2"
        >
          {otherRooms.map((r) => (
            <Label
              key={r.id}
              htmlFor={`move-to-${r.id}`}
              className="flex items-center gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm cursor-pointer hover:bg-muted/50"
            >
              <RadioGroupItem value={String(r.id)} id={`move-to-${r.id}`} />
              <span>
                Перенести в <b>{r.name || "без названия"}</b>
              </span>
            </Label>
          ))}
          <Label
            htmlFor="move-to-delete"
            className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm cursor-pointer hover:bg-destructive/10"
          >
            <RadioGroupItem value={DELETE_VALUE} id="move-to-delete" />
            <span className="text-destructive font-medium">
              Удалить вместе со створками
            </span>
          </Label>
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={handleApply}>Применить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
