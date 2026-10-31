// ДДС — движение денежных средств (кассовый метод, как в УЭС).

import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { ProtectedReport } from "@/components/protected-report";
import {
  FinancialStatement,
  KpiCards,
  PeriodToolbar,
  ReportError,
  ReportSkeleton,
  fmtMoney,
  periodPreset,
  type ReportSection,
} from "@/components/ues/report-kit";
import { useReport, useStoredState } from "@/lib/report-query";
import { cn } from "@/lib/utils";
import type { Cashbox } from "@shared/schema";

interface CashFlowReport {
  kpis: { opening: number; inflow: number; outflow: number; net: number; closing: number };
  sections: ReportSection[];
  result: { title: string; amount: number };
  notes: { transfersBetween: number };
  cashboxes: {
    id: string;
    name: string;
    opening: number;
    inflow: number;
    outflow: number;
    transferIn: number;
    transferOut: number;
    closing: number;
  }[];
}

function CashFlowContent() {
  const [period, setPeriod] = useStoredState("report:cash-flow:period", () => periodPreset("month"));
  const [cashboxId, setCashboxId] = useStoredState<string>("report:cash-flow:cashbox", () => "all");
  const { data: cashboxes = [] } = useQuery<Cashbox[]>({ queryKey: ["/api/cashboxes"] });
  const { data, isLoading, error, isFetching } = useReport<CashFlowReport>("/api/reports/cash-flow", {
    ...period,
    cashboxId: cashboxId === "all" ? null : cashboxId,
  });

  const totals = data?.cashboxes.reduce(
    (t, c) => ({
      opening: t.opening + c.opening,
      inflow: t.inflow + c.inflow,
      outflow: t.outflow + c.outflow,
      transferIn: t.transferIn + c.transferIn,
      transferOut: t.transferOut + c.transferOut,
      closing: t.closing + c.closing,
    }),
    { opening: 0, inflow: 0, outflow: 0, transferIn: 0, transferOut: 0, closing: 0 }
  );

  return (
    <Layout title="ДДС" caption="Движение денежных средств">
      <div className="space-y-4">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod}>
          <span className="ues-toolbar-sep" />
          <label htmlFor="cf-cashbox">Касса</label>
          <select
            id="cf-cashbox"
            className="ues-input"
            value={cashboxId}
            onChange={(e) => setCashboxId(e.target.value)}
            data-testid="select-cashbox"
          >
            <option value="all">Все кассы</option>
            {cashboxes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {isFetching && <span className="ml-auto text-[12px] text-[var(--ues-muted)]">Обновляется…</span>}
        </PeriodToolbar>

        {error && <ReportError error={error} />}
        {isLoading && !data && <ReportSkeleton />}

        {data && (
          <>
            <KpiCards
              items={[
                { label: "Остаток на начало", value: fmtMoney(data.kpis.opening) },
                { label: "Поступило", value: fmtMoney(data.kpis.inflow), tone: "good" },
                { label: "Выплачено", value: fmtMoney(data.kpis.outflow), tone: "bad" },
                { label: "Разница", value: fmtMoney(data.kpis.net), tone: data.kpis.net >= 0 ? "good" : "bad" },
                { label: "Остаток на конец", value: fmtMoney(data.kpis.closing) },
              ]}
            />

            <FinancialStatement sections={data.sections} result={data.result} />

            {data.notes.transfersBetween > 0 && (
              <p className="text-[12.5px] text-[var(--ues-muted)]">
                Перемещения между своими кассами — {fmtMoney(data.notes.transfersBetween)} — в итог не входят.
              </p>
            )}

            <div>
              <h2 className="ues-group-title mb-2">Остатки по кассам</h2>
              <div className="ues-table-wrap">
                <table className="ues-table">
                  <thead>
                    <tr>
                      <th>Касса</th>
                      <th className="num">На начало</th>
                      <th className="num">Поступило</th>
                      <th className="num">Выплачено</th>
                      <th className="num">Перемещено в кассу</th>
                      <th className="num">Перемещено из кассы</th>
                      <th className="num">На конец</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.cashboxes.map((c) => (
                      <tr key={c.id}>
                        <td className="font-medium">{c.name}</td>
                        <td className={cn("num", c.opening < 0 && "ues-neg")}>{fmtMoney(c.opening)}</td>
                        <td className="num">{fmtMoney(c.inflow)}</td>
                        <td className="num">{fmtMoney(c.outflow)}</td>
                        <td className="num">{fmtMoney(c.transferIn)}</td>
                        <td className="num">{fmtMoney(c.transferOut)}</td>
                        <td className={cn("num font-semibold", c.closing < 0 && "ues-neg")}>{fmtMoney(c.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr>
                        <td>Итого</td>
                        <td className="num">{fmtMoney(totals.opening)}</td>
                        <td className="num">{fmtMoney(totals.inflow)}</td>
                        <td className="num">{fmtMoney(totals.outflow)}</td>
                        <td className="num">{fmtMoney(totals.transferIn)}</td>
                        <td className="num">{fmtMoney(totals.transferOut)}</td>
                        <td className="num">{fmtMoney(totals.closing)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

export default function CashFlowReportPage() {
  return (
    <ProtectedReport title="ДДС">
      <CashFlowContent />
    </ProtectedReport>
  );
}
