import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpCircle, ArrowDownCircle, ArrowRightLeft, Wallet, Tag } from "lucide-react";
import type { FinanceOperation, Cashbox } from "@shared/schema";
import { format } from "date-fns";

interface ExpenseGroup {
  expenseTypeId: string;
  expenseTypeName: string;
  total: number;
  count: number;
}

interface DDSReport {
  totalIncome: number;
  totalExpense: number;
  totalSupplierPayments: number;
  totalTransfers: number;
  netFlow: number;
  operations: FinanceOperation[];
  expenseGroups: ExpenseGroup[];
}

const typeLabels: Record<string, string> = {
  income: "Приход",
  expense: "Расход",
  supplier_payment: "Оплата поставщику",
  transfer: "Перемещение",
};

export default function DDSReportPage() {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [cashboxFilter, setCashboxFilter] = useState("all");

  const { data: cashboxes = [] } = useQuery<Cashbox[]>({
    queryKey: ["/api/cashboxes"],
  });

  const queryParams = new URLSearchParams();
  if (dateRange.from) queryParams.append("from", dateRange.from.toISOString());
  if (dateRange.to) queryParams.append("to", dateRange.to.toISOString());
  if (cashboxFilter !== "all") queryParams.append("cashboxId", cashboxFilter);

  const queryString = queryParams.toString();
  const apiUrl = `/api/reports/dds${queryString ? `?${queryString}` : ""}`;

  const { data: report, isLoading } = useQuery<DDSReport>({
    queryKey: [apiUrl],
  });

  const operationColumns = [
    {
      key: "date",
      header: "Дата",
      cell: (op: FinanceOperation) => format(new Date(op.date), "dd.MM.yyyy"),
    },
    {
      key: "type",
      header: "Тип",
      cell: (op: FinanceOperation) => (
        <Badge variant="outline">{typeLabels[op.type]}</Badge>
      ),
    },
    {
      key: "amount",
      header: "Сумма",
      cell: (op: FinanceOperation) => (
        <span className={`font-mono ${op.type === "income" ? "text-green-600" : op.type === "expense" || op.type === "supplier_payment" ? "text-red-600" : ""}`}>
          {op.type === "income" ? "+" : op.type === "expense" || op.type === "supplier_payment" ? "-" : ""}
          {formatCurrency(op.amount)}
        </span>
      ),
      className: "text-right",
    },
  ];

  const expenseGroupColumns = [
    {
      key: "expenseTypeName",
      header: "Статья расходов",
      cell: (group: ExpenseGroup) => (
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{group.expenseTypeName}</span>
        </div>
      ),
    },
    {
      key: "count",
      header: "Кол-во",
      cell: (group: ExpenseGroup) => (
        <Badge variant="secondary">{group.count}</Badge>
      ),
      className: "text-center",
    },
    {
      key: "total",
      header: "Сумма",
      cell: (group: ExpenseGroup) => (
        <span className="font-mono text-red-600 dark:text-red-400">
          -{formatCurrency(group.total)}
        </span>
      ),
      className: "text-right",
    },
  ];

  return (
    <Layout 
      title="ДДС - Движение денежных средств" 
      breadcrumbs={[{ label: "Отчеты", href: "/reports/dds" }, { label: "ДДС" }]}
    >
      <FilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateFilter
        filters={[
          {
            key: "cashbox",
            label: "Касса",
            options: cashboxes.map((c) => ({ value: c.id, label: c.name })),
            value: cashboxFilter,
            onChange: setCashboxFilter,
          },
        ]}
        onReset={() => {
          setDateRange({});
          setCashboxFilter("all");
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Приходы</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-green-600" data-testid="text-total-income">
              +{formatCurrency(report?.totalIncome || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Расходы</CardTitle>
            <ArrowDownCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-red-600" data-testid="text-total-expense">
              -{formatCurrency(report?.totalExpense || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Оплаты поставщикам</CardTitle>
            <Wallet className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-orange-600" data-testid="text-supplier-payments">
              -{formatCurrency(report?.totalSupplierPayments || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Чистый поток</CardTitle>
            <ArrowRightLeft className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-mono font-bold ${(report?.netFlow || 0) >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-net-flow">
              {(report?.netFlow || 0) >= 0 ? "+" : ""}{formatCurrency(report?.netFlow || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Expenses grouped by type */}
      {report?.expenseGroups && report.expenseGroups.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-red-600" />
            Расходы по статьям
          </h3>
          <DataTable
            columns={expenseGroupColumns}
            data={report.expenseGroups}
            isLoading={isLoading}
            emptyMessage="Расходы не найдены"
            getRowKey={(group) => group.expenseTypeId}
          />
        </div>
      )}

      {/* All operations */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Все операции</h3>
        <DataTable
          columns={operationColumns}
          data={report?.operations || []}
          isLoading={isLoading}
          emptyMessage="Операции не найдены"
          getRowKey={(op) => op.id}
        />
      </div>
    </Layout>
  );
}
