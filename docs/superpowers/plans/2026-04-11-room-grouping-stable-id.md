# Room Grouping Stable-ID Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Переводим группировку створок в форме заказа с ключа «имя комнаты» на стабильный integer-ID (поле `sash.room`), чтобы починить баг «пустой клон при переименовании первой комнаты». UX двойного клика остаётся.

**Architecture:** `useRoomGroups` меняет внутреннее состояние на `Room[]` с `{id, name}`. Группировка идёт по `sash.room` (integer). Имя `roomName` становится только display-значением. Добавляется нормализация входящих данных при редактировании и импорте из замера. Удаление комнаты со створками идёт через новую модалку `DeleteRoomDialog`.

**Tech Stack:** React + TypeScript, react-hook-form + `useFieldArray` + `useWatch`, `@dnd-kit/core`, shadcn UI (Dialog, RadioGroup, Button, Input), lucide-react. Проект использует `npm run check` (tsc) для валидации типов; тестового фреймворка нет.

**Spec:** [`docs/superpowers/specs/2026-04-11-room-grouping-stable-id-design.md`](../specs/2026-04-11-room-grouping-stable-id-design.md)

---

## File Structure

**Новые файлы:**

- `client/src/pages/orders/normalize-sash-rooms.ts` — чистая функция нормализации: присваивает `sash.room` по группам `sash.roomName`. Используется из `index.tsx` при открытии редактирования и импорте из замера.
- `client/src/pages/orders/delete-room-dialog.tsx` — модалка «куда перенести створки при удалении комнаты».

**Изменяемые файлы:**

- `client/src/pages/orders/types.ts` — добавить экспорт интерфейса `Room`.
- `client/src/pages/orders/use-room-groups.ts` — полный переписывается: новое состояние, API по ID, `seedRooms`, `useWatch`, `autoEditRoomId`.
- `client/src/pages/orders/room-container.tsx` — пропы `roomName`/`droppableId`/`isDefault` → `roomId`/`roomName`/`autoEdit`/`canDelete`, `droppableId` строится внутри, `useEffect` на autoEdit.
- `client/src/pages/orders/order-form.tsx` — убрать popover «+ Комната», использовать новый API хука, принять `resetToken`, держать state модалки удаления и `autoEditRoomId`-трекер.
- `client/src/pages/orders/index.tsx` — добавить `resetToken` state, применять `normalizeSashRooms` в `openEditDialog` и `openFromMeasurement`, проставлять `roomName: ""` в initial/reset состояниях, прокидывать `resetToken` в `<OrderForm>`.

---

## Task 1: Add `Room` type to shared types

**Files:**
- Modify: `client/src/pages/orders/types.ts` (append new interface near line 97)

- [ ] **Step 1: Add `Room` interface**

Open `client/src/pages/orders/types.ts` and append at the end of the file (after the `CostCalculationDetails` interface, around line 96):

```ts
export interface Room {
  id: number;
  name: string;
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: PASS (no new errors; existing code doesn't use `Room` yet).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/orders/types.ts
git commit -m "refactor(orders): add Room type for stable room-ID grouping"
```

---

## Task 2: Create `normalizeSashRooms` helper

**Files:**
- Create: `client/src/pages/orders/normalize-sash-rooms.ts`

- [ ] **Step 1: Create the helper**

Create `client/src/pages/orders/normalize-sash-rooms.ts` with the following content:

```ts
/**
 * Нормализует поле `room` в списке створок: группирует по ключу `roomName`
 * (пустое значение → своя группа) и присваивает каждой уникальной группе
 * стабильный integer-ID (1, 2, 3, ...).
 *
 * Используется при входе в форму редактирования заказа и при импорте
 * заказа из мобильного замера — чтобы UI-группировка по `sash.room`
 * всегда совпадала с логической группировкой по `sash.roomName`,
 * даже если в БД `room` лежит как попало (в частности у старых заказов,
 * где все створки имеют `room=1`).
 *
 * Возвращает новый массив; исходный не мутирует.
 */
export function normalizeSashRooms<
  T extends { roomName?: string | null; room?: number | null }
>(sashes: T[]): T[] {
  const keyToId = new Map<string, number>();
  return sashes.map((s) => {
    const key = (s.roomName ?? "").trim();
    let id = keyToId.get(key);
    if (id === undefined) {
      id = keyToId.size + 1;
      keyToId.set(key, id);
    }
    return { ...s, room: id };
  });
}
```

