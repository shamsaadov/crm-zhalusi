import { useState, useCallback } from "react";

const STORAGE_KEY = "forsa-pinned-systems";

function getStoredPins(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

export function usePinnedSystems() {
  const [pinned, setPinned] = useState<Set<string>>(getStoredPins);

  const toggle = useCallback((systemId: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(systemId)) {
        next.delete(systemId);
      } else {
        next.add(systemId);
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  }, []);

  const isPinned = useCallback((systemId: string) => pinned.has(systemId), [pinned]);

  const sortSystems = useCallback(
    <T extends { id: string }>(systems: T[]): T[] => {
      return [...systems].sort((a, b) => {
        const aPinned = pinned.has(a.id);
        const bPinned = pinned.has(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return 0;
      });
    },
    [pinned]
  );

  return { pinned, toggle, isPinned, sortSystems };
}
