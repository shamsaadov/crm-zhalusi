// Журналы денежных документов в стиле УЭС (ErpDocumentJournal):
// ПКО — поступления, РКО — выплаты и оплаты поставщикам, ПД — перемещения, плюс общий журнал.

import { useMemo, useRef, useState } from "react";
import { useJournalBottomScroll } from "@/lib/journal-scroll";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Search, Trash2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { PeriodToolbar, fmtDate, fmtMoney, periodPreset } from "@/components/ues/report-kit";
import { useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";
import { resolveOperationType } from "@shared/finance";
import type { Cashbox, FinanceOperation } from "@shared/schema";

export type CashDocKind = "income" | "expense" | "transfer" | "all";

interface EnrichedOperation extends FinanceOperation {
  dealer?: { fullName: string } | null;
  supplier?: { name: string } | null;
  cashbox?: { name: string } | null;
  fromCashbox?: { name: string } | null;
  toCashbox?: { name: string } | null;
  expenseType?: { name: string; operationType: string | null } | null;
}

const KIND_CONFIG: Record<
  CashDocKind,
  { title: string; caption: string; types: string; createLabel?: string; storage: string }
> = {
  income: {
    title: "Приходные кассовые ордера",
    caption: "Журнал документов · ПКО",
    types: "income",
    createLabel: "Создать ПКО",
    storage: "income",
  },
  expense: {
    title: "Расходные кассовые ордера",
    caption: "Журнал документов · РКО",
    types: "expense,supplier_payment",
    createLabel: "Создать РКО",
    storage: "expense",
  },
  transfer: {
    title: "Перемещения денег",
    caption: "Журнал документов · ПД",
    types: "transfer",
    createLabel: "Создать перемещение",
    storage: "transfer",
  },
  all: {
    title: "Все денежные операции",
    caption: "Журнал документов",
    types: "",
    storage: "all",
  },
};

export function docCode(op: Pick<FinanceOperation, "type">) {
  return op.type === "income" ? "ПКО" : op.type === "transfer" ? "ПД" : "РКО";
}

function counterparty(op: EnrichedOperation) {
  return op.dealer?.fullName ?? op.supplier?.name ?? null;
}

export function FinanceJournal({ kind }: { kind: CashDocKind }) {
  const cfg = KIND_CONFIG[kind];
  const [, navigate] = useLocation();
  const [period, setPeriod] = useStoredState(`journal:finance:${cfg.storage}:period`, () => periodPreset("month"));
  const [cashboxId, setCashboxId] = useStoredState(`journal:finance:${cfg.storage}:cashbox`, () => "all");
  const [search, setSearch] = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ["/api/cashboxes"] });

  const params = new URLSearchParams({ from: period.from, to: period.to });
  if (cfg.types) params.set("type", cfg.types);
  if (cashboxId !== "all") params.set("cashboxId", cashboxId);
  if (showDeleted) params.set("includeDrafts", "true");
  const qs = params.toString();

  const { data: ops = [], isLoading } = useQuery<EnrichedOperation[]>({
    queryKey: ["/api/finance", qs],
    queryFn: async () => {
      const res = await fetch(`/api/finance?${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Не удалось загрузить журнал");
      return res.json();
    },
  });

  // Как в УЭС: старые документы сверху, новые снизу (сервер отдаёт от новых к старым).
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...ops]
      .reverse()
      .map((op) => ({ op, operationType: resolveOperationType(op, op.expenseType) }))
      .filter(({ op, operationType }) => {
        if (!q) return true;
        const hay = [
          op.comment,
          counterparty(op),
          op.cashbox?.name,
          op.fromCashbox?.name,
          op.toCashbox?.name,
          op.expenseType?.name,
          operationType,
          String(op.amount),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }, [ops, search]);

  // Итоги считаем только по проведённым документам.
  const totals = rows.reduce(
    (t, { op }) => {
      if (op.isDraft) return t;
      const a = parseFloat(op.amount);
      if (op.type === "income") t.inflow += a;
      else if (op.type === "transfer") t.transfers += a;
      else t.outflow += a;
      return t;
    },
    { inflow: 0, outflow: 0, transfers: 0 }
  );

  const open = (id: string) => navigate(`/finance/doc/${id}`);
  const tableRef = useRef<HTMLDivElement>(null);
  useJournalBottomScroll(tableRef, rows.map(({ op }) => op.id));

  const cashboxCell = (op: EnrichedOperation) =>
    op.type === "transfer" ? (
      <span>
        {op.fromCashbox?.name ?? "—"} <span className="ues-muted">→</span> {op.toCashbox?.name ?? "—"}
      </span>
    ) : (
      op.cashbox?.name ?? "—"
    );

  return (
    <Layout title={cfg.title} caption={cfg.caption}>
      <div className="space-y-3">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod}>
          <span className="ues-toolbar-sep" />
          <select
            className="ues-input"
            value={cashboxId}
            onChange={(e) => setCashboxId(e.target.value)}
            aria-label="Касса"
            data-testid="select-journal-cashbox"
          >
            <option value="all">Все кассы</option>
            {cashboxes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </PeriodToolbar>

        <div className="ues-toolbar">
          {kind !== "all" ? (
            <Link href={`/finance/new/${kind}`} className="ues-btn primary" data-testid="button-create-document">
              <Plus className="h-4 w-4" />
              {cfg.createLabel}
            </Link>
          ) : (
            <>
              <Link href="/finance/new/income" className="ues-btn primary">
                <Plus className="h-4 w-4" />
                ПКО
              </Link>
              <Link href="/finance/new/expense" className="ues-btn">
                <Plus className="h-4 w-4" />
                РКО
              </Link>
              <Link href="/finance/new/transfer" className="ues-btn">
                <Plus className="h-4 w-4" />
                Перемещение
              </Link>
            </>
          )}
          <button
            type="button"
            className={cn("ues-btn", showDeleted && "is-active")}
            onClick={() => setShowDeleted((v) => !v)}
            data-testid="button-toggle-deleted"
          >
            <Trash2 className="h-4 w-4" />
            Удалённые
          </button>
          {kind === "all" && (
            <Link href="/finance/classic" className="ues-btn">
              Прежний журнал
            </Link>
          )}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[260px] !pl-8"
              placeholder="Поиск по журналу"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-journal-search"
            />
          </div>
          <span className="text-[12px] text-[var(--ues-muted)]">Найдено: {rows.length}</span>
        </div>

        <div ref={tableRef} className="ues-table-wrap max-h-[calc(100vh-260px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th className="w-[96px]">Дата</th>
                {kind === "all" && <th className="w-[60px]">Док.</th>}
                <th>{kind === "transfer" ? "Откуда → куда" : "Касса"}</th>
                {kind !== "transfer" && <th>Вид операции</th>}
                {kind !== "transfer" && <th>{kind === "expense" ? "Получатель" : "Контрагент"}</th>}
                {kind !== "transfer" && <th>Статья</th>}
                <th>Комментарий</th>
                {kind === "all" ? (
                  <>
                    <th className="num">Поступление</th>
                    <th className="num">Выплата</th>
                  </>
                ) : (
                  <th className="num">Сумма</th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="ues-muted py-6 text-center">
                    За период документов нет
                  </td>
                </tr>
              )}
              {rows.map(({ op, operationType }) => {
                const amount = parseFloat(op.amount);
                return (
                  <tr
                    key={op.id}
                    className={cn("is-clickable", selected === op.id && "is-selected", op.isDraft && "opacity-60")}
                    onClick={() => setSelected(op.id)}
                    onDoubleClick={() => open(op.id)}
                    onKeyDown={(e) => e.key === "Enter" && open(op.id)}
                    tabIndex={0}
                    data-testid={`journal-row-${op.id}`}
                  >
                    <td className="whitespace-nowrap">
                      {op.isDraft && <span className="mr-1 font-bold text-[var(--ues-danger)]" title="Удалён">×</span>}
                      {fmtDate(op.date)}
                    </td>
                    {kind === "all" && (
                      <td>
                        <span className="ues-link-code">{docCode(op)}</span>
                      </td>
                    )}
                    <td>{cashboxCell(op)}</td>
                    {kind !== "transfer" && <td>{operationType}</td>}
                    {kind !== "transfer" && <td>{counterparty(op) ?? <span className="ues-muted">—</span>}</td>}
                    {kind !== "transfer" && <td>{op.expenseType?.name ?? <span className="ues-muted">—</span>}</td>}
                    <td className="max-w-[320px] truncate" title={op.comment ?? ""}>
                      {op.comment || <span className="ues-muted">—</span>}
                    </td>
                    {kind === "all" ? (
                      <>
                        <td className="num ues-pos">{op.type === "income" ? fmtMoney(amount) : ""}</td>
                        <td className="num">
                          {op.type === "income" ? "" : op.type === "transfer" ? (
                            <span className="ues-muted">{fmtMoney(amount)}</span>
                          ) : (
                            fmtMoney(amount)
                          )}
                        </td>
                      </>
                    ) : (
                      <td className="num font-semibold">{fmtMoney(amount)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={kind === "all" ? 7 : kind === "transfer" ? 3 : 6}>Итого</td>
                  {kind === "all" ? (
                    <>
                      <td className="num">{fmtMoney(totals.inflow)}</td>
                      <td className="num">{fmtMoney(totals.outflow)}</td>
                    </>
                  ) : (
                    <td className="num">
                      {fmtMoney(kind === "income" ? totals.inflow : kind === "transfer" ? totals.transfers : totals.outflow)}
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">
          Двойной щелчок или Enter — открыть документ.
          {kind === "all" && " Перемещения показаны серым и в итог выплат не входят."}
        </p>
      </div>
    </Layout>
  );
}

export function IncomeJournalPage() {
  return <FinanceJournal kind="income" />;
}
export function ExpenseJournalPage() {
  return <FinanceJournal kind="expense" />;
}
export function TransferJournalPage() {
  return <FinanceJournal kind="transfer" />;
}
export function AllOperationsJournalPage() {
  return <FinanceJournal kind="all" />;
}
