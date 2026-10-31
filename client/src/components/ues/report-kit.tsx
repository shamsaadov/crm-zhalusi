// Общие элементы отчётов в стиле УЭС (ErpFinancialReport / FinancialStatement в ErpDocuments.jsx):
// панель периода с быстрыми кнопками, карточки показателей, раскрывающаяся расшифровка.

import { Fragment, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

// ---------- Форматирование ----------

const moneyFmt = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** «1 234 567,00» — как в УЭС, без знака рубля. */
export function fmtMoney(v: number | null | undefined) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return moneyFmt.format(v);
}

/** «01.10.2026» из «2026-10-01». */
export function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  const [y, m, d] = v.slice(0, 10).split("-");
  return d && m && y ? `${d}.${m}.${y}` : v;
}

export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function key(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export type PeriodPreset = "month" | "prevMonth" | "quarter" | "year";

export function periodPreset(preset: PeriodPreset, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case "month":
      return { from: key(new Date(y, m, 1)), to: key(new Date(y, m + 1, 0)) };
    case "prevMonth":
      return { from: key(new Date(y, m - 1, 1)), to: key(new Date(y, m, 0)) };
    case "quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: key(new Date(y, q, 1)), to: key(new Date(y, q + 3, 0)) };
    }
    case "year":
      return { from: key(new Date(y, 0, 1)), to: key(new Date(y, 11, 31)) };
  }
}

// ---------- Панель периода ----------

const PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: "month", label: "Текущий месяц" },
  { key: "prevMonth", label: "Прошлый месяц" },
  { key: "quarter", label: "Квартал" },
  { key: "year", label: "Год" },
];

export function PeriodToolbar({
  from,
  to,
  onChange,
  children,
}: {
  from: string;
  to: string;
  onChange: (p: { from: string; to: string }) => void;
  children?: React.ReactNode;
}) {
  const activePreset = PRESETS.find((p) => {
    const r = periodPreset(p.key);
    return r.from === from && r.to === to;
  })?.key;

  return (
    <div className="ues-toolbar">
      <label htmlFor="period-from">Период с</label>
      <input
        id="period-from"
        type="date"
        className="ues-input"
        value={from}
        max={to}
        onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
        data-testid="input-period-from"
      />
      <label htmlFor="period-to">по</label>
      <input
        id="period-to"
        type="date"
        className="ues-input"
        value={to}
        min={from}
        onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
        data-testid="input-period-to"
      />
      <span className="ues-toolbar-sep" />
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className={cn("ues-btn", activePreset === p.key && "is-active")}
          onClick={() => onChange(periodPreset(p.key))}
          data-testid={`button-period-${p.key}`}
        >
          {p.label}
        </button>
      ))}
      {children}
    </div>
  );
}

// ---------- Карточки показателей ----------

export interface Kpi {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="ues-kpis">
      {items.map((k) => (
        <div key={k.label} className={cn("ues-kpi", k.tone === "good" && "is-good", k.tone === "bad" && "is-bad")}>
          <div className="ues-kpi-label">{k.label}</div>
          <div className="ues-kpi-value">{k.value}</div>
          {k.hint && <div className="ues-kpi-hint">{k.hint}</div>}
        </div>
      ))}
    </div>
  );
}

// ---------- Расшифровка отчёта ----------

export interface ReportDoc {
  id: string;
  kind: "finance" | "order" | "writeoff" | "receipt" | "calc";
  label: string;
  date: string | null;
  amount: number;
  counterparty?: string | null;
  comment?: string | null;
  orderId?: string | null;
}

export interface ReportGroup {
  key: string;
  title: string;
  amount: number;
  share: number | null;
  pinned?: boolean;
  children?: ReportGroup[];
  docs?: ReportDoc[];
}

export interface ReportSection {
  key: string;
  title: string;
  total: number;
  groups: ReportGroup[];
}

/** Куда ведёт документ из расшифровки. */
export function docHref(doc: ReportDoc): string | null {
  if (doc.kind === "finance") return `/finance/doc/${doc.id}`;
  if (doc.kind === "order" && doc.orderId) return `/orders?open=${doc.orderId}`;
  return null;
}

