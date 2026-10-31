// Производство как в УЭС: «В производстве» — очередь изделий по заказам с отметкой
// «✓ Готов»; «Готовые» — готовые изделия до отгрузки с «Отменить готовность».
// Когда готово всё изделия заказа, заказ становится «Готов» и материалы списываются.

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, ExternalLink, Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards } from "@/components/ues/report-kit";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, ApiError, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { PRODUCTION_PRIORITIES } from "@shared/schema";

interface Row {
  id: string;
  orderId: string;
  width: string;
  height: string;
  controlSide: string | null;
  room: number | null;
  roomName: string | null;
  productionStatus: "in_work" | "ready";
  sentAt: string | null;
  readyAt: string | null;
  systemName: string | null;
  fabricName: string | null;
  fabricType: string | null;
  fabricColor: string;
  systemColor: string;
  orderNumber: number;
  orderDate: string;
  orderStatus: string;
  priority: string;
  comment: string | null;
  dealerName: string | null;
}

interface Group {
  orderId: string;
  orderNumber: number;
  dealerName: string | null;
  priority: string;
  orderStatus: string;
  comment: string | null;
  sentAt: string | null;
  rows: Row[];
  total: number;
  ready: number;
}

const PRIORITY_RANK: Record<string, number> = { Срочно: 0, "К утру": 1, Обычно: 2 };
const cm = (v: string) => parseFloat(v).toLocaleString("ru-RU", { maximumFractionDigits: 1 });
const dateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
const isToday = (v: string | null) => !!v && new Date(v).toDateString() === new Date().toDateString();

/** Возраст в работе: «сегодня», «1 дн.», …; больше 3 дней — просрочка. */
function age(sentAt: string | null) {
  if (!sentAt) return { label: "—", tone: "" };
  const days = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86_400_000);
  return {
    label: days <= 0 ? "сегодня" : `${days} дн.`,
    tone: days >= 3 ? "is-late" : days >= 1 ? "is-warn" : "is-fresh",
  };
}

const invalidate = () => {
  for (const k of ["/api/production", "/api/orders", "/api/stock", "/api/warehouse/writeoffs", "/api/dashboard", "/api/reports/pnl", "/api/reports/balance"]) {
    queryClient.invalidateQueries({ queryKey: [k] });
  }
};

