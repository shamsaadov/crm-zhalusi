// ОПиУ — отчёт о прибылях и убытках по методу начисления (как в УЭС).

import { AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { ProtectedReport } from "@/components/protected-report";
import {
  FinancialStatement,
  KpiCards,
  PeriodToolbar,
  ReportError,
  ReportSkeleton,
  fmtDate,
  fmtMoney,
  periodPreset,
  type ReportSection,
} from "@/components/ues/report-kit";
import { useReport, useStoredState } from "@/lib/report-query";

interface PnlReport {
  period: { from: string; to: string };
  kpis: {
    income: number;
    expenses: number;
    cogs: number;
    grossProfit: number;
    netProfit: number;
    margin: number | null;
  };
  sections: ReportSection[];
  result: { title: string; amount: number };
  costQuality: {
    preliminary: boolean;
    shippedWithoutCost: { orderId: string; orderNumber: number; shippedAt: string; salePrice: number }[];
  };
}

function PnlContent() {
  const [period, setPeriod] = useStoredState("report:pnl:period", () => periodPreset("month"));
  const { data, isLoading, error, isFetching } = useReport<PnlReport>("/api/reports/pnl", period);

  return (
    <Layout title="ОПиУ" caption="Отчёт о прибылях и убытках">
      <div className="space-y-4">
        <PeriodToolbar from={period.from} to={period.to} onChange={setPeriod}>
          {isFetching && <span className="ml-auto text-[12px] text-[var(--ues-muted)]">Обновляется…</span>}
        </PeriodToolbar>

        {error && <ReportError error={error} />}
        {isLoading && !data && <ReportSkeleton />}

        {data && (
          <>
            <KpiCards
              items={[
                { label: "Доходы", value: fmtMoney(data.kpis.income) },
                {
                  label: "Расходы",
                  value: fmtMoney(data.kpis.expenses),
                  hint: `в т.ч. себестоимость ${fmtMoney(data.kpis.cogs)}`,
                },
                {
                  label: "Валовая прибыль",
                  value: fmtMoney(data.kpis.grossProfit),
                  tone: data.kpis.grossProfit >= 0 ? undefined : "bad",
                },
                {
                  label: "Прибыль",
                  value: fmtMoney(data.kpis.netProfit),
                  hint: data.kpis.margin !== null ? `${data.kpis.margin.toLocaleString("ru-RU")} % от доходов` : undefined,
                  tone: data.kpis.netProfit >= 0 ? "good" : "bad",
                },
              ]}
            />

            {data.costQuality.preliminary && (
              <div className="flex gap-3 rounded-[11px] border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <div className="font-semibold">Прибыль предварительная</div>
                  <div>
                    По этим заказам материалы не списаны со склада, поэтому их себестоимость в отчёт не вошла:{" "}
                    {data.costQuality.shippedWithoutCost.map((o, i) => (
                      <span key={o.orderId}>
                        {i > 0 && ", "}
                        <Link href={`/orders?open=${o.orderId}`} className="font-medium underline">
                          №{o.orderNumber}
                        </Link>{" "}
                        <span className="opacity-75">({fmtDate(o.shippedAt)})</span>
                      </span>
                    ))}
                    .
                  </div>
                </div>
              </div>
            )}

            <FinancialStatement sections={data.sections} result={data.result} />

            <p className="text-[12px] text-[var(--ues-muted)]">
              Выручка признаётся в день отгрузки заказа, себестоимость — по списанным в заказ материалам. Оплаты
              поставщикам, займы, взносы и дивиденды в ОПиУ не входят — они отражаются в ДДС и Балансе.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}

export default function PnlReportPage() {
  return (
    <ProtectedReport title="ОПиУ">
      <PnlContent />
    </ProtectedReport>
  );
}
