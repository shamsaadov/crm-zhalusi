// Взаиморасчёты как в УЭС: вкладки «Нам должны / Мы должны / Ожидаемые отгрузки»,
// срок долга и давность оплаты, щелчок по контрагенту — его расчёты по датам.

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Search } from "lucide-react";
import { Layout } from "@/components/layout";
import { KpiCards, ReportError, fmtMoney } from "@/components/ues/report-kit";
import { useReport, useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";

interface Party {
  id: string;
  kind: "dealer" | "supplier";
  name: string;
  net: number; // > 0 — нам должны, < 0 — мы должны или заплатили вперёд
  expected: number;
  projected: number;
  ageDays: number | null;
  ageFromOpening: boolean;
  lastPaymentDays: number | null;
}

type Tab = "receivables" | "payables" | "expected";
type SortKey = "name" | "net" | "age" | "lastPayment" | "projected" | "expected";
interface Sort {
  key: SortKey;
  desc: boolean;
}

const TABS: { key: Tab; label: string }[] = [
  { key: "receivables", label: "Нам должны" },
  { key: "payables", label: "Мы должны" },
  { key: "expected", label: "Ожидаемые отгрузки" },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "projected", label: "Большой долг с отгрузками" },
  { key: "net", label: "Большой текущий долг" },
  { key: "age", label: "Старый долг" },
  { key: "lastPayment", label: "Давно не платил" },
  { key: "expected", label: "Большие ожидаемые отгрузки" },
  { key: "name", label: "По имени" },
];

const DEFAULT_SORT: Sort = { key: "projected", desc: true };
const EPS = 0.005;

const amount = (v: number) => (Math.abs(v) < EPS ? "—" : `${v < 0 ? "−" : ""}${fmtMoney(Math.abs(v))}`);

/** Для сортировки: начальный остаток — самый старый долг, «ни разу не платил» — самый давний. */
function sortValue(p: Party, key: SortKey) {
  if (key === "net") return Math.abs(p.net);
  if (key === "projected") return Math.abs(p.projected);
  if (key === "expected") return p.expected;
  if (key === "age") return p.ageFromOpening ? Infinity : p.ageDays ?? -1;
  return p.lastPaymentDays ?? Infinity;
}

function DebtAge({ party }: { party: Party }) {
  if (party.ageFromOpening) {
    return (
      <span className="ues-age-pill is-warn" title="Долг из начального остатка в справочнике: его дата неизвестна, поэтому дни не считаем">
        нач. остаток
      </span>
    );
  }
  if (party.ageDays == null) return <span className="ues-muted">—</span>;
  const d = party.ageDays;
  return <span className={cn("ues-age-pill", d > 60 ? "is-late" : d > 30 ? "is-warn" : "is-fresh")}>{d === 0 ? "сегодня" : `${d} дн.`}</span>;
}

