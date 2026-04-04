import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Building2, TrendingDown, TrendingUp, Truck, Package } from "lucide-react";
import type { Dealer, Supplier } from "@shared/schema";

interface ARAPReport {
  dealers: (Dealer & { balance: number; shippedBalance: number })[];
  suppliers: (Supplier & { balance: number })[];
  totalAR: number;
  totalARShipped: number;
  totalAP: number;
}

export default function ARAPReportPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dealers");
  const [debtMode, setDebtMode] = useState<"shipped" | "all">("shipped");

  const { data: report, isLoading } = useQuery<ARAPReport>({
    queryKey: ["/api/reports/ar-ap"],
  });

  const filteredDealers = (report?.dealers || []).filter((d) =>
    d.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSuppliers = (report?.suppliers || []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const getBalance = (d: Dealer & { balance: number; shippedBalance: number }) =>
    debtMode === "shipped" ? d.shippedBalance : d.balance;

  const dealerColumns = [
    {
      key: "fullName",
      header: "Дилер",
      cell: (d: Dealer & { balance: number; shippedBalance: number }) => d.fullName,
    },
    {
      key: "city",
      header: "Город",
      cell: (d: Dealer & { balance: number; shippedBalance: number }) => d.city || "-",
    },
    {
      key: "phone",
      header: "Телефон",
      cell: (d: Dealer & { balance: number; shippedBalance: number }) => d.phone || "-",
    },
    {
      key: "balance",
      header: debtMode === "shipped" ? "Факт. долг" : "С ожидаемыми",
      cell: (d: Dealer & { balance: number; shippedBalance: number }) => {
        const bal = getBalance(d);
        return (
          <div className="flex items-center gap-2 justify-end">
            <BalanceBadge balance={bal} />
            {bal < 0 && (
              <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
                Должен нам
              </Badge>
            )}
            {bal > 0 && (
              <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
                Переплата
              </Badge>
            )}
          </div>
        );
      },
      className: "text-right",
    },
  ];

  const supplierColumns = [
    {
      key: "name",
      header: "Поставщик",
      cell: (s: Supplier & { balance: number }) => s.name,
    },
    {
      key: "balance",
      header: "Баланс",
      cell: (s: Supplier & { balance: number }) => (
        <div className="flex items-center gap-2 justify-end">
          <BalanceBadge balance={s.balance} />
          {s.balance > 0 && (
            <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 text-xs">
              Мы должны
            </Badge>
          )}
          {s.balance < 0 && (
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
              Переплата
            </Badge>
          )}
        </div>
      ),
      className: "text-right",
    },
  ];

  const currentTotalAR = debtMode === "shipped" ? report?.totalARShipped : report?.totalAR;
  const currentDebtDealers = (report?.dealers || []).filter((d) => getBalance(d) < 0).length;

  return (
    <Layout
      title="Дебиторка и Кредиторка"
      breadcrumbs={[{ label: "Отчеты", href: "/reports/ar-ap" }, { label: "Дебиторка/Кредиторка" }]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {debtMode === "shipped" ? "Дебиторка (факт.)" : "Дебиторка (с ожид.)"}
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-green-600" data-testid="text-total-ar">
              {formatCurrency(Math.abs(currentTotalAR || 0))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Кредиторка (мы должны)</CardTitle>
            <TrendingDown className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-orange-600" data-testid="text-total-ap">
              {formatCurrency(Math.abs(report?.totalAP || 0))}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Дилеров с долгом</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold" data-testid="text-dealers-with-debt">
              {currentDebtDealers}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Поставщиков с долгом</CardTitle>
            <Building2 className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold" data-testid="text-suppliers-with-debt">
              {(report?.suppliers || []).filter(s => s.balance > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Поиск..."
        onReset={() => setSearch("")}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="dealers" className="gap-2" data-testid="tab-dealers">
              <Users className="h-4 w-4" />
              Дилеры ({filteredDealers.length})
            </TabsTrigger>
            <TabsTrigger value="suppliers" className="gap-2" data-testid="tab-suppliers">
              <Building2 className="h-4 w-4" />
              Поставщики ({filteredSuppliers.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === "dealers" && (
            <div className="flex gap-1 rounded-lg border p-0.5">
              <Button
                variant={debtMode === "shipped" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setDebtMode("shipped")}
              >
                <Truck className="h-3.5 w-3.5" />
                Фактический долг
              </Button>
              <Button
                variant={debtMode === "all" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setDebtMode("all")}
              >
                <Package className="h-3.5 w-3.5" />
                С ожидаемыми
              </Button>
            </div>
          )}
        </div>

        <TabsContent value="dealers">
          <DataTable
            columns={dealerColumns}
            data={filteredDealers}
            isLoading={isLoading}
            emptyMessage="Дилеры не найдены"
            getRowKey={(d) => d.id}
          />
        </TabsContent>

        <TabsContent value="suppliers">
          <DataTable
            columns={supplierColumns}
            data={filteredSuppliers}
            isLoading={isLoading}
            emptyMessage="Поставщики не найдены"
            getRowKey={(s) => s.id}
          />
        </TabsContent>
      </Tabs>
    </Layout>
  );
}
