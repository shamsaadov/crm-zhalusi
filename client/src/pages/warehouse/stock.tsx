// «Остатки на складе» в стиле УЭС (ErpStockReport): показатели, фильтры, таблица остатков.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards, fmtDate, fmtMoney } from "@/components/ues/report-kit";
import { useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";
import type { Component, Fabric } from "@shared/schema";
import { fmtQty } from "./common";
import { AdjustmentDialog, type AdjustTarget } from "./adjustment-dialog";

interface Stock {
  quantity: number;
  lastPrice: number;
  avgPrice: number;
  bookValue: number;
  lastMovement: string | null;
}

interface StockResponse {
  fabrics: (Fabric & { stock: Stock })[];
  components: (Component & { stock: Stock })[];
}

type Kind = "all" | "fabric" | "component";

export default function StockPage() {
  const { data, isLoading } = useQuery<StockResponse>({ queryKey: ["/api/stock"] });
  const [kind, setKind] = useStoredState<Kind>("stock:kind", () => "all");
  const [showZero, setShowZero] = useStoredState("stock:showZero", () => false);
  const [search, setSearch] = useState("");
  const [adjust, setAdjust] = useState<AdjustTarget | null>(null);

  const all = useMemo(() => {
    if (!data) return [];
    return [
      ...data.fabrics.map((f) => ({
        id: f.id,
        kind: "fabric" as const,
        name: f.name,
        group: f.category ? `Ткань · кат. ${f.category}` : "Ткань",
        unit: "м²",
        stock: f.stock,
      })),
      ...data.components.map((c) => ({
        id: c.id,
        kind: "component" as const,
        name: c.name,
        group: "Комплектующее",
        unit: c.unit || "шт",
        stock: c.stock,
      })),
    ];
  }, [data]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => kind === "all" || r.kind === kind)
      .filter((r) => showZero || Math.abs(r.stock.quantity) > 0.0005)
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, "ru"));
  }, [all, kind, showZero, search]);

  const inStock = all.filter((r) => r.stock.quantity > 0.0005).length;
  const outOfStock = all.length - inStock;
  const value = rows.reduce((s, r) => s + (r.stock.bookValue || 0), 0);

  return (
    <Layout title="Остатки на складе" caption="Склад">
      <div className="space-y-4">
        <KpiCards
          items={[
            { label: "Позиций", value: String(all.length) },
            { label: "Есть в наличии", value: String(inStock), tone: "good" },
            { label: "Нет в наличии", value: String(outOfStock), tone: outOfStock > 0 ? "bad" : undefined },
            { label: "Стоимость остатков", value: fmtMoney(value), hint: "Приходы минус списания" },
          ]}
        />

        <div className="ues-toolbar">
          {(
            [
              ["all", "Все"],
              ["fabric", "Ткани"],
              ["component", "Комплектующие"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={cn("ues-btn", kind === k && "is-active")}
              onClick={() => setKind(k)}
            >
              {label}
            </button>
          ))}
          <span className="ues-toolbar-sep" />
          <label className="flex cursor-pointer items-center gap-2 !text-[13px] !text-[var(--ues-text)]">
            <input type="checkbox" checked={showZero} onChange={(e) => setShowZero(e.target.checked)} />
            Показывать нулевые остатки
          </label>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[260px] !pl-8"
              placeholder="Поиск номенклатуры"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[12px] text-[var(--ues-muted)]">Найдено: {rows.length}</span>
        </div>

        <div className="ues-table-wrap max-h-[calc(100vh-300px)]">
          <table className="ues-table">
            <thead>
              <tr>
                <th>Номенклатура</th>
                <th>Вид</th>
                <th className="w-[60px]">Ед.</th>
                <th className="num">Остаток</th>
                <th className="num">Средняя цена</th>
                <th className="num">Последняя цена</th>
                <th className="num">Стоимость</th>
                <th>Последнее движение</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="ues-muted py-6 text-center">
                    Нет остатков по фильтру
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr
                  key={`${r.kind}-${r.id}`}
                  className="is-clickable"
                  onDoubleClick={() =>
                    setAdjust({
                      itemType: r.kind,
                      itemId: r.id,
                      name: r.name,
                      unit: r.unit,
                      quantity: r.stock.quantity,
                      price: r.stock.avgPrice || r.stock.lastPrice,
                    })
                  }
                  title="Двойной щелчок — корректировка остатка"
                >
                  <td className="font-semibold">{r.name}</td>
                  <td className="ues-muted">{r.group}</td>
                  <td className="ues-muted">{r.unit}</td>
                  <td className={cn("num font-semibold", r.stock.quantity < 0 && "ues-neg")}>{fmtQty(r.stock.quantity)}</td>
                  <td className="num">{r.stock.avgPrice ? fmtMoney(r.stock.avgPrice) : "—"}</td>
                  <td className="num">{r.stock.lastPrice ? fmtMoney(r.stock.lastPrice) : "—"}</td>
                  <td className={cn("num", r.stock.bookValue < 0 && "ues-neg")}>{fmtMoney(r.stock.bookValue)}</td>
                  <td className="ues-muted">{fmtDate(r.stock.lastMovement)}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={6}>Итого</td>
                  <td className="num">{fmtMoney(value)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">
          Двойной щелчок по строке — корректировка остатка. Стоимость считается как в балансе: сумма приходов минус сумма
          списаний.
        </p>
      </div>
      <AdjustmentDialog target={adjust} onClose={() => setAdjust(null)} />
    </Layout>
  );
}
