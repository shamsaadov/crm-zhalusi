// Журнал «Списания» (СП): расход материалов в заказы и списания по корректировкам.

import { Fragment, useMemo, useRef, useState } from "react";
import { useJournalBottomScroll } from "@/lib/journal-scroll";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { PeriodToolbar, fmtDate, fmtMoney, periodPreset } from "@/components/ues/report-kit";
import { useStoredState } from "@/lib/report-query";
import type { Component, Fabric, Order, WarehouseWriteoff } from "@shared/schema";
import { fmtQty } from "./common";

interface WriteoffRow extends WarehouseWriteoff {
  order?: Order;
  fabric?: Fabric;
  component?: Component;
}

interface Group {
  key: string;
  orderId: string | null;
  title: string;
  date: string;
  total: number;
  items: WriteoffRow[];
}

export default function WriteoffsJournalPage() {
  const [period, setPeriod] = useStoredState("journal:writeoffs:period", () => periodPreset("month"));
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { data = [], isLoading } = useQuery<WriteoffRow[]>({ queryKey: ["/api/warehouse/writeoffs"] });

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, Group>();
    for (const w of data) {
      if (w.date < period.from || w.date > period.to) continue;
      const name = w.fabric?.name ?? w.component?.name ?? "";
      const key = w.orderId ? `order:${w.orderId}` : `adj:${w.date}`;
      const title = w.orderId ? `Заказ №${w.order?.orderNumber ?? "?"}` : "Списание по корректировке";
      if (q && !`${title} ${name} ${w.comment ?? ""}`.toLowerCase().includes(q)) continue;
      const g = map.get(key) ?? { key, orderId: w.orderId, title, date: w.date, total: 0, items: [] };
      g.items.push(w);
      g.total += parseFloat(w.total ?? "0");
      if (w.date > g.date) g.date = w.date;
      map.set(key, g);
    }
    // Как в УЭС: старые сверху, новые снизу.
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, period, search]);
  const tableRef = useRef<HTMLDivElement>(null);
  useJournalBottomScroll(tableRef, groups.map((g) => g.key));

  const total = groups.reduce((s, g) => s + g.total, 0);
  const toggle = (k: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <Layout title="Списания" caption="Журнал документов · СП">
      <div className="space-y-3">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod}>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[240px] !pl-8"
              placeholder="Заказ или материал"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </PeriodToolbar>

        <div ref={tableRef} className="ues-table-wrap max-h-[calc(100vh-240px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th className="w-[100px]">Дата</th>
                <th>Документ / материал</th>
                <th className="num">Количество</th>
                <th className="num">Цена</th>
                <th className="num w-[150px]">Сумма</th>
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
              {!isLoading && groups.length === 0 && (
                <tr>
                  <td colSpan={5} className="ues-muted py-6 text-center">
                    За период списаний нет. Материалы списываются автоматически, когда заказ становится «Готов».
                  </td>
                </tr>
              )}
              {groups.map((g) => (
                <Fragment key={g.key}>
                  <tr className="is-clickable font-medium" onClick={() => toggle(g.key)}>
                    <td>{fmtDate(g.date)}</td>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="ues-expander">{open.has(g.key) ? "−" : "+"}</span>
                        {g.orderId ? (
                          <Link
                            href={`/orders?open=${g.orderId}`}
                            className="text-[var(--ues-primary-text)] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {g.title}
                          </Link>
                        ) : (
                          g.title
                        )}
                        <span className="ues-muted text-[12px]">· позиций: {g.items.length}</span>
                      </span>
                    </td>
                    <td />
                    <td />
                    <td className="num font-semibold">{fmtMoney(g.total)}</td>
                  </tr>
                  {open.has(g.key) &&
                    g.items.map((w) => {
                      const unit = w.fabricId ? "м²" : w.component?.unit || "шт";
                      return (
                        <tr key={w.id} className="text-[12.5px]">
                          <td />
                          <td style={{ paddingLeft: 46 }}>
                            {w.fabric?.name ?? w.component?.name ?? "—"}
                            {w.comment && <span className="ues-muted"> · {w.comment}</span>}
                          </td>
                          <td className="num">
                            {fmtQty(w.quantity)} {unit}
                          </td>
                          <td className="num">{fmtMoney(parseFloat(w.price ?? "0"))}</td>
                          <td className="num">{fmtMoney(parseFloat(w.total ?? "0"))}</td>
                        </tr>
                      );
                    })}
                </Fragment>
              ))}
            </tbody>
            {groups.length > 0 && (
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
          Списания по заказу становятся себестоимостью в ОПиУ в день отгрузки заказа. До отгрузки они числятся в балансе
          как «Материалы в незавершённых заказах».
        </p>
      </div>
    </Layout>
  );
}