- [ ] **Step 2: Inline sanity check**

Read the code once with fresh eyes and confirm these properties hold:

- Empty array input → empty array output.
- All sashes with `roomName === ""` → все получают `room: 1`.
- Sashes `["Кухня", "Спальня", "Кухня", ""]` → rooms `[1, 2, 1, 3]`.
- Input with `room: 99` values → rewritten, integer IDs resequence from 1.
- Original array is not mutated.

No code changes; just mental check.

- [ ] **Step 3: Run typecheck**

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/orders/normalize-sash-rooms.ts
git commit -m "feat(orders): add normalizeSashRooms helper to assign stable room IDs by roomName groups"
```

---

## Task 3: Create `DeleteRoomDialog` component

**Files:**
- Create: `client/src/pages/orders/delete-room-dialog.tsx`

- [ ] **Step 1: Create the component**

Create `client/src/pages/orders/delete-room-dialog.tsx` with the following content:

```tsx
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
    if (open) {
      setSelected(
        otherRooms.length > 0 ? String(otherRooms[0].id) : DELETE_VALUE
      );
    }
  }, [open, otherRooms]);

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
```

- [ ] **Step 2: Run typecheck**

```bash
npm run check
```

Expected: PASS. The component is standalone and not yet imported anywhere.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/orders/delete-room-dialog.tsx
git commit -m "feat(orders): add DeleteRoomDialog for room deletion with sash move options"
```

---

## Task 4: Rewrite `useRoomGroups` hook

**Files:**
- Modify (full rewrite): `client/src/pages/orders/use-room-groups.ts`

> NOTE: This task breaks callers (`order-form.tsx`, `index.tsx`) until Tasks 5–7 land. Do not run `npm run check` or commit until Task 7. This is a coordinated refactor — all four files must be updated together before the project compiles again.

- [ ] **Step 1: Replace file content**

Replace the **entire** content of `client/src/pages/orders/use-room-groups.ts` with:

```ts
import { useCallback, useState } from "react";
import {
  useWatch,
  type UseFormReturn,
  type UseFieldArrayReturn,
} from "react-hook-form";
import type { OrderFormValues, SashFormValues } from "./schemas";
import type { Room } from "./types";

export interface RoomGroup {
  room: Room;
  sashIndices: number[];
}

const DEFAULT_ROOM: Room = { id: 1, name: "" };

/**
 * Управляет группировкой створок по комнатам в форме заказа.
 *
 * Внутреннее состояние: массив `Room[]` с уникальными integer-ID.
 * Группировка идёт по `sash.room` (integer), а не по `sash.roomName`,
 * что даёт стабильную идентичность комнаты — rename не создаёт «клона».
 *
 * См. spec: docs/superpowers/specs/2026-04-11-room-grouping-stable-id-design.md
 */
export function useRoomGroups(
  form: UseFormReturn<OrderFormValues>,
  fieldArray: UseFieldArrayReturn<OrderFormValues, "sashes">
) {
  const [rooms, setRooms] = useState<Room[]>([DEFAULT_ROOM]);
  const [autoEditRoomId, setAutoEditRoomId] = useState<number | null>(null);

  // Reactive subscription to sashes — rerenders the hook's consumers on any
  // sash mutation (room change, append, remove). Without this, moveSash()
  // would update form values without triggering a rerender.
  const watchedSashes =
    (useWatch({ control: form.control, name: "sashes" }) as
      | SashFormValues[]
      | undefined) ?? [];

  const nextRoomId = useCallback((): number => {
    if (rooms.length === 0) return 1;
    return Math.max(...rooms.map((r) => r.id)) + 1;
  }, [rooms]);

  // Derived every render from `rooms` + watched sashes.
  const roomGroups: RoomGroup[] = rooms.map((room) => ({
    room,
    sashIndices: watchedSashes
      .map((s, i) => ((s?.room ?? 1) === room.id ? i : -1))
      .filter((i) => i >= 0),
  }));

  /**
   * Rebuild the `rooms` state from the given sashes. Call after `form.reset()`.
   * Groups by `sash.room` (integer); uses the first sash's `roomName` per
   * group. If no sashes — falls back to a single empty default room.
   */
  const seedRooms = useCallback((loaded: SashFormValues[] | undefined) => {
    if (!loaded || loaded.length === 0) {
      setRooms([DEFAULT_ROOM]);
      setAutoEditRoomId(null);
      return;
    }
    const byId = new Map<number, string>();
    loaded.forEach((s) => {
      const id = s.room ?? 1;
      if (!byId.has(id)) byId.set(id, s.roomName ?? "");
    });
    const derived: Room[] = Array.from(byId.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.id - b.id);
    setRooms(derived.length > 0 ? derived : [DEFAULT_ROOM]);
    setAutoEditRoomId(null);
  }, []);

  /**
   * Create a new room with a fresh ID and append one empty sash belonging
   * to it. Returns the new room ID. The caller (OrderForm) uses the returned
   * ID to auto-focus the rename input via `autoEditRoomId`.
   */
  const addRoom = useCallback((): number => {
    const id = nextRoomId();
    const current = form.getValues("sashes");
    const last = current[current.length - 1];
    fieldArray.append({
      width: "",
      height: "",
      quantity: "1",
      systemId: last?.systemId || "",
      controlSide: "",
      fabricId: last?.fabricId || "",
      sashPrice: "",
      sashCost: "",
      coefficient: "",
      isCalculating: false,
      room: id,
      roomName: "",
    });
    setRooms((prev) => [...prev, { id, name: "" }]);
    setAutoEditRoomId(id);
    return id;
  }, [fieldArray, form, nextRoomId]);

  /**
   * Rename a room by ID. Updates display name in `rooms` state and syncs
   * `sash.roomName` for every sash belonging to this room.
   */
  const renameRoom = useCallback(
    (roomId: number, newName: string) => {
      const trimmed = newName.trim();
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, name: trimmed } : r))
      );
      const current = form.getValues("sashes");
      current.forEach((s, i) => {
        if ((s.room ?? 1) === roomId) {
          form.setValue(`sashes.${i}.roomName`, trimmed, {
            shouldValidate: false,
          });
        }
      });
    },
    [form]
  );

  /**
   * Remove a room.
   * - If `moveSashesTo` is a number — reassigns all affected sashes to that room.
   * - If `moveSashesTo === null` — removes the affected sashes from the array.
   * - If the room has no sashes — neither parameter matters; the room is just dropped.
   *
   * Refuses to remove the last remaining room (form always needs at least one).
   */
  const removeRoom = useCallback(
    (roomId: number, moveSashesTo?: number | null) => {
      if (rooms.length <= 1) return;
      const current = form.getValues("sashes");
      const belongsToDeleted = (idx: number) =>
        (current[idx]?.room ?? 1) === roomId;
      const affectedIndices = current
        .map((_, i) => i)
        .filter((i) => belongsToDeleted(i));

      if (affectedIndices.length === 0) {
        setRooms((prev) => prev.filter((r) => r.id !== roomId));
        return;
      }

      if (moveSashesTo === null) {
        fieldArray.remove(affectedIndices);
      } else if (typeof moveSashesTo === "number") {
        const target = rooms.find((r) => r.id === moveSashesTo);
        const targetName = target?.name ?? "";
        affectedIndices.forEach((i) => {
          form.setValue(`sashes.${i}.room`, moveSashesTo, {
            shouldValidate: false,
          });
          form.setValue(`sashes.${i}.roomName`, targetName, {
            shouldValidate: false,
          });
        });
      } else {
        // Safety: if caller forgot to specify, treat as "move to first other room".
        const fallback = rooms.find((r) => r.id !== roomId);
        if (!fallback) return;
        affectedIndices.forEach((i) => {
          form.setValue(`sashes.${i}.room`, fallback.id, {
            shouldValidate: false,
          });
          form.setValue(`sashes.${i}.roomName`, fallback.name, {
            shouldValidate: false,
          });
        });
      }

      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    },
    [fieldArray, form, rooms]
  );

  /**
   * Move a single sash to a different room by updating `sash.room` and
   * `sash.roomName`. Used by drag-and-drop.
   */
  const moveSash = useCallback(
    (sashIndex: number, targetRoomId: number) => {
      const target = rooms.find((r) => r.id === targetRoomId);
      if (!target) return;
      form.setValue(`sashes.${sashIndex}.room`, targetRoomId, {
        shouldValidate: false,
      });
      form.setValue(`sashes.${sashIndex}.roomName`, target.name ?? "", {
        shouldValidate: false,
      });
    },
    [form, rooms]
  );

  const clearAutoEdit = useCallback(() => setAutoEditRoomId(null), []);

  return {
    roomGroups,
    rooms,
    addRoom,
    renameRoom,
    removeRoom,
    moveSash,
    seedRooms,
    autoEditRoomId,
    clearAutoEdit,
  };
}
```

