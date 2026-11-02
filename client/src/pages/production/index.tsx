// Производство как в УЭС: «В производстве» — очередь изделий по заказам с отметкой
// «✓ Готов»; «Готовые» — готовые изделия до отгрузки с «Отменить готовность».
// Когда готово всё изделия заказа, заказ становится «Готов» и материалы списываются.

import { Fragment, useMemo, useState, type MouseEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, Loader2, RefreshCw, RotateCcw, Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards, fmtDate, fmtMoney } from "@/components/ues/report-kit";
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
  salePrice: string | null;
  priority: string;
  comment: string | null;
  dealerName: string | null;
}

interface Group {
  orderId: string;
  orderNumber: number;
  orderDate: string;
  salePrice: string | null;
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

// Кнопки и поля внутри строки заказа не должны её раскрывать и открывать документ.
const stopRow = (e: MouseEvent) => e.stopPropagation();
const noRowClick = { onClick: stopRow, onDoubleClick: stopRow };

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
  // Заказы свёрнуты в одну строку; раскрытые показывают створки.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const toggle = (orderId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(orderId)) next.add(orderId);
      return next;
    });

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
          orderDate: r.orderDate,
          salePrice: r.salePrice,
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
  const allOpen = groups.length > 0 && groups.every((g) => expanded.has(g.orderId));

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
          <span className="ues-toolbar-sep" />
          <button
            type="button"
            className="ues-btn h-8"
            disabled={!groups.length}
            onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((g) => g.orderId)))}
          >
            {allOpen ? <ChevronsDownUp className="h-4 w-4" /> : <ChevronsUpDown className="h-4 w-4" />}
            {allOpen ? "Свернуть все" : "Раскрыть все"}
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
          <div className="ues-table-wrap">
            <table className="ues-table ues-prod-table">
              <colgroup>
                <col style={{ width: 38 }} />
                <col style={{ width: 92 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: 104 }} />
                <col style={{ width: 170 }} />
                <col style={{ width: 66 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 84 }} />
                <col />
                <col style={{ width: 172 }} />
              </colgroup>
              <thead>
                <tr>
                  <th aria-label="Раскрыть" />
                  <th>Дата</th>
                  <th>Заказ</th>
                  <th className="text-right">Сумма</th>
                  <th>Контрагент</th>
                  <th className="text-right">Створок</th>
                  <th>Готово</th>
                  <th>Срочность</th>
                  <th>{mode === "work" ? "В работе" : "Передан"}</th>
                  <th>Комментарий</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const a = age(g.sentAt);
                  const allReady = g.ready === g.total;
                  const open = expanded.has(g.orderId);
                  return (
                    <Fragment key={g.orderId}>
                      <tr
                        className={cn("is-clickable ues-prod-row", open && "is-open", g.priority === "Срочно" && "is-urgent")}
                        onClick={() => toggle(g.orderId)}
                        onDoubleClick={() => navigate(`/orders/doc/${g.orderId}`)}
                        title="Щелчок — створки, двойной щелчок — открыть заказ"
                        data-testid={`production-order-${g.orderId}`}
                      >
                        <td {...noRowClick}>
                          <button
                            type="button"
                            className="ues-expander"
                            aria-expanded={open}
                            aria-label={open ? `Свернуть створки заказа №${g.orderNumber}` : `Показать створки заказа №${g.orderNumber}`}
                            onClick={() => toggle(g.orderId)}
                          >
                            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                          </button>
                        </td>
                        <td className="tabular-nums">{fmtDate(g.orderDate)}</td>
                        <td {...noRowClick}>
                          <button type="button" className="ues-prod-title" onClick={() => navigate(`/orders/doc/${g.orderId}`)} title="Открыть заказ">
                            №{g.orderNumber}
                          </button>
                        </td>
                        <td className="text-right font-semibold tabular-nums">{fmtMoney(parseFloat(g.salePrice || "0"))}</td>
                        <td className="truncate" title={g.dealerName || "Розница"}>
                          {g.dealerName || <span className="ues-muted">Розница</span>}
                        </td>
                        <td className="text-right tabular-nums">{g.total}</td>
                        <td>
                          <span className={cn("ues-prod-progress", allReady && "is-done")}>
                            <i style={{ width: `${(g.ready / g.total) * 100}%` }} />
                            <b>
                              {g.ready} из {g.total}
                            </b>
                          </span>
                        </td>
                        <td {...noRowClick}>
                          <select
                            className={cn("ues-priority-pill", `is-${PRIORITY_RANK[g.priority] ?? 2}`)}
                            value={g.priority}
                            aria-label={`Срочность заказа №${g.orderNumber}`}
                            onChange={(e) => setPriority.mutate({ orderId: g.orderId, priority: e.target.value })}
                          >
                            {PRODUCTION_PRIORITIES.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <span className={cn("ues-age-pill", a.tone)} title={`Передан ${dateTime(g.sentAt)}`}>
                            {a.label}
                          </span>
                        </td>
                        <td className="truncate" title={g.comment ?? undefined}>
                          {g.comment || <span className="ues-muted">—</span>}
                        </td>
                        <td className="text-right" {...noRowClick}>
                          {mode === "work" ? (
                            <button
                              type="button"
                              className="ues-btn soft-success h-7 px-2 text-[12px]"
                              disabled={busy}
                              onClick={() => act.mutate({ url: `/api/orders/${g.orderId}/production/ready`, done: `Заказ №${g.orderNumber}: всё готово` })}
                              title="Отметить готовыми все створки заказа в работе"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Готов весь заказ
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ues-btn ship h-7 px-2 text-[12px]"
                              disabled={busy || !allReady || g.orderStatus !== "Готов"}
                              title={allReady ? "Отгрузить заказ покупателю" : `Не готово ${g.total - g.ready} изд.`}
                              onClick={() => ship.mutate(g.orderId)}
                            >
                              <span className="ues-action-icon" aria-hidden="true">→</span>
                              Отгрузить
                            </button>
                          )}
                        </td>
                      </tr>
                      {open && (
                        <tr className="ues-prod-detail">
                          <td colSpan={11}>
                            <table className="ues-table">
                              <thead>
                                <tr>
                                  <th className="w-[42px]">№</th>
                                  <th className="w-[120px]">Комната</th>
                                  <th className="w-[130px] text-right">Ширина × высота, см</th>
                                  <th>Система</th>
                                  <th>Ткань</th>
                                  <th className="w-[60px]">Упр.</th>
                                  <th className="w-[120px]">{mode === "work" ? "Передано" : "Готово"}</th>
                                  <th className={mode === "work" ? "w-[96px]" : "w-[190px]"} />
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
                                          className="ues-btn soft-success h-7 px-2 text-[12px]"
                                          disabled={busy}
                                          onClick={() => act.mutate({ url: `/api/production/sashes/${r.id}/ready`, done: "Створка готова" })}
                                          data-testid={`button-ready-${r.id}`}
                                        >
                                          <Check className="h-3.5 w-3.5" />
                                          Готов
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          className="ues-btn h-7 px-2 text-[12px]"
                                          disabled={busy}
                                          onClick={() => act.mutate({ url: `/api/production/sashes/${r.id}/undo`, done: "Готовность отменена" })}
                                          title={g.orderStatus === "Готов" ? "Заказ вернётся в производство, списание материалов отменится" : undefined}
                                        >
                                          <RotateCcw className="h-3.5 w-3.5" />
                                          Отменить готовность
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}

export const ProductionWorkPage = () => <ProductionPage mode="work" />;
export const ProductionReadyPage = () => <ProductionPage mode="ready" />;