function ShareCell({ share }: { share: number | null }) {
  if (share === null) return <span className="ues-muted">—</span>;
  return (
    <span className="ues-share">
      <span className="ues-share-bar">
        <span style={{ width: `${Math.min(100, share)}%` }} />
      </span>
      <span className="w-12 tabular-nums">{share.toLocaleString("ru-RU")} %</span>
    </span>
  );
}

function DocRows({ docs, depth }: { docs: ReportDoc[]; depth: number }) {
  return (
    <>
      {docs.map((doc) => {
        const href = docHref(doc);
        const label = href ? (
          <Link href={href} className="text-[var(--ues-primary-text)] hover:underline">
            {doc.label}
          </Link>
        ) : (
          <span>{doc.label}</span>
        );
        return (
          <tr key={`${doc.kind}-${doc.id}`} className="text-[12.5px]">
            <td style={{ paddingLeft: 12 + depth * 22 }}>
              <span className="flex flex-wrap items-baseline gap-x-2">
                {label}
                {doc.counterparty && <span className="ues-muted">{doc.counterparty}</span>}
                {doc.comment && <span className="ues-muted truncate max-w-[320px]">· {doc.comment}</span>}
              </span>
            </td>
            <td className="num">{fmtMoney(doc.amount)}</td>
            <td />
          </tr>
        );
      })}
    </>
  );
}

function GroupRows({ group, depth }: { group: ReportGroup; depth: number }) {
  const [open, setOpen] = useState(false);
  const expandable = !!(group.children?.length || group.docs?.length);
  return (
    <Fragment>
      <tr
        className={cn(expandable && "is-clickable", depth === 0 && "font-medium")}
        onClick={() => expandable && setOpen((v) => !v)}
        data-testid={`report-row-${group.key}`}
      >
        <td style={{ paddingLeft: 12 + depth * 22 }}>
          <span className="flex items-center gap-2">
            {expandable ? (
              <span className="ues-expander" aria-label={open ? "Свернуть" : "Раскрыть"}>
                {open ? "−" : "+"}
              </span>
            ) : (
              <span className="inline-block w-[18px]" />
            )}
            <span className={cn(group.amount < 0 && "ues-neg")}>{group.title}</span>
          </span>
        </td>
        <td className={cn("num", group.amount < 0 && "ues-neg")}>{fmtMoney(group.amount)}</td>
        <td className="num w-[150px]">{depth === 0 ? <ShareCell share={group.share} /> : null}</td>
      </tr>
      {open && group.children?.map((c) => <GroupRows key={c.key} group={c} depth={depth + 1} />)}
      {open && group.docs && <DocRows docs={group.docs} depth={depth + 1} />}
    </Fragment>
  );
}

export function FinancialStatement({
  sections,
  result,
}: {
  sections: ReportSection[];
  result?: { title: string; amount: number };
}) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.key} className="ues-table-wrap">
          <table className="ues-table">
            <thead>
              <tr>
                <th>{section.title}</th>
                <th className="num w-[180px]">Сумма</th>
                <th className="num w-[150px]">Доля</th>
              </tr>
            </thead>
            <tbody>
              {section.groups.length === 0 && (
                <tr>
                  <td colSpan={3} className="ues-muted py-4 text-center">
                    Нет данных за период
                  </td>
                </tr>
              )}
              {section.groups.map((g) => (
                <GroupRows key={g.key} group={g} depth={0} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Итого {section.title.toLowerCase()}</td>
                <td className="num">{fmtMoney(section.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      {result && (
        <div className={cn("ues-result", result.amount >= 0 ? "is-good" : "is-bad")} data-testid="report-result">
          <span>{result.title}</span>
          <span className="tabular-nums">{fmtMoney(result.amount)}</span>
        </div>
      )}
    </div>
  );
}

export function ReportError({ error }: { error: unknown }) {
  return (
    <div className="rounded-[11px] border border-[var(--ues-danger)] bg-[var(--ues-danger-soft)] px-4 py-3 text-[13px] text-[var(--ues-danger)]">
      {error instanceof Error ? error.message : "Не удалось построить отчёт"}
    </div>
  );
}

export function ReportSkeleton() {
  return (
    <div className="space-y-3">
      <div className="ues-kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ues-kpi h-[78px] animate-pulse" />
        ))}
      </div>
      <div className="ues-table-wrap h-64 animate-pulse" />
    </div>
  );
}
