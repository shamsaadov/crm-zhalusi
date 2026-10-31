// Список справочника как в УЭС: «Справочник / Название / Найдено: N»,
// панель Создать · Изменить · Удалить · Обновить · Поиск, двойной щелчок — карточка.

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import NotFound from "@/pages/not-found";
import { DIRECTORY_BY_KEY, type DirectoryKey, type Row } from "./registry";
import { useDirectoryRows, useLookups } from "./hooks";
import { ConfirmDialog } from "./confirm";

export default function DirectoryListPage() {
  const { entity } = useParams<{ entity: string }>();
  const def = DIRECTORY_BY_KEY[entity as DirectoryKey];
  if (!def) return <NotFound />;
  return <DirectoryList key={def.key} dkey={def.key} />;
}

function DirectoryList({ dkey }: { dkey: DirectoryKey }) {
  const def = DIRECTORY_BY_KEY[dkey];
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { rows, isLoading, refetch, isFetching } = useDirectoryRows(dkey);
  const { lookup } = useLookups(def.needs);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      def.columns
        .map((c) => (c.text ? c.text(r, { lookup }) : ""))
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, search, def, lookup]);

  const selected = filtered.find((r) => r.id === selectedId) ?? null;
  const open = (r: Row) => navigate(`/lists/${dkey}/${r.id}`);

  // Как в УЭС: из справочника запись только помечается на удаление;
  // окончательно — в «Настройки → Помеченные на удаление».
  const toggleMark = useMutation({
    mutationFn: (r: Row) =>
      apiRequest("POST", `/api/deletions/${dkey}/${r.id}/${r.deletedAt ? "restore" : "mark"}`),
    onSuccess: (_, r) => {
      queryClient.invalidateQueries({ queryKey: [def.api] });
      queryClient.invalidateQueries({ queryKey: ["/api/deletions"] });
      toast({ title: r.deletedAt ? "Пометка снята" : "Запись помечена на удаление" });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  return (
    <Layout
      title={def.title}
      caption="Справочник"
      actions={<span className="text-[13px] text-[var(--ues-muted)]">Найдено: {filtered.length}</span>}
    >
      <div className="space-y-3">
        <div className="ues-toolbar">
          <Link href={`/lists/${dkey}/new`} className="ues-btn primary" data-testid="button-directory-create">
            <Plus className="h-4 w-4" />
            Создать
          </Link>
          <button type="button" className="ues-btn" disabled={!selected} onClick={() => selected && open(selected)}>
            <Pencil className="h-4 w-4" />
            Изменить
          </button>
          {selected?.deletedAt ? (
            <button
              type="button"
              className="ues-btn"
              disabled={toggleMark.isPending}
              onClick={() => toggleMark.mutate(selected)}
              data-testid="button-directory-unmark"
            >
              <RotateCcw className="h-4 w-4" />
              Снять пометку
            </button>
          ) : (
            <button
              type="button"
              className="ues-btn danger"
              disabled={!selected || toggleMark.isPending}
              onClick={() => selected && setConfirm(selected)}
              data-testid="button-directory-delete"
            >
              <Trash2 className="h-4 w-4" />
              Пометить на удаление
            </button>
          )}
          <span className="ues-toolbar-sep" />
          <button type="button" className="ues-btn" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            Обновить
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[240px] !pl-8"
              placeholder="Поиск"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-directory-search"
            />
          </div>
        </div>

        <div className="ues-table-wrap max-h-[calc(100vh-230px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th className="w-[46px]">№</th>
                {def.columns.map((c) => (
                  <th key={c.header} className={c.num ? "num" : undefined}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={def.columns.length + 1} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={def.columns.length + 1} className="ues-muted py-6 text-center">
                    {search ? "Ничего не найдено" : "Справочник пуст. Нажмите «Создать»."}
                  </td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr
                  key={r.id}
                  tabIndex={0}
                  className={cn("is-clickable", selectedId === r.id && "is-selected", r.deletedAt && "is-marked")}
                  title={r.deletedAt ? "Помечена на удаление" : undefined}
                  onClick={() => setSelectedId(r.id)}
                  onDoubleClick={() => open(r)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(r);
                    if (e.key === "Delete" && !r.deletedAt) setConfirm(r);
                  }}
                  data-testid={`directory-row-${r.id}`}
                >
                  <td className="ues-muted">{i + 1}</td>
                  {def.columns.map((c) => (
                    <td key={c.header} className={c.num ? "num" : undefined}>
                      {c.cell(r, { lookup })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">Двойной щелчок или Enter — открыть карточку. Delete — пометить на удаление. Помеченные записи отмечены ×.</p>
      </div>

      <ConfirmDialog
        open={!!confirm}
        title="Пометить на удаление?"
        text={
          confirm
            ? `«${def.recordTitle(confirm)}» пропадёт из списков выбора. Удалить окончательно можно в «Настройки → Помеченные на удаление», если запись нигде не используется.`
            : ""
        }
        confirmLabel="Пометить"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm) toggleMark.mutate(confirm);
          setConfirm(null);
        }}
      />
    </Layout>
  );
}
