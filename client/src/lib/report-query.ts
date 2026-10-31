// Запрос отчёта с параметрами в query-строке (стандартный queryFn склеивает ключ через «/»).

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useReport<T>(path: string, params: Record<string, string | null | undefined>) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== "") as [string, string][]
  ).toString();
  return useQuery<T>({
    queryKey: [path, qs],
    queryFn: async () => {
      const res = await fetch(qs ? `${path}?${qs}` : path, { credentials: "include" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || `Ошибка ${res.status}`);
      return body as T;
    },
    placeholderData: (prev) => prev,
  });
}

/** Состояние, которое помнится между открытиями экрана (период отчёта и т.п.). */
export function useStoredState<T>(key: string, initial: () => T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial();
    } catch {
      return initial();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}