- [ ] **Step 2: DO NOT run tsc yet**

The project will not compile until Tasks 5, 6, 7 land. Proceed directly to Task 5 without a typecheck or commit.

---

## Task 5: Update `RoomContainer`

**Files:**
- Modify: `client/src/pages/orders/room-container.tsx`

- [ ] **Step 1: Replace imports and props interface**

Replace the import line that pulls `useState` from `"react"` (line 1) with:

```tsx
import { useEffect, useState } from "react";
```

Replace the entire `RoomContainerProps` interface and the exported function signature (lines 14–46) with:

```tsx
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
```

- [ ] **Step 2: Replace the body prelude (collapsed/editing state + droppable + isDefault removal)**

Find the block starting at the old `const [collapsed, setCollapsed] = useState(false);` (was line 47). Replace the whole section (lines 47–56 in the old file — `collapsed`, `editing`, `editName`, `useDroppable`, `displayName`) with:

```tsx
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
```

- [ ] **Step 3: Update the header rename block (remove `displayName`, use `roomName` / `isNamed`)**

In the header JSX, replace the `{editing ? (...) : (...)}` block that currently uses `displayName` with:

```tsx
        {editing ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              onRenameRoom(editName.trim());
              setEditing(false);
            }}
          >
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="h-6 w-32 text-xs"
              autoFocus
              onBlur={() => {
                onRenameRoom(editName.trim());
                setEditing(false);
              }}
            />
            <button type="submit"><Check className="h-3.5 w-3.5 text-green-600" /></button>
          </form>
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
```

- [ ] **Step 4: Replace the edit/trash button block (remove `isDefault` gating, use `canDelete`)**

Replace the block starting at `{!editing && (` through the closing `)}` that currently wraps the edit/trash buttons. Use:

```tsx
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
```

- [ ] **Step 5: Remove unused imports**

At the top of the file, the old imports included `Home`. Verify `Home` is still used in the header (yes — `<Home className="h-3.5 w-3.5 text-muted-foreground" />` remains). No import changes needed beyond Step 1.

Verify the file no longer references `isDefault` anywhere.

- [ ] **Step 6: DO NOT run tsc yet**

Proceed to Task 6.

---

## Task 6: Update `OrderForm`

**Files:**
- Modify: `client/src/pages/orders/order-form.tsx`

- [ ] **Step 1: Update imports**

At the top of `order-form.tsx`, update the imports block:

- Remove `Popover, PopoverContent, PopoverTrigger` import if it's only used for the "Комната" popover (it's also used for "isPaidPopover" and "showQuickDealer" — keep it).
- Remove the unused `Home` icon import check — actually it's used inside the room add button. Keep it.
- Add the import for `DeleteRoomDialog` and `Room`:

Append to the local imports at the bottom of the import section:

```tsx
import { DeleteRoomDialog } from "./delete-room-dialog";
import type { Room } from "./types";
```

- [ ] **Step 2: Update `OrderFormProps` interface**

Find the `OrderFormProps` interface (near line 60) and add one new field:

```tsx
interface OrderFormProps {
  form: UseFormReturn<OrderFormValues>;
  fieldArray: UseFieldArrayReturn<OrderFormValues, "sashes">;
  dealers: (Dealer & { balance: number })[];
  systems: SystemWithComponents[];
  fabrics: Fabric[];
  fabricStock: FabricWithStock[];
  componentStock: ComponentWithStock[];
  cashboxes: Cashbox[];
  isEditing: boolean;
  isPending: boolean;
  resetToken: number;
  onSubmit: (data: OrderFormValues) => void;
  onCancel: () => void;
  onShowCostCalculation: (details: CostCalculationDetails) => void;
  onSashRemove?: (index: number) => void;
  calculatingSashes?: Set<number>;
  isManualSalePrice?: boolean;
  onManualSalePriceChange?: (isManual: boolean) => void;
}
```

Add `resetToken` to the destructured `OrderForm` function params (in the same order):

