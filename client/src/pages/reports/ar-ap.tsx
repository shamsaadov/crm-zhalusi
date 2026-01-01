import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { FilterBar } from "@/components/filter-bar";
import { formatCurrency, BalanceBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Users, Building2, TrendingDown, TrendingUp } from "lucide-react";
import type { Dealer, Supplier } from "@shared/schema";

interface ARAPReport {
  dealers: (Dealer & { balance: number })[];
  suppliers: (Supplier & { balance: number })[];
  totalAR: number; // Accounts Receivable (дебиторка - нам должны)
  totalAP: number; // Accounts Payable (кредиторка - мы должны)
}

export default function ARAPReportPage() {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("dealers");

  const { data: report, isLoading } = useQuery<ARAPReport>({
    queryKey: ["/api/reports/ar-ap"],
  });

  const filteredDealers = (report?.dealers || []).filter((d) =>
    d.fullName.toLowerCase().includes(search.toLowerCase())
  );

  const filteredSuppliers = (report?.suppliers || []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const dealerColumns = [
    {
      key: "fullName",
      header: "Дилер",
      cell: (d: Dealer & { balance: number }) => d.fullName,
    },
    {
      key: "city",
      header: "Город",
      cell: (d: Dealer & { balance: number }) => d.city || "-",
    },
    {
      key: "phone",
      header: "Телефон",
      cell: (d: Dealer & { balance: number }) => d.phone || "-",
    },
    {
      key: "balance",
      header: "Баланс",
      cell: (d: Dealer & { balance: number }) => (
        <div className="flex items-center gap-2 justify-end">
          <BalanceBadge balance={d.balance} />
          {d.balance < 0 && (
            <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs">
              Должен нам
            </Badge>
          )}
          {d.balance > 0 && (
            <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs">
              Переплата
            </Badge>
          )}
        </div>
      ),
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

  return (
    <Layout 
      title="Дебиторка и Кредиторка" 
      breadcrumbs={[{ label: "Отчеты", href: "/reports/ar-ap" }, { label: "Дебиторка/Кредиторка" }]}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Дебиторка (нам должны)</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-mono font-bold text-green-600" data-testid="text-total-ar">
              {formatCurrency(Math.abs(report?.totalAR || 0))}
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
              {(report?.dealers || []).filter(d => d.balance < 0).length}
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
        <TabsList className="mb-4">
          <TabsTrigger value="dealers" className="gap-2" data-testid="tab-dealers">
            <Users className="h-4 w-4" />
            Дилеры ({filteredDealers.length})
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="gap-2" data-testid="tab-suppliers">
            <Building2 className="h-4 w-4" />
            Поставщики ({filteredSuppliers.length})
          </TabsTrigger>
        </TabsList>

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
