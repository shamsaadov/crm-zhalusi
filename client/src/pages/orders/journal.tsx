// Журнал «Заказы покупателей» (ЗП) как в УЭС (ErpDocumentJournal, isCustomerOrders):
// значки оплаты/производства/материалов/отгрузки, панель Создать · Печать · Отгрузить · ПКО,
// поиск, фильтр с плашками, выбор нескольких заказов через Ctrl/⌘.

import { useEffect, useMemo, useRef, useState } from "react";
import { useJournalBottomScroll } from "@/lib/journal-scroll";
import { DayRow, groupByDay } from "@/components/ues/day-rows";
import { format } from "date-fns";
import {
  AlertTriangle,
  ChevronDown,
  Factory,
  Filter,
  Package,
  Plus,
  Printer,
  RotateCcw,
  RefreshCw,
  Scissors,
  Search,
  Trash2,
  Truck,
  Wallet,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/status-badge";
import { fmtDate, fmtMoney, periodPreset, type PeriodPreset } from "@/components/ues/report-kit";
import { cn } from "@/lib/utils";
import { ORDER_STATUSES, type Dealer, type OrderStatus } from "@shared/schema";
import type { FabricWithStock, OrderWithRelations } from "./types";

export type OrderTypeFilter = "all" | "sash" | "product" | "app";
export type PaymentFilter = "all" | "full" | "partial" | "none";

export interface OrdersJournalProps {
  orders: OrderWithRelations[];
  isLoading: boolean;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  loadMoreRef?: React.RefObject<HTMLDivElement>;

  search: string;
  onSearchChange: (v: string) => void;
  dateRange: { from?: Date; to?: Date };
  onDateRangeChange: (r: { from?: Date; to?: Date }) => void;
  statusFilter: string;
  onStatusFilterChange: (v: string) => void;
  dealerFilter: string;
  onDealerFilterChange: (v: string) => void;
  orderTypeFilter: OrderTypeFilter;
  onOrderTypeFilterChange: (v: OrderTypeFilter) => void;
  pendingAppCount: number;

  dealers: (Dealer & { balance?: number })[];
  fabricStock?: FabricWithStock[];
  showProfit: boolean;

  onCreate: () => void;
  onCreateProduct: () => void;
  onSendToProduction: (orders: OrderWithRelations[]) => Promise<void>;
  onOpen: (o: OrderWithRelations) => void;
  onCutting: (o: OrderWithRelations) => void;
  onWorkshopPrint: (o: OrderWithRelations) => void;
  onCustomerPrint: (o: OrderWithRelations) => void;
  onDelete: (o: OrderWithRelations) => void;
  onStatusChange: (id: string, status: string) => Promise<unknown> | void;
  onReceipt: (o: OrderWithRelations) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  showMarked: boolean;
  onShowMarkedChange: (v: boolean) => void;
  onRestore: (o: OrderWithRelations) => void;

  /** Содержимое вкладки «Из приложения». */
  appTab: React.ReactNode;
}

function missingPriceFabrics(order: OrderWithRelations, fabricStock?: FabricWithStock[]) {
  if (!fabricStock || !order.fabricIds?.length) return [];
  return order.fabricIds
    .map((id) => {
      const f = fabricStock.find((x) => x.id === id);
      if (!f) return null;
      const stockPrice = f.stock?.avgPrice ?? 0;
      const manual = parseFloat((f as any).price?.toString() || "0") || 0;
      return (stockPrice > 0 ? stockPrice : manual) > 0 ? null : f.name;
    })
    .filter((n): n is string => !!n);
}

const toKey = (d?: Date) => (d ? format(d, "yyyy-MM-dd") : "");
const fromKey = (s: string) => (s ? new Date(`${s}T00:00:00`) : undefined);

const PERIOD_PRESETS: { key: PeriodPreset | "all"; label: string }[] = [
  { key: "all", label: "За всё время" },
  { key: "month", label: "Этот месяц" },
  { key: "prevMonth", label: "Прошлый месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
];

const PAYMENT_LABEL: Record<Exclude<PaymentFilter, "all">, string> = {
  full: "Оплачен",
  partial: "Частично оплачен",
  none: "Не оплачен",
};

type ProductionDot = "full" | "partial" | "sent" | "none";

/** Значок «Производство» (как в УЭС): передан → частично готов → готов. */
export function productionState(o: OrderWithRelations): ProductionDot {
  const status = o.status || "Новый";
  if (status === "Готов" || status === "Отгружен") return "full";
  const total = o.productionTotal ?? 0;
  const ready = o.productionReady ?? 0;
  if (total > 0 && ready >= total) return "full";
  if (ready > 0) return "partial";
  if ((o.productionSent ?? 0) > 0 || status === "В производстве") return "sent";
  return "none";
}

function productionTitle(o: OrderWithRelations, state: ProductionDot) {
  const total = o.productionTotal ?? 0;
  const ready = o.productionReady ?? 0;
  const sent = o.productionSent ?? 0;
  if (state === "full") return total ? `Готово с производства: ${total} из ${total}` : "Заказ готов";
  if (state === "partial") return `Частично готов: ${ready} из ${total}`;
  if (state === "sent") return sent < total ? `Передано в производство: ${sent} из ${total}` : "Передан в производство";
  return "В производство не передан";
}

/** Отгрузить можно только готовое с производства (товар без производства — сразу). */
export function isReadyToShip(o: OrderWithRelations) {
  if (o.status === "Отгружен" || o.deletedAt) return false;
  if (o.status === "Готов") return true;
  const total = o.productionTotal ?? 0;
  return total === 0 ? o.orderType === "product" : (o.productionReady ?? 0) >= total;
}

function Dot({ state, title }: { state: ProductionDot; title: string }) {
  return (
    <span
      className={cn(
        "ues-order-dot",
        state === "full" && "is-active",
        state === "partial" && "is-partial",
        state === "sent" && "is-outline-success"
      )}
      title={title}
      aria-label={title}
    />
  );
}

export function OrdersJournal(p: OrdersJournalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Сервер отдаёт заказы от новых к старым порциями; показываем как в УЭС —
  // старые сверху, новые снизу. Более старые порции догружаются при прокрутке вверх.
  const rows = useMemo(() => {
    const list = paymentFilter === "all" ? p.orders : p.orders.filter((o) => (o.paymentState ?? "none") === paymentFilter);
    return [...list].reverse();
  }, [p.orders, paymentFilter]);
  const tableRef = useRef<HTMLDivElement>(null);
  useJournalBottomScroll(tableRef, rows.map((o) => o.id));
  const selected = rows.filter((o) => selectedIds.includes(o.id));
  const single = selected.length === 1 ? selected[0] : null;

  // Снимаем выделение с заказов, которые ушли из списка (фильтр, удаление).
  useEffect(() => {
    setSelectedIds((ids) => ids.filter((id) => rows.some((o) => o.id === id)));
  }, [rows]);

  // Ctrl+F — в поиск журнала.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const select = (e: React.MouseEvent, o: OrderWithRelations) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((ids) => (ids.includes(o.id) ? ids.filter((x) => x !== o.id) : [...ids, o.id]));
    } else {
      setSelectedIds([o.id]);
    }
  };

  // Отгрузить: только готовые с производства и с ценами тканей (как в УЭС).
  const notShipped = selected.filter((o) => o.status !== "Отгружен" && !o.deletedAt);
  const shippable = notShipped.filter(isReadyToShip);
  const notReady = notShipped.filter((o) => !isReadyToShip(o));
  const shipBlockedBy = shippable.flatMap((o) => missingPriceFabrics(o, p.fabricStock).map((f) => `№${o.orderNumber}: ${f}`));
  const shipTitle = !selected.length
    ? "Выберите заказ в списке"
    : !notShipped.length
      ? "Выбранные заказы уже отгружены"
      : notReady.length
        ? `Сначала производство: не готов ${notReady.map((o) => `№${o.orderNumber}`).join(", ")}`
      : shipBlockedBy.length
        ? `Укажите цену ткани — ${shipBlockedBy.join(", ")}`
        : shippable.length > 1
          ? "Отгрузить выбранные заказы"
          : "Отгрузить выбранный заказ";
  const ship = async () => {
    if (!shippable.length || notReady.length || shipBlockedBy.length) return;
    setBusy(true);
    try {
      for (const o of shippable) await p.onStatusChange(o.id, "Отгружен");
    } finally {
      setBusy(false);
    }
  };

  // Передать в производство: есть изделия, ещё не переданные в цех.
  const sendable = selected.filter(
    (o) => !o.deletedAt && o.status !== "Отгружен" && (o.productionSent ?? 0) < (o.productionTotal ?? 0)
  );
  const sendToProduction = async () => {
    if (!sendable.length) return;
    setBusy(true);
    try {
      await p.onSendToProduction(sendable);
    } finally {
      setBusy(false);
    }
  };

  const receiptTarget = single && !single.deletedAt && (single.paymentState ?? "none") !== "full" ? single : null;

  // Плашки активных фильтров (JournalFilterBar в УЭС).
  const chips: { key: string; label: string; clear: () => void }[] = [];
  if (p.dateRange.from || p.dateRange.to) {
    chips.push({
      key: "period",
      label: `Период: ${p.dateRange.from ? fmtDate(toKey(p.dateRange.from)) : "…"} — ${p.dateRange.to ? fmtDate(toKey(p.dateRange.to)) : "…"}`,
      clear: () => p.onDateRangeChange({}),
    });
  }
  if (p.statusFilter !== "all") chips.push({ key: "status", label: `Статус: ${p.statusFilter}`, clear: () => p.onStatusFilterChange("all") });
  if (p.dealerFilter !== "all") {
    const d = p.dealers.find((x) => x.id === p.dealerFilter);
    chips.push({ key: "dealer", label: `Контрагент: ${d?.fullName ?? "—"}`, clear: () => p.onDealerFilterChange("all") });
  }
  if (paymentFilter !== "all") chips.push({ key: "payment", label: `Оплата: ${PAYMENT_LABEL[paymentFilter]}`, clear: () => setPaymentFilter("all") });
  const resetAll = () => {
    p.onDateRangeChange({});
    p.onStatusFilterChange("all");
    p.onDealerFilterChange("all");
    setPaymentFilter("all");
  };

  const isApp = p.orderTypeFilter === "app";
  const colCount = 10 + (p.showProfit ? 1 : 0);

  return (
    <div className="space-y-3">
      <div className="ues-toolbar">
        <div className="ues-split-btn">
          <button type="button" className="ues-btn primary" onClick={p.onCreate} data-testid="button-add-order">
            <Plus className="h-4 w-4" />
            Создать
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="ues-btn primary !px-1.5" aria-label="Другие виды заказа">
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={p.onCreate}>Заказ покупателя (изделия)</DropdownMenuItem>
              <DropdownMenuItem onClick={p.onCreateProduct}>Заказ товара (комплектующие)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ues-btn" disabled={!single}>
              <Printer className="h-4 w-4" />
              Печать
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => single && p.onWorkshopPrint(single)}>Технологическая карта (цех)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => single && p.onCustomerPrint(single)}>Накладная для клиента</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ues-toolbar-sep" />
        <button
          type="button"
          className="ues-btn production"
          disabled={!sendable.length || busy}
          title={
            !selected.length
              ? "Выберите заказ в списке"
              : sendable.length
                ? "Передать изделия в производство"
                : "Всё уже передано в производство"
          }
          onClick={sendToProduction}
          data-testid="button-send-production"
        >
          <span className="ues-action-icon" aria-hidden="true">⚙</span>
          {sendable.length > 1 ? `В производство (${sendable.length})` : "В производство"}
        </button>
        <button
          type="button"
          className="ues-btn ship"
          disabled={!shippable.length || notReady.length > 0 || shipBlockedBy.length > 0 || busy}
          title={shipTitle}
          onClick={ship}
          data-testid="button-ship-orders"
        >
          <span className="ues-action-icon" aria-hidden="true">→</span>
          {shippable.length > 1 ? `Отгрузить (${shippable.length})` : "Отгрузить"}
        </button>
        <button
          type="button"
          className="ues-btn soft-success"
          disabled={!receiptTarget}
          title={!single ? "Выберите один заказ" : receiptTarget ? "Приходный кассовый ордер по заказу" : "Заказ уже оплачен полностью"}
          onClick={() => receiptTarget && p.onReceipt(receiptTarget)}
          data-testid="button-order-receipt"
        >
          <span className="ues-action-icon" aria-hidden="true">К</span>
          ПКО
        </button>
        <button type="button" className="ues-btn" disabled={!single} onClick={() => single && p.onCutting(single)} title="Раскрой ткани по заказу">
          <Scissors className="h-4 w-4" />
          Раскрой
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="ues-btn" disabled={!selected.length || busy}>
              Статус
              <ChevronDown className="h-3.5 w-3.5 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {ORDER_STATUSES.map((s) => {
              const blocked = s === "Отгружен" && shipBlockedBy.length > 0;
              return (
                <DropdownMenuItem
                  key={s}
                  disabled={blocked}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      for (const o of selected) if (o.status !== s) await p.onStatusChange(o.id, s);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <StatusBadge status={s as OrderStatus} />
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {single?.deletedAt ? (
          <button type="button" className="ues-btn" onClick={() => p.onRestore(single)} data-testid="button-unmark-order">
            <RotateCcw className="h-4 w-4" />
            Снять пометку
          </button>
        ) : (
          <button
            type="button"
            className="ues-btn danger"
            disabled={!single}
            onClick={() => single && p.onDelete(single)}
            data-testid="button-delete-order"
          >
            <Trash2 className="h-4 w-4" />
            Пометить на удаление
          </button>
        )}
        <button
          type="button"
          className={cn("ues-btn", p.showMarked && "is-active")}
          onClick={() => p.onShowMarkedChange(!p.showMarked)}
          title="Показать заказы, помеченные на удаление"
        >
          Помеченные
        </button>
        <span className="ues-toolbar-sep" />
        <button type="button" className="ues-btn" onClick={p.onRefresh} disabled={p.isRefreshing} title="Обновить данные">
          <RefreshCw className={cn("h-4 w-4", p.isRefreshing && "animate-spin")} />
        </button>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
          <input
            ref={searchRef}
            className="ues-input w-[260px] !pl-8 !pr-7"
            placeholder="Номер, дилер или комментарий"
            value={p.search}
            onChange={(e) => p.onSearchChange(e.target.value)}
            data-testid="input-orders-search"
          />
          {p.search && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--ues-muted)] hover:text-[var(--ues-text)]"
              onClick={() => p.onSearchChange("")}
              aria-label="Очистить поиск"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <FilterPopover {...p} paymentFilter={paymentFilter} onPaymentFilterChange={setPaymentFilter} activeCount={chips.length} />
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <span key={c.key} className="ues-chip">
              {c.label}
              <button type="button" onClick={c.clear} aria-label={`Убрать фильтр «${c.label}»`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <button type="button" className="text-[12.5px] font-semibold text-[var(--ues-primary-text)] hover:underline" onClick={resetAll}>
            Сбросить всё
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["all", "Все заказы"],
            ["sash", "Со створками"],
            ["product", "Комплектующие"],
            ["app", "Из приложения"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={cn("ues-btn h-8", p.orderTypeFilter === k && "is-active")}
            onClick={() => {
              p.onOrderTypeFilterChange(k);
              setSelectedIds([]);
            }}
          >
            {label}
            {k === "app" && p.pendingAppCount > 0 && <span className="ues-count-badge">{p.pendingAppCount}</span>}
          </button>
        ))}
      </div>

      {isApp ? (
        p.appTab
      ) : (
        <>
          <div ref={tableRef} className="ues-table-wrap max-h-[calc(100vh-290px)]">
            {p.loadMoreRef && (
              <div ref={p.loadMoreRef} className="text-center text-[12px] text-[var(--ues-muted)]">
                {p.isFetchingNextPage ? <div className="py-1.5">Загрузка более ранних заказов…</div> : null}
              </div>
            )}
            <table className="ues-table ues-orders-table">
              <thead>
                <tr>
                  <th className="ues-ind-head" title="Заказ полностью оплачен">
                    <span><Wallet className="h-3.5 w-3.5" /></span>
                  </th>
                  <th className="ues-ind-head" title="Производство: передан / готов">
                    <span><Factory className="h-3.5 w-3.5" /></span>
                  </th>
                  <th className="ues-ind-head" title="Материалы списаны со склада">
                    <span><Package className="h-3.5 w-3.5" /></span>
                  </th>
                  <th className="ues-ind-head" title="Заказ отгружен">
                    <span><Truck className="h-3.5 w-3.5" /></span>
                  </th>
                  <th className="w-[96px]">Дата</th>
                  <th className="num">Сумма документа</th>
                  <th>Контрагент</th>
                  <th className="num w-[70px]">Створок</th>
                  <th className="w-[130px]">Статус</th>
                  <th>Комментарий</th>
                  <th className="num" title="Долг дилера по отгрузкам плюс ожидаемые отгрузки (неотгруженные заказы) минус оплаты">
                    Общий долг
                  </th>
                  {p.showProfit && <th className="num">Прибыль</th>}
                </tr>
              </thead>
              <tbody>
                {p.isLoading && (
                  <tr>
                    <td colSpan={colCount + 1} className="ues-muted py-6 text-center">
                      Загрузка…
                    </td>
                  </tr>
                )}
                {!p.isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount + 1} className="ues-muted py-6 text-center">
                      Заказы не найдены
                    </td>
                  </tr>
                )}
                {groupByDay(rows, (o) => o.date, (o) => parseFloat(o.salePrice?.toString() || "0")).map((g) => {
                  if (g.kind === "day") {
                    return (
                      <DayRow
                        key={`day-${g.date}`}
                        date={g.date}
                        count={g.count}
                        sum={g.sum}
                        colSpan={colCount + 1}
                        noun={["заказ", "заказа", "заказов"]}
                      />
                    );
                  }
                  const o = g.item;
                  const status = (o.status as OrderStatus) || "Новый";
                  const pay = o.paymentState ?? "none";
                  const production = productionState(o);
                  const missing = missingPriceFabrics(o, p.fabricStock);
                  const debt = typeof o.dealerBalance === "number" ? -o.dealerBalance : null;
                  const profit =
                    parseFloat(o.salePrice?.toString() || "0") - parseFloat(o.costPrice?.toString() || "0");
                  return (
                    <tr
                      key={o.id}
                      tabIndex={0}
                      className={cn("is-clickable", selectedIds.includes(o.id) && "is-selected", o.deletedAt && "is-marked-row")}
                      title={o.deletedAt ? "Помечен на удаление" : undefined}
                      onClick={(e) => select(e, o)}
                      onDoubleClick={() => p.onOpen(o)}
                      onKeyDown={(e) => e.key === "Enter" && p.onOpen(o)}
                      data-testid={`row-${o.id}`}
                    >
                      <td className="ues-ind-cell">
                        {o.deletedAt ? (
                          <span className="ues-mark-x" title="Помечен на удаление">×</span>
                        ) : (
                        <Dot
                          state={pay}
                          title={
                            pay === "full"
                              ? "Заказ полностью оплачен"
                              : pay === "partial"
                                ? `Оплачен частично: ${fmtMoney(o.paidAmount ?? 0)}`
                                : "Оплаты по заказу нет"
                          }
                        />
                        )}
                      </td>
                      <td className="ues-ind-cell">
                        <Dot
                          state={production}
                          title={productionTitle(o, production)}
                        />
                      </td>
                      <td className="ues-ind-cell">
                        <Dot
                          state={o.materialsWrittenOff ? "full" : "none"}
                          title={o.materialsWrittenOff ? "Материалы списаны со склада" : "Материалы не списаны"}
                        />
                      </td>
                      <td className="ues-ind-cell">
                        <Dot
                          state={status === "Отгружен" ? "full" : "none"}
                          title={status === "Отгружен" ? `Отгружен${o.shippedAt ? ` ${fmtDate(o.shippedAt)}` : ""}` : "Заказ не отгружен"}
                        />
                      </td>
                      <td>{fmtDate(o.date)}</td>
                      <td className="num font-semibold">{fmtMoney(parseFloat(o.salePrice?.toString() || "0"))}</td>
                      <td className="max-w-[220px] truncate" title={o.dealer?.fullName ?? ""}>
                        {o.dealer?.fullName ?? <span className="ues-muted">Розница</span>}
                      </td>
                      <td className="num">{o.sashesCount || 0}</td>
                      <td>
                        <span className="inline-flex items-center gap-1">
                          <StatusBadge status={status} />
                          {missing.length > 0 && status !== "Отгружен" && (
                            <span title={`Не указана цена ткани: ${missing.join(", ")} — отгрузить нельзя`}>
                              <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-label="Не указана цена ткани" />
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="max-w-[520px] truncate" title={o.comment ?? ""}>
                        {o.comment || <span className="ues-muted">—</span>}
                      </td>
                      <td
                        className={cn("num", debt !== null && debt > 0.004 && "ues-neg", debt !== null && debt < -0.004 && "ues-pos")}
                        title={
                          debt === null
                            ? undefined
                            : `Долг по отгрузкам: ${fmtMoney(o.dealerShippedDebt ?? 0)}\nОжидаемые отгрузки: ${fmtMoney(
                                debt - (o.dealerShippedDebt ?? 0)
                              )}\nОбщий долг: ${fmtMoney(debt)}`
                        }
                      >
                        {debt === null ? "—" : debt < -0.004 ? `аванс ${fmtMoney(-debt)}` : fmtMoney(debt)}
                      </td>
                      {p.showProfit && (
                        <td className={cn("num", profit < 0 ? "ues-neg" : "ues-pos")}>{fmtMoney(profit)}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-[var(--ues-muted)]">
            Новые заказы внизу, более ранние догружаются при прокрутке вверх. Двойной щелчок или Enter — открыть заказ. Ctrl или ⌘ + щелчок — выбрать несколько заказов для отгрузки или
            смены статуса. Оплата распределяется по заказам дилера от старых к новым.
          </p>
        </>
      )}
    </div>
  );
}

function FilterPopover(
  p: OrdersJournalProps & {
    paymentFilter: PaymentFilter;
    onPaymentFilterChange: (v: PaymentFilter) => void;
    activeCount: number;
  }
) {
  const from = toKey(p.dateRange.from);
  const to = toKey(p.dateRange.to);
  const activePreset =
    !from && !to
      ? "all"
      : PERIOD_PRESETS.find((x) => {
          if (x.key === "all") return false;
          const r = periodPreset(x.key);
          return r.from === from && r.to === to;
        })?.key;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("ues-btn", p.activeCount > 0 && "is-active")} data-testid="button-orders-filter">
          <Filter className="h-4 w-4" />
          Фильтр
          {p.activeCount > 0 && <span className="ues-count-badge">{p.activeCount}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] space-y-4 p-4">
        <div>
          <div className="ues-group-title mb-2">Период</div>
          <div className="flex flex-wrap gap-1.5">
            {PERIOD_PRESETS.map((x) => (
              <button
                key={x.key}
                type="button"
                className={cn("ues-btn h-7 px-2.5 text-[12px]", activePreset === x.key && "is-active")}
                onClick={() => {
                  if (x.key === "all") p.onDateRangeChange({});
                  else {
                    const r = periodPreset(x.key);
                    p.onDateRangeChange({ from: fromKey(r.from), to: fromKey(r.to) });
                  }
                }}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="date"
              className="ues-input h-8 flex-1"
              value={from}
              max={to || undefined}
              onChange={(e) => p.onDateRangeChange({ ...p.dateRange, from: fromKey(e.target.value) })}
              aria-label="С даты"
            />
            <span className="text-[var(--ues-muted)]">—</span>
            <input
              type="date"
              className="ues-input h-8 flex-1"
              value={to}
              min={from || undefined}
              onChange={(e) => p.onDateRangeChange({ ...p.dateRange, to: fromKey(e.target.value) })}
              aria-label="По дату"
            />
          </div>
        </div>
        <div>
          <div className="ues-group-title mb-2">Статус</div>
          <div className="flex flex-wrap gap-1.5">
            {["all", ...ORDER_STATUSES].map((s) => (
              <button
                key={s}
                type="button"
                className={cn("ues-btn h-7 px-2.5 text-[12px]", p.statusFilter === s && "is-active")}
                onClick={() => p.onStatusFilterChange(s)}
              >
                {s === "all" ? "Все" : s}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="ues-group-title mb-2">Оплата</div>
          <div className="flex flex-wrap gap-1.5">
            {(["all", "full", "partial", "none"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className={cn("ues-btn h-7 px-2.5 text-[12px]", p.paymentFilter === s && "is-active")}
                onClick={() => p.onPaymentFilterChange(s)}
              >
                {s === "all" ? "Все" : PAYMENT_LABEL[s]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-[var(--ues-muted)]">Фильтр по оплате применяется к загруженным заказам.</p>
        </div>
        <div>
          <div className="ues-group-title mb-2">Контрагент</div>
          <select
            className="ues-input h-8 w-full"
            value={p.dealerFilter}
            onChange={(e) => p.onDealerFilterChange(e.target.value)}
            aria-label="Контрагент"
          >
            <option value="all">Все контрагенты</option>
            {p.dealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