export default function ProductionPage({ mode }: { mode: "work" | "ready" }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");

  const { data: rows = [], isLoading, isFetching, refetch } = useQuery<Row[]>({ queryKey: ["/api/production"] });

  const showError = (e: Error) => {
    const err = e as ApiError;
    toast({ title: "Не выполнено", description: err.errors?.join("\n") || e.message, variant: "destructive", duration: 9000 });
  };
  const act = useMutation({
    mutationFn: async ({ url }: { url: string; done: string }) => (await apiRequest("POST", url)).json(),
    onSuccess: (r: { orderReady?: boolean }, v) => {
      invalidate();
      toast({ title: r?.orderReady ? "Заказ готов — материалы списаны" : v.done });
    },
    onError: showError,
  });
  const ship = useMutation({
    mutationFn: (orderId: string) => apiRequest("PATCH", `/api/orders/${orderId}/status`, { status: "Отгружен" }),
    onSuccess: () => {
      invalidate();
      toast({ title: "Заказ отгружен" });
    },
    onError: showError,
  });
  const setPriority = useMutation({
    mutationFn: ({ orderId, priority }: { orderId: string; priority: string }) =>
      apiRequest("POST", `/api/orders/${orderId}/production/priority`, { priority }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/production"] }),
    onError: showError,
  });

  const groups = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of rows) {
      let g = map.get(r.orderId);
      if (!g) {
        g = {
          orderId: r.orderId,
          orderNumber: r.orderNumber,
          dealerName: r.dealerName,
          priority: r.priority,
          orderStatus: r.orderStatus,
          comment: r.comment,
          sentAt: r.sentAt,
          rows: [],
          total: 0,
          ready: 0,
        };
        map.set(r.orderId, g);
      }
      g.total += 1;
      if (r.productionStatus === "ready") g.ready += 1;
      if (r.sentAt && (!g.sentAt || r.sentAt < g.sentAt)) g.sentAt = r.sentAt;
      if (mode === "work" ? r.productionStatus === "in_work" : r.productionStatus === "ready") g.rows.push(r);
    }
    const q = query.trim().toLowerCase();
    return Array.from(map.values())
      .filter((g) => g.rows.length > 0)
      .filter((g) => priorityFilter === "all" || g.priority === priorityFilter)
      .filter(
        (g) =>
          !q ||
          [String(g.orderNumber), g.dealerName ?? "", g.comment ?? "", ...g.rows.map((r) => `${r.systemName} ${r.fabricName} ${r.roomName ?? ""}`)]
            .join(" ")
            .toLowerCase()
            .includes(q)
      )
      .sort(
        (a, b) =>
          (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3) ||
          String(a.sentAt ?? "").localeCompare(String(b.sentAt ?? "")) ||
          a.orderNumber - b.orderNumber
      );
  }, [rows, mode, query, priorityFilter]);

  const inWork = rows.filter((r) => r.productionStatus === "in_work");
  const readyRows = rows.filter((r) => r.productionStatus === "ready");
  const kpi =
    mode === "work"
      ? [
          { label: "Заказов в работе", value: String(new Set(inWork.map((r) => r.orderId)).size), hint: "есть изделия в цехе" },
          { label: "Изделий в работе", value: String(inWork.length), hint: "ожидают отметки «Готов»" },
          {
            label: "Срочно",
            value: String(inWork.filter((r) => r.priority === "Срочно").length),
            hint: "изделий с пометкой «Срочно»",
            tone: inWork.some((r) => r.priority === "Срочно") ? ("bad" as const) : undefined,
          },
          { label: "Готово сегодня", value: String(readyRows.filter((r) => isToday(r.readyAt)).length), hint: "изделий отмечено сегодня", tone: "good" as const },
        ]
      : [
          { label: "Готовых изделий", value: String(readyRows.length), hint: "ещё не отгружены" },
          {
            label: "Заказов готово полностью",
            value: String(groups.filter((g) => g.ready === g.total).length),
            hint: "можно отгружать",
            tone: "good" as const,
          },
          { label: "Частично готовы", value: String(groups.filter((g) => g.ready < g.total).length), hint: "часть изделий ещё в цехе" },
        ];

  const busy = act.isPending || ship.isPending;

  return (
    <Layout
      title={mode === "work" ? "В производстве" : "Готовые изделия"}
      caption="Производство"
      wide
      actions={
        <button type="button" className="ues-btn" onClick={() => refetch()} disabled={isFetching} title="Обновить">
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      }
    >
      <div className="space-y-3">
        <KpiCards items={kpi} />

        <div className="ues-toolbar">
          {["all", ...PRODUCTION_PRIORITIES].map((p) => (
            <button key={p} type="button" className={cn("ues-btn h-8", priorityFilter === p && "is-active")} onClick={() => setPriorityFilter(p)}>
              {p === "all" ? "Все" : p}
            </button>
          ))}
          <span className="ues-toolbar-sep" />
          <button type="button" className={cn("ues-btn h-8", mode === "work" && "is-active")} onClick={() => navigate("/production")}>
            В работе ({inWork.length})
          </button>
          <button type="button" className={cn("ues-btn h-8", mode === "ready" && "is-active")} onClick={() => navigate("/production/ready")}>
            Готовые ({readyRows.length})
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input className="ues-input w-[260px] !pl-8" placeholder="Заказ, дилер, ткань, комната" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--ues-muted)]" />
          </div>
        ) : groups.length === 0 ? (
          <div className="ues-fieldset py-10 text-center text-[13px] text-[var(--ues-muted)]">
            {mode === "work"
              ? "В производстве ничего нет. Передайте заказ кнопкой «Передать в производство» в документе ЗП."
              : "Готовых неотгруженных изделий нет."}
          </div>
        ) : (
          groups.map((g) => {
            const a = age(g.sentAt);
            const allReady = g.ready === g.total;
            return (
              <section key={g.orderId} className={cn("ues-prod-order", g.priority === "Срочно" && "is-urgent")}>
                <header className="ues-prod-head">
                  <button type="button" className="ues-prod-title" onClick={() => navigate(`/orders/doc/${g.orderId}`)} title="Открыть заказ">
                    Заказ №{g.orderNumber}
                    <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                  </button>
                  <span className="ues-prod-dealer">{g.dealerName || "Розница"}</span>
                  <span className={cn("ues-age-pill", a.tone)} title={`Передан ${dateTime(g.sentAt)}`}>
                    {mode === "work" ? `в работе ${a.label}` : a.label === "сегодня" ? "передан сегодня" : `передан ${a.label} назад`}
                  </span>
                  <select
                    className={cn("ues-priority-pill", `is-${PRIORITY_RANK[g.priority] ?? 2}`)}
                    value={g.priority}
                    onChange={(e) => setPriority.mutate({ orderId: g.orderId, priority: e.target.value })}
                    title="Срочность"
                  >
                    {PRODUCTION_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <span className={cn("ues-prod-progress", allReady && "is-done")}>
                    <i style={{ width: `${(g.ready / g.total) * 100}%` }} />
                    <b>
                      готово {g.ready} из {g.total}
                    </b>
                  </span>
                  <span className="ml-auto flex gap-1.5">
                    {mode === "work" ? (
                      <button
                        type="button"
                        className="ues-btn soft-success h-8"
                        disabled={busy}
                        onClick={() => act.mutate({ url: `/api/orders/${g.orderId}/production/ready`, done: `Заказ №${g.orderNumber}: всё готово` })}
                        title="Отметить готовыми все изделия заказа в работе"
                      >
                        <Check className="h-4 w-4" />
                        Готов весь заказ
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="ues-btn ship h-8"
                        disabled={busy || !allReady || g.orderStatus !== "Готов"}
                        title={allReady ? "Отгрузить заказ покупателю" : `Не готово ${g.total - g.ready} изд.`}
                        onClick={() => ship.mutate(g.orderId)}
                      >
                        <span className="ues-action-icon" aria-hidden="true">→</span>
                        Отгрузить
                      </button>
                    )}
                  </span>
                </header>
                {g.comment && <div className="ues-prod-comment">{g.comment}</div>}
                <div className="ues-table-wrap !rounded-none !border-x-0 !border-b-0">
                  <table className="ues-table">
                    <thead>
                      <tr>
                        <th className="w-[42px]">№</th>
                        <th className="w-[150px]">Комната</th>
                        <th className="w-[130px] text-right">Ширина × высота, см</th>
                        <th>Система</th>
                        <th>Ткань</th>
                        <th className="w-[60px]">Упр.</th>
                        <th className="w-[120px]">{mode === "work" ? "Передано" : "Готово"}</th>
                        <th className="w-[190px]" />
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r, i) => (
                        <tr key={r.id} className={mode === "work" ? "ues-line-in_work" : "ues-line-ready"}>
                          <td className="ues-muted tabular-nums">{i + 1}</td>
                          <td>{r.roomName || <span className="ues-muted">—</span>}</td>
                          <td className="text-right font-semibold tabular-nums">
                            {cm(r.width)} × {cm(r.height)}
                          </td>
                          <td>
                            {r.systemName || "—"}
                            {r.systemColor && <span className="ues-muted"> · {r.systemColor}</span>}
                          </td>
                          <td>
                            {r.fabricName || "—"}
                            {r.fabricColor && <span className="ues-muted"> · {r.fabricColor}</span>}
                            {r.fabricType === "zebra" && <span className="ues-muted"> · зебра</span>}
                          </td>
                          <td>{r.controlSide || "—"}</td>
                          <td className="tabular-nums">{dateTime(mode === "work" ? r.sentAt : r.readyAt)}</td>
                          <td className="text-right">
                            {mode === "work" ? (
                              <button
                                type="button"
                                className="ues-btn soft-success h-8"
                                disabled={busy}
                                onClick={() => act.mutate({ url: `/api/production/sashes/${r.id}/ready`, done: "Изделие готово" })}
                                data-testid={`button-ready-${r.id}`}
                              >
                                <Check className="h-4 w-4" />
                                Готов
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="ues-btn h-8"
                                disabled={busy}
                                onClick={() => act.mutate({ url: `/api/production/sashes/${r.id}/undo`, done: "Готовность отменена" })}
                                title={g.orderStatus === "Готов" ? "Заказ вернётся в производство, списание материалов отменится" : undefined}
                              >
                                <RotateCcw className="h-4 w-4" />
                                Отменить готовность
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
      </div>
    </Layout>
  );
}

export const ProductionWorkPage = () => <ProductionPage mode="work" />;
export const ProductionReadyPage = () => <ProductionPage mode="ready" />;
