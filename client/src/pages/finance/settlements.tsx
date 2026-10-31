// Взаиморасчёты в стиле УЭС: дилеры и поставщики на дату, кто кому должен.

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards, ReportError, fmtMoney, todayKey } from "@/components/ues/report-kit";
import { useReport } from "@/lib/report-query";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  kind: "dealer" | "supplier";
  name: string;
  charged: number;
  paid: number;
  balance: number;
}

interface SettlementsReport {
  asOf: string;
  dealers: Row[];
  suppliers: Row[];
}

type Filter = "all" | "owesUs" | "weOwe" | "advances";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "owesUs", label: "Нам должны" },
  { key: "weOwe", label: "Мы должны" },
  { key: "advances", label: "Авансы" },
];

/** С точки зрения компании: > 0 — нам должны, < 0 — мы должны. */
function ourSide(r: Row) {
  return r.kind === "dealer" ? r.balance : -r.balance;
}

export default function SettlementsPage() {
  const [asOf, setAsOf] = useState(todayKey);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useReport<SettlementsReport>("/api/reports/settlements", { asOf });

  const all = useMemo(() => (data ? [...data.dealers, ...data.suppliers] : []), [data]);
  const summary = useMemo(() => {
    let owesUs = 0;
    let weOwe = 0;
    for (const r of all) {
      const s = ourSide(r);
      if (s > 0) owesUs += s;
      else weOwe += -s;
    }
    return { owesUs, weOwe, net: owesUs - weOwe };
  }, [all]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((r) => r.charged !== 0 || r.paid !== 0)
      .filter((r) => {
        const s = ourSide(r);
        if (filter === "owesUs") return s > 0.004;
        if (filter === "weOwe") return s < -0.004;
        if (filter === "advances") return r.balance < -0.004;
        return true;
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q))
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [all, filter, search]);

  return (
    <Layout title="Взаиморасчёты" caption="Финансы · Расчёты с контрагентами">
      <div className="space-y-4">
        <KpiCards
          items={[
            { label: "Нам должны", value: fmtMoney(summary.owesUs), hint: "Долги дилеров и авансы поставщикам" },
            { label: "Мы должны", value: fmtMoney(summary.weOwe), hint: "Поставщикам и авансы дилеров" },
            {
              label: "Сальдо",
              value: fmtMoney(summary.net),
              tone: summary.net >= 0 ? "good" : "bad",
            },
          ]}
        />

        <div className="ues-toolbar">
          <label htmlFor="settle-date">На дату</label>
          <input
            id="settle-date"
            type="date"
            className="ues-input"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
          />
          <span className="ues-toolbar-sep" />
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              className={cn("ues-btn", filter === f.key && "is-active")}
              onClick={() => setFilter(f.key)}
              data-testid={`filter-${f.key}`}
            >
              {f.label}
            </button>
          ))}
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[240px] !pl-8"
              placeholder="Поиск контрагента"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[12px] text-[var(--ues-muted)]">
            Показано {rows.length} из {all.length}
          </span>
        </div>

        {error && <ReportError error={error} />}

        <div className="ues-table-wrap">
          <table className="ues-table">
            <thead>
              <tr>
                <th>Контрагент</th>
                <th className="w-[110px]">Тип</th>
                <th className="num">Начислено</th>
                <th className="num">Оплачено</th>
                <th className="num">Сальдо</th>
                <th className="w-[190px]">Состояние</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="ues-muted py-6 text-center">
                    Загрузка…
                  </td>
                </tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="ues-muted py-6 text-center">
                    Нет расчётов по фильтру
                  </td>
                </tr>
              )}
              {rows.map((r) => {
                const s = ourSide(r);
                const state =
                  Math.abs(r.balance) < 0.005
                    ? "Рассчитались"
                    : r.kind === "dealer"
                      ? r.balance > 0
                        ? "Дилер должен"
                        : "Аванс дилера"
                      : r.balance > 0
                        ? "Мы должны поставщику"
                        : "Аванс поставщику";
                return (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="font-medium">{r.name}</td>
                    <td className="ues-muted">{r.kind === "dealer" ? "Дилер" : "Поставщик"}</td>
                    <td className="num">{fmtMoney(r.charged)}</td>
                    <td className="num">{fmtMoney(r.paid)}</td>
                    <td className={cn("num font-semibold", s < 0 && "ues-neg")}>{fmtMoney(r.balance)}</td>
                    <td className={cn(s > 0 && "ues-pos", s < 0 && "ues-neg")}>{state}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[12px] text-[var(--ues-muted)]">
          Дилеру начисляются только отгруженные заказы — по дате отгрузки. Поставщику — поступления на склад. Начальные
          остатки берутся из справочников.
        </p>
      </div>
    </Layout>
  );
}
