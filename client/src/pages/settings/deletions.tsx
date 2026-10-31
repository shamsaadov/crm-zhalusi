// «Помеченные на удаление» как в УЭС (DeletionSettings.jsx): из рабочих разделов объект
// только помечается, здесь его можно восстановить или удалить окончательно, если нет связей.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, RotateCcw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards } from "@/components/ues/report-kit";
import { ConfirmDialog } from "@/pages/directories/confirm";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface MarkedItem {
  key: string;
  kind: string;
  id: string;
  title: string;
  category: string;
  deletedAt: string | null;
  dependencies: { title: string; count: number }[];
}

type Filter = "all" | "blocked" | "available";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "blocked", label: "Со связями" },
  { key: "available", label: "Можно удалить" },
];

const fmtDateTime = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(v))
    : "—";

/** Всё, что зависит от помеченных объектов: списки, отчёты, остатки. */
function invalidateEverything() {
  for (const k of [
    "/api/deletions",
    "/api/orders",
    "/api/warehouse",
    "/api/stock",
    "/api/finance",
    "/api/dealers",
    "/api/suppliers",
    "/api/cashboxes",
    "/api/colors",
    "/api/fabrics",
    "/api/components",
    "/api/systems",
    "/api/multipliers",
    "/api/expense-types",
    "/api/reports/pnl",
    "/api/reports/cash-flow",
    "/api/reports/balance",
    "/api/reports/settlements",
    "/api/dashboard",
  ]) {
    queryClient.invalidateQueries({ queryKey: [k] });
  }
}