```tsx
export function OrderForm({
  form,
  fieldArray,
  dealers,
  systems,
  fabrics,
  fabricStock,
  componentStock,
  cashboxes,
  isEditing,
  isPending,
  resetToken,
  onSubmit,
  onCancel,
  onShowCostCalculation,
  onSashRemove,
  calculatingSashes,
  isManualSalePrice = false,
  onManualSalePriceChange,
}: OrderFormProps) {
```

- [ ] **Step 3: Replace the hook call and remove old state**

Replace the existing line that calls `useRoomGroups`:

```tsx
const { rooms, addRoom, renameRoom, removeRoom, moveSash, bump } = useRoomGroups(form, fields);
```

with:

```tsx
const {
  roomGroups,
  rooms,
  addRoom,
  renameRoom,
  removeRoom,
  moveSash,
  seedRooms,
  autoEditRoomId,
  clearAutoEdit,
} = useRoomGroups(form, fieldArray);
```

Remove the two state lines immediately below (they become unused):

```tsx
const [showAddRoom, setShowAddRoom] = useState(false);
const [newRoomName, setNewRoomName] = useState("");
```

Add a new state for the delete dialog right after the hook call:

```tsx
const [deleteDialog, setDeleteDialog] = useState<{
  room: Room;
  sashCount: number;
} | null>(null);
```

- [ ] **Step 4: Seed rooms on `resetToken` change**

Add a new `useEffect` right after the delete-dialog state:

```tsx
useEffect(() => {
  seedRooms(form.getValues("sashes"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [resetToken]);
```

Make sure `useEffect` is imported from React (at the top of the file):

```tsx
import { useState, useEffect, useCallback } from "react";
```

(The original file imports `useState, useCallback` — just add `useEffect`.)

- [ ] **Step 5: Rewrite the droppable-ID helpers and drag-end handler**

Find and delete the three lines:

```tsx
const DEFAULT_ROOM_ID = "__default__";
const toDroppableId = (roomName: string) => roomName || DEFAULT_ROOM_ID;
const fromDroppableId = (id: string) => id === DEFAULT_ROOM_ID ? "" : id;
```

Replace the existing `handleDragEnd` callback with:

```tsx
const handleDragEnd = useCallback((event: DragEndEvent) => {
  const { active, over } = event;
  if (!over) return;
  const sashIndex = active.data.current?.index as number | undefined;
  const overId = String(over.id);
  if (!overId.startsWith("room-")) return;
  const targetRoomId = parseInt(overId.slice("room-".length), 10);
  if (Number.isNaN(targetRoomId)) return;
  if (sashIndex !== undefined) {
    moveSash(sashIndex, targetRoomId);
  }
}, [moveSash]);
```

- [ ] **Step 6: Replace the "Комната" button popover with a plain click-to-add button**

Find the block that starts with:

```tsx
<Popover open={showAddRoom} onOpenChange={setShowAddRoom}>
  <PopoverTrigger asChild>
    <Button type="button" variant="outline" size="sm" className="gap-1.5">
      <Home className="h-3.5 w-3.5" />
      Комната
    </Button>
  </PopoverTrigger>
  ...
</Popover>
```

Replace the entire `<Popover>...</Popover>` block with a single button:

```tsx
<Button
  type="button"
  variant="outline"
  size="sm"
  className="gap-1.5"
  onClick={() => {
    addRoom();
  }}
>
  <Home className="h-3.5 w-3.5" />
  Комната
</Button>
```

- [ ] **Step 7: Replace the `{rooms.map(...)}` loop with `{roomGroups.map(...)}` and new props**

Find the `<DndContext>...<RoomContainer ... /></DndContext>` block and replace it with:

```tsx
<DndContext sensors={sensors} onDragEnd={handleDragEnd} collisionDetection={pointerWithin}>
  <div className="space-y-3">
    {roomGroups.map((group) => {
      const sashCount = group.sashIndices.length;
      return (
        <RoomContainer
          key={`room-${group.room.id}`}
          roomId={group.room.id}
          roomName={group.room.name}
          sashIndices={group.sashIndices}
          fields={fields}
          form={form}
          systems={systems}
          fabrics={fabrics}
          totalFields={fields.length}
          autoEdit={autoEditRoomId === group.room.id}
          canDelete={rooms.length > 1}
          onRemoveSash={handleSashRemove}
          onRenameRoom={(newName) => renameRoom(group.room.id, newName)}
          onDeleteRoom={() => {
            if (rooms.length <= 1) return;
            if (sashCount === 0) {
              removeRoom(group.room.id);
            } else {
              setDeleteDialog({ room: group.room, sashCount });
            }
          }}
          onAddSash={() => {
            const sashes = form.getValues("sashes");
            const lastSash = sashes[sashes.length - 1];
            append({
              width: "",
              height: "",
              quantity: "1",
              systemId: lastSash?.systemId || "",
              controlSide: "",
              fabricId: lastSash?.fabricId || "",
              sashPrice: "",
              sashCost: "",
              coefficient: "",
              isCalculating: false,
              room: group.room.id,
              roomName: group.room.name,
            });
          }}
          onAutoEditConsumed={clearAutoEdit}
          calculatingSashes={calculatingSashes}
        />
      );
    })}
  </div>
</DndContext>
```

- [ ] **Step 8: Mount the delete dialog at the end of the form**

Just before the closing `</form>` tag (right before the final `</Form>` wrapper), add:

```tsx
<DeleteRoomDialog
  open={deleteDialog !== null}
  onOpenChange={(open) => {
    if (!open) setDeleteDialog(null);
  }}
  room={deleteDialog?.room ?? null}
  sashCount={deleteDialog?.sashCount ?? 0}
  otherRooms={rooms.filter((r) => r.id !== deleteDialog?.room.id)}
  onConfirm={(moveSashesTo) => {
    if (deleteDialog) {
      removeRoom(deleteDialog.room.id, moveSashesTo);
    }
    setDeleteDialog(null);
  }}
/>
```

- [ ] **Step 9: DO NOT run tsc yet**

Proceed to Task 7.

---

## Task 7: Update `index.tsx` (orders page)

**Files:**
- Modify: `client/src/pages/orders/index.tsx`

- [ ] **Step 1: Import the normalizer**

Add to the local imports at the top of the file (next to the `./order-form` import):

```tsx
import { normalizeSashRooms } from "./normalize-sash-rooms";
```

- [ ] **Step 2: Add `resetToken` state**

Find the group of state hooks near the top of `OrdersPage` (around line 99, after `isManualSalePrice` state). Add:

```tsx
const [resetToken, setResetToken] = useState(0);
```

- [ ] **Step 3: Update the form default values to include `roomName`**

Find `useForm<OrderFormValues>` defaults (around line 181). Change the first sash in `sashes` to include `roomName: ""`:

```tsx
sashes: [
  {
    width: "",
    height: "",
    quantity: "1",
    systemId: "",
    controlSide: "",
    fabricId: "",
    sashPrice: "",
    sashCost: "",
    coefficient: "",
    room: 1,
    roomName: "",
  },
],
```

- [ ] **Step 4: Normalize sashes in `openEditDialog`**

Find `openEditDialog` (around line 526). Locate the `const sashesData = (fullOrder.sashes || []).map(...)` block.

Wrap the mapping result in `normalizeSashRooms(...)`:

```tsx
const rawSashesData = (fullOrder.sashes || []).map((s) => ({
  width: s.width != null ? parseFloat(s.width.toString()).toString() : "",
  height: s.height != null ? parseFloat(s.height.toString()).toString() : "",
  systemId: s.systemId || "",
  controlSide: s.controlSide || "",
  fabricId: s.fabricId || "",
  sashPrice: s.sashPrice?.toString() || "",
  sashCost: s.sashCost?.toString() || "",
  coefficient: (s as any).coefficient?.toString() || "",
  isCalculating: false,
  quantity: "1",
  room: (s as any).room || 1,
  roomName: (s as any).roomName || "",
}));
const sashesData = normalizeSashRooms(rawSashesData);
```

Directly after `form.reset({...})` in the same function, add:

```tsx
setResetToken((t) => t + 1);
```

Also update the fallback sash used when `sashesData.length === 0` — add `roomName: ""` to it:

```tsx
sashes:
  sashesData.length > 0
    ? sashesData
    : [
        {
          width: "",
          height: "",
          quantity: "1",
          systemId: "",
          controlSide: "",
          fabricId: "",
          sashPrice: "",
          sashCost: "",
          coefficient: "",
          isCalculating: false,
          room: 1,
          roomName: "",
        },
      ],
```

