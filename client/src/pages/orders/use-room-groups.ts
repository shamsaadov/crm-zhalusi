import { useState, useMemo, useCallback, useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { FieldArrayWithId } from "react-hook-form";
import type { OrderFormValues } from "./schemas";

interface RoomGroup {
  name: string; // "" = default room
  sashIndices: number[];
}

export function useRoomGroups(
  form: UseFormReturn<OrderFormValues>,
  fields: FieldArrayWithId<OrderFormValues, "sashes">[]
) {
  // Track explicitly created room names (so empty rooms persist)
  const [createdRooms, setCreatedRooms] = useState<string[]>([]);

  // Seed created rooms from existing sash data on mount / when fields change
  useEffect(() => {
    const sashes = form.getValues("sashes");
    const existingNames = new Set<string>();
    sashes.forEach((s) => {
      if (s.roomName && s.roomName.trim()) existingNames.add(s.roomName);
    });
    if (existingNames.size > 0) {
      setCreatedRooms((prev) => {
        const merged = new Set([...prev, ...Array.from(existingNames)]);
        return Array.from(merged);
      });
    }
  }, [fields.length]);

  const sashValues = form.watch("sashes") || [];

  const rooms: RoomGroup[] = useMemo(() => {
    // Default room always first
    const defaultRoom: RoomGroup = { name: "", sashIndices: [] };
    const namedRooms = new Map<string, RoomGroup>();

    // Initialize from created rooms
    createdRooms.forEach((name) => {
      namedRooms.set(name, { name, sashIndices: [] });
    });

    // Distribute sashes
    sashValues.forEach((sash, index) => {
      if (index >= fields.length) return; // guard
      const roomName = sash?.roomName || "";
      if (!roomName) {
        defaultRoom.sashIndices.push(index);
      } else {
        if (!namedRooms.has(roomName)) {
          namedRooms.set(roomName, { name: roomName, sashIndices: [] });
        }
        namedRooms.get(roomName)!.sashIndices.push(index);
      }
    });

    return [defaultRoom, ...Array.from(namedRooms.values())];
  }, [sashValues, fields.length, createdRooms]);

  const addRoom = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreatedRooms((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed]
    );
  }, []);

  const renameRoom = useCallback(
    (oldName: string, newName: string) => {
      const trimmed = newName.trim();
      const sashes = form.getValues("sashes");
      sashes.forEach((s, i) => {
        if ((s.roomName || "") === oldName) {
          form.setValue(`sashes.${i}.roomName`, trimmed, {
            shouldValidate: false,
          });
        }
      });
      setCreatedRooms((prev) =>
        prev.map((n) => (n === oldName ? trimmed : n))
      );
    },
    [form]
  );

  const removeRoom = useCallback(
    (name: string) => {
      // Move sashes to default room
      const sashes = form.getValues("sashes");
      sashes.forEach((s, i) => {
        if ((s.roomName || "") === name) {
          form.setValue(`sashes.${i}.roomName`, "", {
            shouldValidate: false,
          });
        }
      });
      setCreatedRooms((prev) => prev.filter((n) => n !== name));
    },
    [form]
  );

  const moveSash = useCallback(
    (sashIndex: number, targetRoomName: string) => {
      form.setValue(`sashes.${sashIndex}.roomName`, targetRoomName, {
        shouldValidate: false,
      });
    },
    [form]
  );

  return { rooms, addRoom, renameRoom, removeRoom, moveSash };
}
