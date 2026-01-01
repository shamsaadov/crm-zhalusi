import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, StatusBadge, BalanceBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { TrendingUp, ShoppingCart, DollarSign, Percent } from "lucide-react";
import { ORDER_STATUSES, type Order, type OrderStatus, type Dealer } from "@shared/schema";
import { format } from "date-fns";

interface ProfitReport {
  totalSales: number;
  totalCost: number;
  grossProfit: number;
  profitMargin: number;
  orders: (Order & { dealer?: Dealer })[];
}

export default function ProfitReportPage() {
  const [dateRange, setDateRange] = useState<{ from?: Date; to?: Date }>({});
  const [statusFilter, setStatusFilter] = useState("all");
  const [dealerFilter, setDealerFilter] = useState("all");

  const { data: dealers = [] } = useQuery<Dealer[]>({
    queryKey: ["/api/dealers"],
  });

  const queryParams = new URLSearchParams();
  if (dateRange.from) queryParams.append("from", dateRange.from.toISOString());
  if (dateRange.to) queryParams.append("to", dateRange.to.toISOString());
  if (statusFilter !== "all") queryParams.append("status", statusFilter);
  if (dealerFilter !== "all") queryParams.append("dealerId", dealerFilter);

  const { data: report, isLoading } = useQuery<ProfitReport>({
    queryKey: ["/api/reports/profit", queryParams.toString()],
  });

  const columns = [
    {
      key: "orderNumber",
      header: "№",
      cell: (order: Order) => <span className="font-mono">{order.orderNumber}</span>,
    },
    {
      key: "date",
      header: "Дата",
      cell: (order: Order) => format(new Date(order.date), "dd.MM.yyyy"),
    },
    {
      key: "dealer",
      header: "Дилер",
      cell: (order: Order & { dealer?: Dealer }) => order.dealer?.fullName || "-",
    },
    {
      key: "status",
      header: "Статус",
      cell: (order: Order) => <StatusBadge status={order.status as OrderStatus || "Новый"} />,
    },
    {
      key: "salePrice",
      header: "Продажа",
      cell: (order: Order) => <span className="font-mono">{formatCurrency(order.salePrice)}</span>,
      className: "text-right",
    },
    {
      key: "costPrice",
      header: "Себестоимость",
      cell: (order: Order) => <span className="font-mono">{formatCurrency(order.costPrice)}</span>,
      className: "text-right",
    },
    {
      key: "profit",
      header: "Прибыль",
      cell: (order: Order) => {
        const profit = parseFloat(order.salePrice?.toString() || "0") - parseFloat(order.costPrice?.toString() || "0");
        return <BalanceBadge balance={profit} />;
      },
      className: "text-right",
    },
  ];

  return (
    <Layout 
      title="Валовая прибыль" 
      breadcrumbs={[{ label: "Отчеты", href: "/reports/profit" }, { label: "Прибыль" }]}
    >
      <FilterBar
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        showDateFilter
        filters={[
          {
            key: "status",
            label: "Статус",
            options: ORDER_STATUSES.map((s) => ({ value: s, label: s })),
            value: statusFilter,
            onChange: setStatusFilter,
          },
          {
            key: "dealer",
            label: "Дилер",
            options: dealers.map((d) => ({ value: d.id, label: d.fullName })),
            value: dealerFilter,
            onChange: setDealerFilter,
          },
        ]}
        onReset={() => {
          setDateRange({});
          setStatusFilter("all");
          setDealerFilter("all");
        }}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Общие продажи</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold" data-testid="text-total-sales">
              {formatCurrency(report?.totalSales || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Себестоимость</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-orange-600" data-testid="text-total-cost">
              {formatCurrency(report?.totalCost || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Валовая прибыль</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-mono font-bold ${(report?.grossProfit || 0) >= 0 ? "text-green-600" : "text-red-600"}`} data-testid="text-gross-profit">
              {(report?.grossProfit || 0) >= 0 ? "+" : ""}{formatCurrency(report?.grossProfit || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Маржа</CardTitle>
            <Percent className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-purple-600" data-testid="text-profit-margin">
              {(report?.profitMargin || 0).toFixed(1)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={report?.orders || []}
        isLoading={isLoading}
        emptyMessage="Заказы не найдены"
        getRowKey={(order) => order.id}
      />
    </Layout>
  );
}