- [ ] **Step 5: Normalize sashes in `openFromMeasurement`**

Find `openFromMeasurement` (around line 722). Wrap the mapped `sashes` array in `normalizeSashRooms(...)`:

```tsx
const rawSashes = (measurement.sashes || []).map((s) => ({
  width: s.width?.toString() || "",
  height: s.height?.toString() || "",
  quantity: "1",
  systemId: "",
  controlSide: s.control || "",
  fabricId: "",
  sashPrice: s.coefficient?.toString() || "",
  sashCost: "",
  coefficient: s.coefficient?.toString() || "",
  room: s.room || 1,
  roomName: s.roomName || "",
}));
const sashes = normalizeSashRooms(rawSashes);
```

After the `form.reset({...})` call in the same function, add:

```tsx
setResetToken((t) => t + 1);
```

Also update the empty-list fallback `sashes` in the `form.reset` call to add `roomName: ""`:

```tsx
sashes: sashes.length > 0 ? sashes : [{ width: "", height: "", quantity: "1", systemId: "", controlSide: "", fabricId: "", sashPrice: "", sashCost: "", coefficient: "", room: 1, roomName: "" }],
```

- [ ] **Step 6: Bump `resetToken` in `resetForms`**

Find `resetForms` (around line 681). After the `form.reset({...})` call, add:

```tsx
setResetToken((t) => t + 1);
```

Also update the single-sash default inside `form.reset` to include `roomName: ""`:

```tsx
sashes: [
  {
    width: "",
    height: "",
    quantity: "1",
    systemId: "",
    controlSide: "",
    fabricId: "",
    sashPrice: "",
    sashCost: "",
    coefficient: "",
    room: 1,
    roomName: "",
  },
],
```

- [ ] **Step 7: Pass `resetToken` to both `<OrderForm>` usages**

In both `<OrderForm ... />` JSX blocks (around lines 1128 and 1168), add the prop:

```tsx
resetToken={resetToken}
```

Place it alongside the other scalar props (e.g. right after `isPending={...}`).

- [ ] **Step 8: Run typecheck**

```bash
npm run check
```

Expected: PASS. If there are errors, fix them. Common issues to watch for:
- Missing `roomName` in sash literals elsewhere in the file — the field is optional in the zod schema, but adding it keeps consistency.
- Typo in prop names (`roomId` vs `roomid`).
- Unused imports from the removed popover (`showAddRoom`, `newRoomName`).

- [ ] **Step 9: Run lint/format if the project has one**

```bash
# If the project has a formatter, run it. Otherwise skip.
# Not configured in this repo — skip.
```

- [ ] **Step 10: Commit all coordinated changes**

```bash
git add \
  client/src/pages/orders/use-room-groups.ts \
  client/src/pages/orders/room-container.tsx \
  client/src/pages/orders/order-form.tsx \
  client/src/pages/orders/index.tsx
git commit -m "fix(orders): switch room grouping to stable integer ID

Room grouping in order form used roomName as identity, which caused
the 'empty first room' bug when renaming the default room (rename
was seen as 'delete + create' instead of 'in-place rename'). Move
grouping to sash.room integer (already in schema, previously unused
for grouping) and normalize incoming sashes on edit/import.

Fixes the rename-creates-clone bug."
```

---

## Task 8: Manual verification

No code changes. Run `npm run dev` and click through the scenarios below. Each corresponds to a success criterion from the spec.

**Files:**
- None (manual QA)

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Wait for the server to come up, then open the orders page in the browser.

- [ ] **Step 2: Verify new-order initial state**

Open "Новый заказ". Confirm:
- Ровно одна комната в секции «Створки».
- Хедер показывает серый курсив «Название комнаты (двойной клик)».
- Ровно одна пустая створка внутри.
- Иконка 🗑 неактивна (disabled, приглушена) — hover показывает tooltip «Это единственная комната — её нельзя удалить».

- [ ] **Step 3: Verify rename of the first room does not clone**

В том же заказе:
- Двойной клик по плейсхолдеру «Название комнаты (двойной клик)».
- Инпут появляется с `autofocus`.
- Ввести `Кухня`, нажать Enter.
- Подтвердить: комната ровно одна, с названием «Кухня» жирным, створка осталась внутри.
- Пустого клона НЕТ.

