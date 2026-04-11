import { useCallback, useRef, useState } from "react";
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
  // Monotonic room ID counter; survives closures so rapid addRoom() calls
  // never collide. Initialized to 2 because DEFAULT_ROOM uses id=1.
  const nextIdRef = useRef<number>(2);

  // Reactive subscription to sashes — rerenders the hook's consumers on any
  // sash mutation (room change, append, remove). Without this, moveSash()
  // would update form values without triggering a rerender.
  const watchedSashes =
    (useWatch({ control: form.control, name: "sashes" }) as
      | SashFormValues[]
      | undefined) ?? [];

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
      nextIdRef.current = 2;
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
    const finalRooms = derived.length > 0 ? derived : [DEFAULT_ROOM];
    setRooms(finalRooms);
    setAutoEditRoomId(null);
    nextIdRef.current =
      finalRooms.length === 0
        ? 2
        : Math.max(...finalRooms.map((r) => r.id)) + 1;
  }, []);

  /**
   * Create a new room with a fresh ID and append one empty sash belonging
   * to it. Returns the new room ID. The caller (OrderForm) uses the returned
   * ID to auto-focus the rename input via `autoEditRoomId`.
   */
  const addRoom = useCallback((): number => {
    const id = nextIdRef.current++;
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
  }, [fieldArray, form]);

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
   * Remove a room and all sashes that belong to it.
   *
   * Refuses to remove the last remaining room (form always needs at least one).
   */
  const removeRoom = useCallback(
    (roomId: number) => {
      if (rooms.length <= 1) return;
      const current = form.getValues("sashes");
      const affectedIndices = current
        .map((s, i) => ((s?.room ?? 1) === roomId ? i : -1))
        .filter((i) => i >= 0);

      if (affectedIndices.length > 0) {
        fieldArray.remove(affectedIndices);
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
