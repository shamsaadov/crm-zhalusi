// Баланс на дату — активы, обязательства, капитал (как управленческий баланс УЭС).

import { Fragment, useState } from "react";
import { Layout } from "@/components/layout";
import { ProtectedReport } from "@/components/protected-report";
import { KpiCards, ReportError, ReportSkeleton, fmtMoney, todayKey } from "@/components/ues/report-kit";
import { useReport } from "@/lib/report-query";
import { cn } from "@/lib/utils";

interface BalanceRow {
  key: string;
  title: string;
  amount: number;
  level: number;
  kind: "section" | "line" | "total";
  details?: { id: string; title: string; amount: number }[];
}

interface BalanceReport {
  asOf: string;
  kpis: { assets: number; liabilities: number; equity: number; difference: number };
  rows: BalanceRow[];
}

function BalanceLine({ row }: { row: BalanceRow }) {
  const [open, setOpen] = useState(false);
  const expandable = !!row.details?.length;
  if (row.kind === "section") {
    return (
      <tr className="is-section">
        <td>{row.title}</td>
        <td className="num">{fmtMoney(row.amount)}</td>
      </tr>
    );
  }
  return (
    <Fragment>
      <tr className={cn(expandable && "is-clickable")} onClick={() => expandable && setOpen((v) => !v)}>
        <td style={{ paddingLeft: 12 + row.level * 18 }}>
          <span className="flex items-center gap-2">
            {expandable ? (
              <span className="ues-expander">{open ? "−" : "+"}</span>
            ) : (
              <span className="inline-block w-[18px]" />
            )}
            {row.title}
          </span>
        </td>
        <td className={cn("num", row.amount < 0 && "ues-neg")}>{fmtMoney(row.amount)}</td>
      </tr>
      {open &&
        row.details!.map((d) => (
          <tr key={d.id} className="text-[12.5px]">
            <td style={{ paddingLeft: 12 + (row.level + 1) * 18 + 26 }} className="ues-muted">
              {d.title}
            </td>
            <td className={cn("num", d.amount < 0 && "ues-neg")}>{fmtMoney(d.amount)}</td>
          </tr>
        ))}
    </Fragment>
  );
}

function BalanceContent() {
  const [asOf, setAsOf] = useState(todayKey);
  const { data, isLoading, error, isFetching } = useReport<BalanceReport>("/api/reports/balance", { asOf });
  const balanced = data ? Math.abs(data.kpis.difference) <= 0.01 : true;

  return (
    <Layout title="Баланс" caption="Управленческий баланс">
      <div className="space-y-4">
        <div className="ues-toolbar">
          <label htmlFor="balance-date">Дата баланса</label>
          <input
            id="balance-date"
            type="date"
            className="ues-input"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            data-testid="input-balance-date"
          />
          <button type="button" className="ues-btn" onClick={() => setAsOf(todayKey())}>
            Сегодня
          </button>
          {isFetching && <span className="ml-auto text-[12px] text-[var(--ues-muted)]">Обновляется…</span>}
        </div>

        {error && <ReportError error={error} />}
        {isLoading && !data && <ReportSkeleton />}

        {data && (
          <>
            <KpiCards
              items={[
                { label: "Активы", value: fmtMoney(data.kpis.assets) },
                { label: "Обязательства", value: fmtMoney(data.kpis.liabilities) },
                { label: "Капитал", value: fmtMoney(data.kpis.equity), tone: data.kpis.equity < 0 ? "bad" : undefined },
                {
                  label: "Проверка баланса",
                  value: balanced ? "Сходится" : fmtMoney(data.kpis.difference),
                  hint: "Активы = обязательства + капитал",
                  tone: balanced ? "good" : "bad",
                },
              ]}
            />
            <div className="ues-table-wrap">
              <table className="ues-table">
                <thead>
                  <tr>
                    <th>Показатель</th>
                    <th className="num w-[200px]">На дату</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <BalanceLine key={row.key} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[12px] text-[var(--ues-muted)]">
              Запасы — стоимость поступлений минус списания. Материалы, списанные в ещё не отгруженные заказы, показаны
              отдельной строкой. Нераспределённая прибыль — ОПиУ за всё время до даты баланса. Имущество амортизируется
              линейно за 60 месяцев.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

export default function BalanceReportPage() {
  return (
    <ProtectedReport title="Баланс">
      <BalanceContent />
    </ProtectedReport>
  );
}