- [ ] **Step 4: Verify `+ Комната` adds a new room without popover**

- Нажать кнопку «🏠 Комната» в верхнем правом углу секции «Створки».
- Подтвердить: новая комната появляется мгновенно, без открытия popover.
- В новой комнате сразу одна пустая створка.
- Хедер новой комнаты уже в режиме редактирования с автофокусом на инпуте.
- Ввести `Спальня`, нажать Enter. Переименована корректно, без клонов.

- [ ] **Step 5: Verify drag-and-drop between rooms**

- Перетащить створку из «Кухня» в «Спальня».
- Подтвердить: счётчик створок в «Кухня» уменьшился, в «Спальне» увеличился.
- Бейдж количества обновился корректно.

- [ ] **Step 6: Verify delete empty room (no modal)**

- Нажать «🏠 Комната», чтобы получить третью комнату. Не давать ей имя, не добавлять створки — либо сразу убрать автоматически добавленную створку через её 🗑.
- Нажать 🗑 на хедере этой пустой комнаты.
- Подтвердить: комната исчезла мгновенно, без модалки.

- [ ] **Step 7: Verify delete non-empty room (modal)**

- Если в одной из оставшихся комнат меньше 2 створок — добавить ещё (через «+ Створка»).
- Нажать 🗑 на этой комнате.
- Открылась модалка: «Удалить комнату «…»?».
- Присутствует список «Перенести в «…»» для всех остальных комнат + красная опция «Удалить вместе со створками».
- По умолчанию выбрана первая опция «Перенести в…».
- Нажать «Применить» (с переносом). Створки перешли в целевую комнату, удаляемая исчезла.

- [ ] **Step 8: Verify delete with "delete all" option**

- Добавить новую комнату + одну створку.
- Удалить эту комнату с опцией «Удалить вместе со створками».
- Створки удалились, комната исчезла, модалка закрылась.

- [ ] **Step 9: Verify last-room delete protection**

- Удалить все комнаты кроме одной.
- Подтвердить: кнопка 🗑 на последней комнате disabled (приглушена, tooltip «Это единственная комната — её нельзя удалить»).

- [ ] **Step 10: Verify save + reload preserves grouping**

- В заказе: создать 2 именованные комнаты, переименовать, раскидать по ним створки, заполнить размеры/систему/ткань.
- Сохранить заказ.
- Вернуться в список и заново открыть этот заказ на редактирование.
- Подтвердить: все комнаты на месте, имена и группировка те же, створки в тех же комнатах.

- [ ] **Step 11: Verify old order without roomName**

- Открыть на редактирование любой старый заказ, у которого никогда не проставлялись комнаты (все `roomName = null`).
- Подтвердить: все створки показаны в одной безымянной комнате с плейсхолдером. Багов нет.
- Не сохранять — просто закрыть форму.

- [ ] **Step 12: Verify order from mobile measurement**

- Открыть вкладку «Замеры из приложения».
- Взять замер с несколькими комнатами (если такой есть) и конвертировать в заказ.
- Подтвердить: комнаты появились в форме заказа с правильными именами и створками внутри.

- [ ] **Step 13: Mark verification complete**

Если все 12 шагов выше зелёные, рефактор считается выполненным. Если какой-то шаг красный — открыть багу, описать репро, починить точечно.

---

## Summary

**Commits:**
1. `refactor(orders): add Room type for stable room-ID grouping`
2. `feat(orders): add normalizeSashRooms helper to assign stable room IDs by roomName groups`
3. `feat(orders): add DeleteRoomDialog for room deletion with sash move options`
4. `fix(orders): switch room grouping to stable integer ID`

**Файлы, затронутые каждым коммитом:**

| # | Файлы |
|---|-------|
| 1 | `client/src/pages/orders/types.ts` |
| 2 | `client/src/pages/orders/normalize-sash-rooms.ts` (new) |
| 3 | `client/src/pages/orders/delete-room-dialog.tsx` (new) |
| 4 | `client/src/pages/orders/use-room-groups.ts` + `room-container.tsx` + `order-form.tsx` + `index.tsx` |

**Общий объём:** 2 новых файла, 5 изменённых, ~250 строк кода суммарно.

**Критерии успеха:** см. раздел «Критерии успеха» в [спеке](../specs/2026-04-11-room-grouping-stable-id-design.md) — все 10 пунктов должны выполняться после Task 8.
