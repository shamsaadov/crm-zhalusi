import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { formatCurrency } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Wallet, Building2, TrendingUp } from "lucide-react";
import type { Cashbox } from "@shared/schema";

interface CashTotalReport {
  cashboxes: (Cashbox & { balance: number })[];
  totalBalance: number;
}

export default function CashTotalReportPage() {
  const { data: report, isLoading } = useQuery<CashTotalReport>({
    queryKey: ["/api/reports/cash-total"],
  });

  const columns = [
    {
      key: "name",
      header: "Касса",
      cell: (c: Cashbox & { balance: number }) => (
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <span className="font-medium">{c.name}</span>
        </div>
      ),
    },
    {
      key: "openingBalance",
      header: "Начальный остаток",
      cell: (c: Cashbox & { balance: number }) => (
        <span className="font-mono text-muted-foreground">{formatCurrency(c.openingBalance)}</span>
      ),
      className: "text-right",
    },
    {
      key: "balance",
      header: "Текущий остаток",
      cell: (c: Cashbox & { balance: number }) => (
        <span className={`font-mono font-semibold ${c.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
          {formatCurrency(c.balance)}
        </span>
      ),
      className: "text-right",
    },
  ];

  return (
    <Layout 
      title="Остатки в кассах" 
      breadcrumbs={[{ label: "Отчеты", href: "/reports/cash-total" }, { label: "Остатки касс" }]}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Общий остаток</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-mono font-bold ${(report?.totalBalance || 0) >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-total-balance">
              {formatCurrency(report?.totalBalance || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Количество касс</CardTitle>
            <Building2 className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-mono font-bold" data-testid="text-cashbox-count">
              {report?.cashboxes?.length || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Средний остаток</CardTitle>
            <Wallet className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-mono font-bold" data-testid="text-avg-balance">
              {formatCurrency((report?.totalBalance || 0) / Math.max(report?.cashboxes?.length || 1, 1))}
            </p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={report?.cashboxes || []}
        isLoading={isLoading}
        emptyMessage="Кассы не найдены"
        getRowKey={(c) => c.id}
      />

      {(report?.cashboxes?.length || 0) > 0 && (
        <div className="mt-4 p-4 bg-muted rounded-md flex justify-between items-center">
          <span className="font-medium">Итого по всем кассам:</span>
          <span className={`text-xl font-mono font-bold ${(report?.totalBalance || 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatCurrency(report?.totalBalance || 0)}
          </span>
        </div>
      )}
    </Layout>
  );
}