export default function SettlementsPage() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useStoredState<Tab>("settlements-tab", () => "receivables");
  const [sort, setSort] = useStoredState<Sort>("settlements-sort", () => DEFAULT_SORT);
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useReport<{ parties: Party[] }>("/api/reports/settlements", {});

  // На вкладке «Мы должны» долг показываем положительным: это сумма нашего долга.
  const sign = tab === "payables" ? -1 : 1;

  const inTab = useMemo(
    () =>
      (data?.parties ?? []).filter((p) =>
        tab === "receivables" ? p.net > EPS : tab === "payables" ? p.net < -EPS : p.expected > EPS
      ),
    [data, tab]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("ru-RU");
    const list = q ? inTab.filter((p) => p.name.toLocaleLowerCase("ru-RU").includes(q)) : inTab;
    const dir = sort.desc ? -1 : 1;
    return [...list].sort((a, b) => {
      const diff =
        sort.key === "name" ? a.name.localeCompare(b.name, "ru") : sortValue(a, sort.key) - sortValue(b, sort.key);
      // Infinity − Infinity даёт NaN: такие строки считаем равными.
      return (diff || 0) * dir || a.name.localeCompare(b.name, "ru");
    });
  }, [inTab, search, sort]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, p) => ({ net: t.net + p.net * sign, projected: t.projected + p.projected * sign, expected: t.expected + p.expected }),
        { net: 0, projected: 0, expected: 0 }
      ),
    [rows, sign]
  );

  const open = (p: Party) => navigate(`/finance/settlements/${p.kind}/${p.id}`);
  const pickColumn = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" }));

  const SortHead = ({ k, label, left }: { k: SortKey; label: string; left?: boolean }) => (
    <th className={left ? undefined : "num"} aria-sort={sort.key === k ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button type="button" className={cn("ues-sort-head", sort.key === k && "is-active")} onClick={() => pickColumn(k)}>
        {label}
        {sort.key === k && <span aria-hidden="true">{sort.desc ? "▼" : "▲"}</span>}
      </button>
    </th>
  );

  return (
    <Layout
      title="Взаиморасчёты"
      caption="Финансы · Отчёты"
      wide
      actions={
        <span className="text-[13px] text-[var(--ues-muted)]">
          {tab === "payables" ? "Поставщикам — наш долг, дилерам — их аванс" : "Минус — заплатили вперёд"}
        </span>
      }
    >
      <div className="space-y-3">
        <KpiCards
          items={[
            { label: tab === "payables" ? "Мы должны" : tab === "receivables" ? "Нам должны" : "Текущий долг", value: amount(totals.net) },
            { label: "Долг с учётом отгрузок", value: amount(totals.projected) },
            { label: "Ожидаемые отгрузки", value: amount(totals.expected) },
          ]}
        />

        <div className="ues-toolbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={cn("ues-btn", tab === t.key ? "is-active" : "ues-tab-quiet")}
              aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)}
              data-testid={`filter-${t.key}`}
            >
              {t.label}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[13px] text-[var(--ues-muted)]">
            Сортировка
            <select
              className="ues-input"
              value={sort.key}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setSort({ key, desc: key !== "name" });
              }}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="relative ml-auto">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
            <input
              className="ues-input w-[260px] !pl-8"
              placeholder="Поиск клиента"
              aria-label="Поиск клиента"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-[13px] text-[var(--ues-muted)]">
            Показано: <b className="text-[var(--ues-text)]">{rows.length}</b> из {inTab.length}
          </span>
        </div>

        {error && <ReportError error={error} />}

        <div className="ues-table-wrap">
          <table className="ues-table ues-settlements-table">
            <thead>
              <tr>
                <SortHead k="name" label="Контрагент" left />
                <SortHead k="net" label="Текущий долг" />
                <SortHead k="age" label="Срок долга" />
                <SortHead k="lastPayment" label="Последняя оплата" />
                <SortHead k="projected" label="Долг с учётом отгрузок" />
                <SortHead k="expected" label="Ожидаемые отгрузки" />
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
                    Контрагенты не найдены. Измените поиск или вкладку.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={`${p.kind}-${p.id}`} className="is-clickable" title="Открыть расчёты по датам" onDoubleClick={() => open(p)} data-testid={`party-${p.id}`}>
                  <td>
                    <button type="button" className="ues-party-link" onClick={() => open(p)}>
                      {p.name}
                    </button>
                    {tab === "payables" && <span className="ues-muted ml-2 text-[12px]">{p.kind === "dealer" ? "аванс дилера" : "поставщик"}</span>}
                    {tab === "receivables" && p.kind === "supplier" && <span className="ues-muted ml-2 text-[12px]">аванс поставщику</span>}
                  </td>
                  <td className={cn("num", p.net * sign < -EPS && "ues-neg")}>{amount(p.net * sign)}</td>
                  <td className="num">
                    <DebtAge party={p} />
                  </td>
                  <td className="num ues-muted">
                    {p.lastPaymentDays == null ? "—" : p.lastPaymentDays === 0 ? "сегодня" : `${p.lastPaymentDays} дн. назад`}
                  </td>
                  <td className={cn("num", p.projected * sign < -EPS && "ues-neg")}>{amount(p.projected * sign)}</td>
                  <td className="num">{amount(p.expected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