export default function DeletionsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [confirmItem, setConfirmItem] = useState<MarkedItem | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  const { data: items = [], isLoading } = useQuery<MarkedItem[]>({ queryKey: ["/api/deletions"] });

  const blockedCount = items.filter((i) => i.dependencies.length > 0).length;
  const availableCount = items.length - blockedCount;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      const blocked = i.dependencies.length > 0;
      if (filter === "blocked" && !blocked) return false;
      if (filter === "available" && blocked) return false;
      if (!q) return true;
      return [i.title, i.category, ...i.dependencies.map((d) => d.title)].join(" ").toLowerCase().includes(q);
    });
  }, [items, filter, query]);

  const restore = useMutation({
    mutationFn: (i: MarkedItem) => apiRequest("POST", `/api/deletions/${i.kind}/${i.id}/restore`),
    onSuccess: (_, i) => {
      invalidateEverything();
      toast({ title: `«${i.title}» восстановлено` });
    },
    onError: (e: Error) => toast({ title: "Не удалось восстановить", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: (i: MarkedItem) => apiRequest("DELETE", `/api/deletions/${i.kind}/${i.id}`),
    onSuccess: (_, i) => {
      invalidateEverything();
      toast({ title: `«${i.title}» удалено окончательно` });
    },
    onError: (e: Error) =>
      toast({ title: "Удаление запрещено", description: e.message.replace(/^\d+:\s*/, ""), variant: "destructive" }),
  });

  const removeAll = useMutation({
    mutationFn: async () => (await apiRequest("DELETE", "/api/deletions")).json() as Promise<{ removed: number; failed: string[] }>,
    onSuccess: (r) => {
      invalidateEverything();
      toast({
        title: r.removed ? `Удалено окончательно: ${r.removed}` : "Нечего удалять",
        description: r.failed.length ? `Не удалось: ${r.failed.join(", ")}` : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "Ошибка", description: e.message, variant: "destructive" }),
  });

  const busy = restore.isPending || remove.isPending || removeAll.isPending;

  return (
    <Layout
      title="Помеченные на удаление"
      caption="Настройки системы"
      actions={<span className="text-[13px] text-[var(--ues-muted)]">Всего: {items.length}</span>}
    >
      <div className="space-y-4">
        <KpiCards
          items={[
            { label: "Помечено", value: String(items.length), hint: "скрыто из рабочих списков и расчётов" },
            {
              label: "Удаление запрещено",
              value: String(blockedCount),
              hint: "есть заказы, документы или остатки",
              tone: blockedCount ? "bad" : undefined,
            },
            { label: "Можно удалить", value: String(availableCount), hint: "связей с другими данными нет", tone: "good" },
          ]}
        />

        <div className="flex gap-3 rounded-[11px] border border-[var(--ues-primary-border)] bg-[var(--ues-primary-soft)] px-4 py-3 text-[13px] text-[var(--ues-primary-text)]">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Единое правило безопасности</div>
            <div>
              В рабочих разделах объект можно только пометить на удаление: он пропадает из списков, отчётов и
              остатков, но сохраняется. Окончательно удалить можно только здесь и только если на объект ничего не
              ссылается. Удаление нельзя отменить.
            </div>
          </div>
        </div>

        <div className="ues-toolbar">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={cn("ues-btn", filter === f.key && "is-active")}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          <span className="ues-toolbar-sep" />
          <button
            type="button"
            className="ues-btn danger"
            disabled={!availableCount || busy}
            onClick={() => setConfirmAll(true)}
            title={availableCount ? "Удалить все объекты без связей" : "Нет объектов, которые можно удалить"}
            data-testid="button-delete-all-marked"
          >
            <Trash2 className="h-4 w-4" />
            Удалить всё ({availableCount})
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[260px] !pl-8"
              placeholder="Поиск по объектам и связям"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="ues-table-wrap">
          <table className="ues-table">
            <thead>
              <tr>
                <th>Объект</th>
                <th>Тип</th>
                <th className="w-[140px]">Помечен</th>
                <th>Проверка связей</th>
                <th className="w-[290px]">Действия</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {!isLoading && visible.length === 0 && (
                <tr>
                  <td colSpan={5} className="ues-muted py-6 text-center">
                    {items.length ? "По выбранному фильтру ничего не найдено" : "Нет объектов, помеченных на удаление"}
                  </td>
                </tr>
              )}
              {visible.map((i) => {
                const blocked = i.dependencies.length > 0;
                return (
                  <tr key={i.key} data-testid={`marked-${i.kind}-${i.id}`}>
                    <td className="font-semibold">{i.title}</td>
                    <td className="ues-muted">{i.category}</td>
                    <td className="tabular-nums">{fmtDateTime(i.deletedAt)}</td>
                    <td>
                      <span className={cn("ues-del-state", blocked ? "is-blocked" : "is-available")}>
                        {blocked ? `Нельзя удалить · связей: ${i.dependencies.length}` : "Связей нет · можно удалить"}
                      </span>
                      {blocked && (
                        <details className="mt-1 text-[12.5px]">
                          <summary className="cursor-pointer text-[var(--ues-primary-text)]">Показать причины</summary>
                          <ul className="ml-4 mt-1 list-disc text-[var(--ues-muted)]">
                            {i.dependencies.map((d) => (
                              <li key={d.title}>{d.title}</li>
                            ))}
                          </ul>
                        </details>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" className="ues-btn h-8" disabled={busy} onClick={() => restore.mutate(i)}>
                          {restore.isPending && restore.variables?.key === i.key ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RotateCcw className="h-4 w-4" />
                          )}
                          Восстановить
                        </button>
                        <button
                          type="button"
                          className="ues-btn danger h-8"
                          disabled={blocked || busy}
                          title={blocked ? "Сначала устраните связи" : "Удалить без возможности восстановления"}
                          onClick={() => setConfirmItem(i)}
                        >
                          <Trash2 className="h-4 w-4" />
                          Удалить окончательно
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmItem || confirmAll}
        title={confirmAll ? "Удалить все доступные объекты?" : "Удалить окончательно?"}
        text={
          confirmAll
            ? `Будут удалены все объекты без связей — сейчас ${availableCount}. Объекты со связями останутся в списке. Восстановить их будет нельзя.`
            : `«${confirmItem?.title ?? ""}» будет удалено без возможности восстановления. Связей с другими данными не найдено.`
        }
        confirmLabel="Удалить окончательно"
        onCancel={() => {
          setConfirmItem(null);
          setConfirmAll(false);
        }}
        onConfirm={() => {
          if (confirmAll) removeAll.mutate();
          else if (confirmItem) remove.mutate(confirmItem);
          setConfirmItem(null);
          setConfirmAll(false);
        }}
      />
    </Layout>
  );
}
