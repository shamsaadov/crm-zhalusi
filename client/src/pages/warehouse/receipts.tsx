// Журнал «Поступления товаров» (ПТ) в стиле УЭС.

import { useMemo, useRef, useState } from "react";
import { useJournalBottomScroll } from "@/lib/journal-scroll";
import { DayRow, groupByDay } from "@/components/ues/day-rows";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Plus, Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { PeriodToolbar, fmtDate, fmtMoney, periodPreset } from "@/components/ues/report-kit";
import { useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";
import type { Supplier, WarehouseReceipt } from "@shared/schema";

interface ReceiptRow extends WarehouseReceipt {
  supplier?: Supplier;
  itemsCount?: number;
}

export default function ReceiptsJournalPage() {
  const [, navigate] = useLocation();
  const [period, setPeriod] = useStoredState("journal:receipts:period", () => periodPreset("month"));
  const [supplierId, setSupplierId] = useStoredState("journal:receipts:supplier", () => "all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const { data: suppliers = [] } = useQuery<Supplier[]>({ queryKey: ["/api/suppliers"] });
  const params = new URLSearchParams({ from: period.from, to: period.to });
  if (supplierId !== "all") params.set("supplierId", supplierId);
  const qs = params.toString();
  const { data: receipts = [], isLoading } = useQuery<ReceiptRow[]>({
    queryKey: ["/api/warehouse", qs],
    queryFn: async () => {
      const r = await fetch(`/api/warehouse?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Не удалось загрузить поступления");
      return r.json();
    },
  });

  // Поступления без поставщика — это корректировки остатков, у них свой журнал.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts
      .filter((r) => !!r.supplierId)
      .filter((r) => !q || `${r.supplier?.name ?? ""} ${r.comment ?? ""} ${r.total}`.toLowerCase().includes(q))
      // Как в УЭС: старые сверху, новые снизу.
      .sort((a, b) => a.date.localeCompare(b.date) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));
  }, [receipts, search]);
  const tableRef = useRef<HTMLDivElement>(null);
  useJournalBottomScroll(tableRef, rows.map((r) => r.id));
  const total = rows.reduce((s, r) => s + parseFloat(r.total ?? "0"), 0);

  return (
    <Layout title="Поступления товаров" caption="Журнал документов · ПТ">
      <div className="space-y-3">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod}>
          <span className="ues-toolbar-sep" />
          <select
            className="ues-input"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            aria-label="Поставщик"
          >
            <option value="all">Все поставщики</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </PeriodToolbar>

        <div className="ues-toolbar">
          <Link href="/warehouse/receipt/new" className="ues-btn primary" data-testid="button-create-receipt">
            <Plus className="h-4 w-4" />
            Создать поступление
          </Link>
          <Link href="/warehouse/classic" className="ues-btn">
            Прежний экран склада
          </Link>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[260px] !pl-8"
              placeholder="Поиск по журналу"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[12px] text-[var(--ues-muted)]">Найдено: {rows.length}</span>
        </div>

        <div ref={tableRef} className="ues-table-wrap max-h-[calc(100vh-260px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th className="w-[100px]">Дата</th>
                <th>Поставщик</th>
                <th className="num w-[90px]">Позиций</th>
                <th>Комментарий</th>
                <th className="num w-[160px]">Сумма</th>
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
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="ues-muted py-6 text-center">
                    За период поступлений нет
                  </td>
                </tr>
              )}
              {groupByDay(rows, (r) => r.date, (r) => parseFloat(r.total ?? "0")).map((g) =>
                g.kind === "day" ? (
                  <DayRow
                    key={`day-${g.date}`}
                    date={g.date}
                    count={g.count}
                    sum={g.sum}
                    colSpan={5}
                    noun={["поступление", "поступления", "поступлений"]}
                  />
                ) : ((r: ReceiptRow) => (
                <tr
                  key={r.id}
                  className={cn("is-clickable", selected === r.id && "is-selected")}
                  onClick={() => setSelected(r.id)}
                  onDoubleClick={() => navigate(`/warehouse/receipt/${r.id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/warehouse/receipt/${r.id}`)}
                  tabIndex={0}
                  data-testid={`receipt-row-${r.id}`}
                >
                  <td>{fmtDate(r.date)}</td>
                  <td className="font-medium">{r.supplier?.name ?? "—"}</td>
                  <td className="num">{r.itemsCount ?? "—"}</td>
                  <td className="max-w-[360px] truncate" title={r.comment ?? ""}>
                    {r.comment || <span className="ues-muted">—</span>}
                  </td>
                  <td className="num font-semibold">{fmtMoney(parseFloat(r.total ?? "0"))}</td>
                </tr>
              ))(g.item)
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={4}>Итого</td>
                  <td className="num">{fmtMoney(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">
          Двойной щелчок или Enter — открыть документ. Оприходование излишков без поставщика — в журнале корректировок.
        </p>
      </div>
    </Layout>
  );
}
