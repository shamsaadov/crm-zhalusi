// Загрузка справочников и подписи для колонок/списков выбора.

import { useQueries, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { DIRECTORY_BY_KEY, optionLabel, type DirectoryKey, type Row } from "./registry";

const NO_ROWS: Row[] = [];

export function useDirectoryRows(key: DirectoryKey) {
  const def = DIRECTORY_BY_KEY[key];
  const q = useQuery<Row[]>({ queryKey: [def.api] });
  return { ...q, rows: q.data ?? NO_ROWS };
}

/** Связанные справочники и функция «id → подпись». */
export function useLookups(keys: DirectoryKey[] = []) {
  const results = useQueries({
    queries: keys.map((k) => ({ queryKey: [DIRECTORY_BY_KEY[k].api] })),
  });
  const data = results.map((r) => r.data as Row[] | undefined);
  const maps = useMemo(() => {
    const m = new Map<DirectoryKey, Map<string, Row>>();
    keys.forEach((k, i) => m.set(k, new Map((data[i] ?? []).map((r) => [r.id, r]))));
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys.join(","), ...data]);
  const lookup = useCallback(
    (key: DirectoryKey, id: string | null | undefined) => {
      if (!id) return "—";
      const row = maps.get(key)?.get(id);
      return row ? optionLabel(key, row) : "—";
    },
    [maps]
  );
  const rowsOf = useCallback((key: DirectoryKey) => Array.from(maps.get(key)?.values() ?? []), [maps]);
  return { lookup, rowsOf };
}
