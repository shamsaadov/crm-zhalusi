import { useState, useCallback, useEffect } from "react";
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
  const [createdRooms, setCreatedRooms] = useState<string[]>([]);
  // Counter to force recalculation when roomName changes
  const [version, setVersion] = useState(0);

  // Seed created rooms from existing sash data
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

  // Build rooms from current form state (recalculates on version/fields/createdRooms change)
  const buildRooms = (): RoomGroup[] => {
    const sashes = form.getValues("sashes");
    const defaultRoom: RoomGroup = { name: "", sashIndices: [] };
    const namedRooms = new Map<string, RoomGroup>();

    createdRooms.forEach((name) => {
      namedRooms.set(name, { name, sashIndices: [] });
    });

    sashes.forEach((sash, index) => {
      if (index >= fields.length) return;
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
  };

  // Force rebuild when version, fields length, or createdRooms change
  const [rooms, setRooms] = useState<RoomGroup[]>(() => buildRooms());

  useEffect(() => {
    setRooms(buildRooms());
  }, [version, fields.length, createdRooms]);

  const bump = () => setVersion((v) => v + 1);

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
      bump();
    },
    [form]
  );

  const removeRoom = useCallback(
    (name: string) => {
      const sashes = form.getValues("sashes");
      sashes.forEach((s, i) => {
        if ((s.roomName || "") === name) {
          form.setValue(`sashes.${i}.roomName`, "", {
            shouldValidate: false,
          });
        }
      });
      setCreatedRooms((prev) => prev.filter((n) => n !== name));
      bump();
    },
    [form]
  );

  const moveSash = useCallback(
    (sashIndex: number, targetRoomName: string) => {
      form.setValue(`sashes.${sashIndex}.roomName`, targetRoomName, {
        shouldValidate: false,
      });
      bump();
    },
    [form]
  );

  return { rooms, addRoom, renameRoom, removeRoom, moveSash };
}
