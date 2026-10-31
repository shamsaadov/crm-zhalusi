// Журнал «Корректировки остатков» (КО): излишки (оприходование) и недостачи.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { PeriodToolbar, fmtDate, periodPreset } from "@/components/ues/report-kit";
import { useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";
import type { Component, Fabric } from "@shared/schema";
import { fmtQty } from "./common";
import { AdjustmentDialog, type AdjustTarget } from "./adjustment-dialog";

interface Adjustment {
  id: string;
  type: "increase" | "decrease";
  itemType: string;
  itemName: string;
  quantity: string;
  date: string;
  comment: string | null;
}

interface StockResponse {
  fabrics: (Fabric & { stock: { quantity: number; avgPrice: number; lastPrice: number } })[];
  components: (Component & { stock: { quantity: number; avgPrice: number; lastPrice: number } })[];
}

export default function AdjustmentsJournalPage() {
  const [period, setPeriod] = useStoredState("journal:adjustments:period", () => periodPreset("month"));
  const [search, setSearch] = useState("");
  const [picker, setPicker] = useState("");
  const [target, setTarget] = useState<AdjustTarget | null>(null);
  const { data = [], isLoading } = useQuery<Adjustment[]>({ queryKey: ["/api/stock/adjustments"] });
  const { data: stock } = useQuery<StockResponse>({ queryKey: ["/api/stock"] });

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data
      .filter((a) => a.date >= period.from && a.date <= period.to)
      .filter((a) => !q || `${a.itemName} ${a.comment ?? ""}`.toLowerCase().includes(q));
  }, [data, period, search]);

  const items = useMemo(
    () => [
      ...(stock?.fabrics ?? []).map((f) => ({
        key: `fabric:${f.id}`,
        target: {
          itemType: "fabric" as const,
          itemId: f.id,
          name: f.name,
          unit: "м²",
          quantity: f.stock.quantity,
          price: f.stock.avgPrice || f.stock.lastPrice,
        },
      })),
      ...(stock?.components ?? []).map((c) => ({
        key: `component:${c.id}`,
        target: {
          itemType: "component" as const,
          itemId: c.id,
          name: c.name,
          unit: c.unit || "шт",
          quantity: c.stock.quantity,
          price: c.stock.avgPrice || c.stock.lastPrice,
        },
      })),
    ],
    [stock]
  );

  return (
    <Layout title="Корректировки остатков" caption="Журнал документов · КО">
      <div className="space-y-3">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod} />
        <div className="ues-toolbar">
          <select
            className="ues-input min-w-[260px]"
            value={picker}
            onChange={(e) => setPicker(e.target.value)}
            aria-label="Номенклатура для корректировки"
            data-testid="select-adjust-item"
          >
            <option value="">Выберите номенклатуру…</option>
            <optgroup label="Ткани">
              {items
                .filter((i) => i.target.itemType === "fabric")
                .map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.target.name} — {fmtQty(i.target.quantity)} {i.target.unit}
                  </option>
                ))}
            </optgroup>
            <optgroup label="Комплектующие">
              {items
                .filter((i) => i.target.itemType === "component")
                .map((i) => (
                  <option key={i.key} value={i.key}>
                    {i.target.name} — {fmtQty(i.target.quantity)} {i.target.unit}
                  </option>
                ))}
            </optgroup>
          </select>
          <button
            type="button"
            className="ues-btn primary"
            disabled={!picker}
            onClick={() => setTarget(items.find((i) => i.key === picker)?.target ?? null)}
            data-testid="button-create-adjustment"
          >
            <Plus className="h-4 w-4" />
            Корректировка
          </button>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[240px] !pl-8"
              placeholder="Поиск по журналу"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[12px] text-[var(--ues-muted)]">Найдено: {rows.length}</span>
        </div>

        <div className="ues-table-wrap max-h-[calc(100vh-280px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th className="w-[100px]">Дата</th>
                <th className="w-[120px]">Вид</th>
                <th>Номенклатура</th>
                <th className="num">Количество</th>
                <th>Причина</th>
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
                    За период корректировок нет
                  </td>
                </tr>
              )}
              {rows.map((a) => (
                <tr key={`${a.type}-${a.id}`}>
                  <td>{fmtDate(a.date)}</td>
                  <td className={cn(a.type === "increase" ? "ues-pos" : "ues-neg")}>
                    {a.type === "increase" ? "Излишек" : "Недостача"}
                  </td>
                  <td className="font-medium">{a.itemName}</td>
                  <td className={cn("num font-semibold", a.type === "decrease" && "ues-neg")}>
                    {a.type === "decrease" ? "−" : "+"}
                    {fmtQty(a.quantity)}
                  </td>
                  <td className="max-w-[360px] truncate ues-muted" title={a.comment ?? ""}>
                    {a.comment || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">
          Корректировки меняют остатки без поставщика и заказа. В балансе они идут в капитал строкой «Корректировки
          остатков склада», в ОПиУ не попадают.
        </p>
      </div>
      <AdjustmentDialog target={target} onClose={() => setTarget(null)} />
    </Layout>
  );
}
