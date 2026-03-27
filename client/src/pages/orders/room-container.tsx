import { useState } from "react";
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
  roomName: string;
  droppableId: string;
  isDefault: boolean;
  sashIndices: number[];
  fields: { id: string }[];
  form: UseFormReturn<OrderFormValues>;
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  totalFields: number;
  onRemoveSash: (index: number) => void;
  onRenameRoom: (newName: string) => void;
  onDeleteRoom: () => void;
  onAddSash: () => void;
  calculatingSashes?: Set<number>;
}

export function RoomContainer({
  roomName,
  droppableId,
  isDefault,
  sashIndices,
  fields,
  form,
  systems,
  fabrics,
  totalFields,
  onRemoveSash,
  onRenameRoom,
  onDeleteRoom,
  onAddSash,
  calculatingSashes,
}: RoomContainerProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(roomName);

  const { isOver, setNodeRef } = useDroppable({
    id: droppableId,
  });

  const displayName = isDefault ? "Общее" : roomName;

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
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              if (editName.trim() && editName.trim() !== roomName) {
                onRenameRoom(editName.trim());
              }
              setEditing(false);
            }}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-6 w-32 text-xs"
              autoFocus
              onBlur={() => {
                if (editName.trim() && editName.trim() !== roomName) {
                  onRenameRoom(editName.trim());
                }
                setEditing(false);
              }}
            />
            <button type="submit"><Check className="h-3.5 w-3.5 text-green-600" /></button>
          </form>
        ) : (
          <span
            className="text-sm font-medium cursor-default"
            onDoubleClick={() => {
              setEditName(displayName);
              setEditing(true);
            }}
          >
            {displayName}
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
              onClick={() => { setEditName(displayName); setEditing(true); }}
              className="text-muted-foreground hover:text-foreground"
              title="Переименовать"
            >
              <Pencil className="h-3 w-3" />
            </button>
            {!isDefault && (
              <button
                type="button"
                onClick={onDeleteRoom}
                className="text-muted-foreground hover:text-red-500"
                title="Удалить комнату (створки переместятся в Общее)"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
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
            onClick={onAddSash}
          >
            <Plus className="h-3 w-3 mr-1" />
            Створка
          </Button>
        </div>
      )}
    </div>
  );
}
