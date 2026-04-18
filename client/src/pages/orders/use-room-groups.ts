import { useCallback, useEffect, useRef, useState } from "react";
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
 * Источник истины для группировки — локальный Map `fieldId → roomId`,
 * ключами которого выступают стабильные `fieldArray.fields[i].id` (UUID,
 * генерируется RHF и переживает операции append/remove без изменения).
 * Это делает группировку невосприимчивой к возможному повреждению
 * `sash.room` в состоянии формы (например, при пересечении подписок RHF
 * или гонке колбэков коэффициента). Форма всё равно хранит `sash.room`
 * для сериализации в БД — его обновляет `moveSash` / исходное append.
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

  // Стабильная карта "fieldId → roomId". Именно она определяет, в какой
  // комнате отображается створка. Обновляется только на явные действия:
  // появление нового поля (append) и moveSash. При удалении записи стираются.
  const [sashRoomById, setSashRoomById] = useState<Record<string, number>>({});

  // Reactive subscription to sashes — rerenders the hook's consumers on any
  // sash mutation (room change, append, remove). Without this, moveSash()
  // would update form values without triggering a rerender.
  const watchedSashes =
    (useWatch({ control: form.control, name: "sashes" }) as
      | SashFormValues[]
      | undefined) ?? [];

  // Синхронизируем sashRoomById с текущим списком полей.
  // Новые поля засеваем значением `sash.room` из формы (единственный момент,
  // когда мы ему доверяем — сразу после append). Удалённые убираем.
  useEffect(() => {
    setSashRoomById((prev) => {
      const next: Record<string, number> = {};
      let changed = false;
      fieldArray.fields.forEach((field, i) => {
        if (prev[field.id] !== undefined) {
          next[field.id] = prev[field.id];
        } else {
          const formRoom = form.getValues(`sashes.${i}.room`);
          next[field.id] =
            typeof formRoom === "number" && formRoom > 0 ? formRoom : 1;
          changed = true;
        }
      });
      if (Object.keys(prev).length !== Object.keys(next).length) changed = true;
      return changed ? next : prev;
    });
  }, [fieldArray.fields, form]);

  // Derived every render from `rooms` + стабильная карта `sashRoomById`.
  // Для только что появившихся полей (карта ещё не обновлена effect-ом)
  // читаем `sash.room` из формы как fallback — это ровно один рендер.
  const roomGroups: RoomGroup[] = rooms.map((room) => ({
    room,
    sashIndices: fieldArray.fields
      .map((field, i) => {
        const mapped = sashRoomById[field.id];
        const roomId =
          mapped !== undefined ? mapped : watchedSashes[i]?.room ?? 1;
        return roomId === room.id ? i : -1;
      })
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
      setSashRoomById({});
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
    // Сбрасываем карту — effect пересоберёт её из form values новых полей.
    setSashRoomById({});
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
      // Обходим поля по стабильной карте, а не по sash.room в форме —
      // так переименование захватит именно те створки, что визуально в этой комнате.
      fieldArray.fields.forEach((field, i) => {
        if ((sashRoomById[field.id] ?? 1) === roomId) {
          form.setValue(`sashes.${i}.roomName`, trimmed, {
            shouldValidate: false,
          });
        }
      });
    },
    [form, fieldArray.fields, sashRoomById]
  );

  /**
   * Remove a room and all sashes that belong to it.
   *
   * Refuses to remove the last remaining room (form always needs at least one).
   */
  const removeRoom = useCallback(
    (roomId: number) => {
      if (rooms.length <= 1) return;
      // Собираем индексы через стабильную карту — иначе при повреждённом
      // sash.room могли бы удалить не ту створку.
      const affectedIndices = fieldArray.fields
        .map((field, i) =>
          (sashRoomById[field.id] ?? 1) === roomId ? i : -1
        )
        .filter((i) => i >= 0);

      if (affectedIndices.length > 0) {
        fieldArray.remove(affectedIndices);
      }
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    },
    [fieldArray, rooms, sashRoomById]
  );

  /**
   * Move a single sash to a different room by updating `sash.room` and
   * `sash.roomName`. Used by drag-and-drop.
   */
  const moveSash = useCallback(
    (sashIndex: number, targetRoomId: number) => {
      const target = rooms.find((r) => r.id === targetRoomId);
      if (!target) return;
      const fieldId = fieldArray.fields[sashIndex]?.id;
      if (fieldId) {
        setSashRoomById((prev) => ({ ...prev, [fieldId]: targetRoomId }));
      }
      form.setValue(`sashes.${sashIndex}.room`, targetRoomId, {
        shouldValidate: false,
      });
      form.setValue(`sashes.${sashIndex}.roomName`, target.name ?? "", {
        shouldValidate: false,
      });
    },
    [form, rooms, fieldArray.fields]
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
