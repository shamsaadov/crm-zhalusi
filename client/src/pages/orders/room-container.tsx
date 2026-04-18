import { useEffect, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import type { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Plus, Trash2, ChevronDown, ChevronRight, Home, Pencil, Check } from "lucide-react";
import type { Fabric } from "@shared/schema";
import type { OrderFormValues } from "./schemas";
import type { SystemWithComponents } from "./types";
import { SashFields } from "./sash-fields";

interface RoomContainerProps {
  roomId: number;
  roomName: string;
  sashIndices: number[];
  fields: { id: string }[];
  form: UseFormReturn<OrderFormValues>;
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  totalFields: number;
  autoEdit: boolean;
  canDelete: boolean;
  onRemoveSash: (index: number) => void;
  onRenameRoom: (newName: string) => void;
  onDeleteRoom: () => void;
  onAddSash: () => void;
  onAutoEditConsumed: () => void;
  calculatingSashes?: Set<number>;
}

export function RoomContainer({
  roomId,
  roomName,
  sashIndices,
  fields,
  form,
  systems,
  fabrics,
  totalFields,
  autoEdit,
  canDelete,
  onRemoveSash,
  onRenameRoom,
  onDeleteRoom,
  onAddSash,
  onAutoEditConsumed,
  calculatingSashes,
}: RoomContainerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(roomName);

  const droppableId = `room-${roomId}`;
  const { isOver, setNodeRef } = useDroppable({ id: droppableId });

  // Enter edit mode exactly once when parent signals autoEdit=true,
  // then notify parent to clear the flag so we don't re-trigger.
  useEffect(() => {
    if (autoEdit) {
      setEditName("");
      setEditing(true);
      onAutoEditConsumed();
    }
  }, [autoEdit, onAutoEditConsumed]);

  const isNamed = roomName !== "";

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "border rounded-lg transition-colors",
        isOver && "border-primary/50 bg-primary/5",
        !isOver && "border-border"
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 rounded-t-lg">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="text-muted-foreground hover:text-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        <Home className="h-3.5 w-3.5 text-muted-foreground" />

        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-6 w-32 text-xs"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onRenameRoom(editName.trim());
                  setEditing(false);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              onBlur={() => {
                onRenameRoom(editName.trim());
                setEditing(false);
              }}
            />
            <button
              type="button"
              onClick={() => {
                onRenameRoom(editName.trim());
                setEditing(false);
              }}
            >
              <Check className="h-3.5 w-3.5 text-green-600" />
            </button>
          </div>
        ) : (
          <span
            className={cn("text-sm cursor-default", isNamed ? "font-medium" : "text-muted-foreground italic")}
            onDoubleClick={() => {
              setEditName(roomName);
              setEditing(true);
            }}
          >
            {isNamed ? roomName : "Название комнаты (двойной клик)"}
          </span>
        )}

        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {sashIndices.length}
        </Badge>

        <div className="flex-1" />

        {!editing && (
          <>
            <button
              type="button"
              onClick={() => { setEditName(roomName); setEditing(true); }}
              className="text-muted-foreground hover:text-foreground"
              title="Переименовать"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onDeleteRoom}
              disabled={!canDelete}
              className="text-muted-foreground hover:text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
              title={canDelete ? "Удалить комнату" : "Это единственная комната — её нельзя удалить"}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Sashes */}
      {!collapsed && (
        <div className="p-2 space-y-1.5">
          {sashIndices.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">
              Перетащите створки сюда
            </p>
          )}
          {sashIndices.map((sashIndex) => (
            <SashFields
              key={fields[sashIndex]?.id || sashIndex}
              index={sashIndex}
              form={form}
              systems={systems}
              fabrics={fabrics}
              fieldsLength={totalFields}
              fieldId={fields[sashIndex]?.id || String(sashIndex)}
              onRemove={onRemoveSash}
              isCalculating={calculatingSashes?.has(sashIndex) || false}
            />
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full text-xs h-7"
            onClick={(e) => {
              const btn = e.currentTarget;
              onAddSash();
              // После append форма перерисовывается, новая створка вставляется
              // ПЕРЕД кнопкой — без этого scrollIntoView браузер может
              // прокрутить фокус куда угодно (Radix focus-trap), и длинный
              // список выкидывает в начало.
              requestAnimationFrame(() => {
                btn.scrollIntoView({ block: "nearest", behavior: "smooth" });
              });
            }}
          >
            <Plus className="h-3 w-3 mr-1" />
            Створка
          </Button>
        </div>
      )}
    </div>
  );
}
