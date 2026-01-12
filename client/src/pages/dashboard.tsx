import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertTriangle,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Layers,
} from "lucide-react";

type LowStockItem = {
  name: string;
  quantity: number;
  minQuantity: number;
  unit: string;
  lastPrice: number;
};

type OverdueOrder = {
  orderNumber: number;
  dealer: string;
  date: string;
  dueDate: string;
  status: string;
  amount: number;
};

type DashboardData = {
  lowStock: LowStockItem[];
  orders: {
    today: number;
    inProgress: number;
    overdue: number;
  };
  salesMonth: {
    ordersCount: number;
    totalAmount: number;
  };
  sashes: {
    created: number;
    sold: number;
  };
  overduePayments: {
    totalAmount: number;
    count: number;
  };
  overdueOrders: OverdueOrder[];
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
  };
};

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function getMonthOptions() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const options = [];

  // Add current month and previous 5 months
  for (let i = 0; i < 6; i++) {
    let month = currentMonth - i;
    let year = currentYear;

    if (month <= 0) {
      month += 12;
      year -= 1;
    }

    options.push({
      year,
      month,
      label: `${MONTH_NAMES[month - 1]} ${year}`,
      key: `${year}-${month}`,
    });
  }

  return options;
}

export default function DashboardPage() {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);

  const monthOptions = useMemo(() => getMonthOptions(), []);

  const { data, isLoading, isError, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard", selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await fetch(
        `/api/dashboard?year=${selectedYear}&month=${selectedMonth}`,
        { credentials: "include" }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }
      return response.json();
    },
  });

  const handlePreviousMonth = () => {
    let newMonth = selectedMonth - 1;
    let newYear = selectedYear;
    if (newMonth <= 0) {
      newMonth = 12;
      newYear -= 1;
    }
    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
  };

  const handleNextMonth = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let newMonth = selectedMonth + 1;
    let newYear = selectedYear;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }

    // Don't allow going beyond current month
    if (
      newYear > currentYear ||
      (newYear === currentYear && newMonth > currentMonth)
    ) {
      return;
    }

    setSelectedYear(newYear);
    setSelectedMonth(newMonth);
  };

  const isCurrentMonth = () => {
    const now = new Date();
    return (
      selectedYear === now.getFullYear() && selectedMonth === now.getMonth() + 1
    );
  };

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: "Остатки ниже минимума",
        value: data.lowStock.length,
        hint: "Позиций на контроле",
        tone: data.lowStock.length > 0 ? "destructive" : "default",
      },
      {
        title: "Заказы сегодня",
        value: data.orders.today,
        hint: "Создано за текущий день",
        tone: "default" as const,
      },
      {
        title: "В работе",
        value: data.orders.inProgress,
        hint: "Статусы Новый/В производстве",
        tone: "default" as const,
      },
      {
        title: "Просроченные заказы",
        value: data.orders.overdue,
        hint: "Требуют отгрузки",
        tone: data.orders.overdue > 0 ? "warning" : "default",
      },
      {
        title: `Продажи за ${MONTH_NAMES[selectedMonth - 1].toLowerCase()}`,
        value: formatCurrency(data.salesMonth.totalAmount),
        hint: `${data.salesMonth.ordersCount} заказов`,
        tone: "default" as const,
      },
      {
        title: "Просроченные оплаты",
        value: formatCurrency(data.overduePayments.totalAmount),
        hint: `${data.overduePayments.count} дилеров`,
        tone: data.overduePayments.totalAmount > 0 ? "warning" : "default",
      },
      {
        title: "Створок создано",
        value: data.sashes.created,
        hint: `За ${MONTH_NAMES[selectedMonth - 1].toLowerCase()}`,
        tone: "default" as const,
        icon: Layers,
      },
      {
        title: "Створок продано",
        value: data.sashes.sold,
        hint: "Отгруженные заказы",
        tone: "default" as const,
        icon: Layers,
      },
    ];
  }, [data, selectedMonth]);

  const renderKpiCards = () => {
    if (isLoading) {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Card key={idx} className="border-muted-foreground/10">
              <CardHeader className="px-4 pt-3 pb-2">
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <Skeleton className="h-7 w-20" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      );
    }

    if (!data) return null;

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="relative overflow-hidden border-muted-foreground/10"
          >
            <CardHeader className="px-4 pt-3 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                {kpi.icon && (
                  <kpi.icon className="h-4 w-4 text-muted-foreground" />
                )}
                {kpi.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              <div className="text-2xl font-semibold leading-tight">
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
              {kpi.tone !== "default" && (
                <Badge
                  variant={
                    kpi.tone === "destructive" ? "destructive" : "outline"
                  }
                >
                  {kpi.tone === "destructive" ? "Внимание" : "Важно"}
                </Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  };

  const renderLowStock = () => {
    if (isLoading) {
      return <Skeleton className="h-40 w-full" />;
    }

    const items = data?.lowStock || [];
    if (!items.length) {
      return (
        <Alert>
          <AlertTitle>Остатки в норме</AlertTitle>
          <AlertDescription>Критичных позиций нет.</AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="rounded-md border">
        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead>Позиция</TableHead>
              <TableHead className="w-32 text-right">Остаток</TableHead>
              <TableHead className="w-32 text-right">Минимум</TableHead>
              <TableHead className="w-32 text-right">Последняя цена</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.name}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-right">
                  {item.quantity} {item.unit}
                </TableCell>
                <TableCell className="text-right">
                  {item.minQuantity} {item.unit}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.lastPrice)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderOverdueOrders = () => {
    if (isLoading) {
      return <Skeleton className="h-40 w-full" />;
    }

    const items = data?.overdueOrders || [];
    if (!items.length) {
      return (
        <Alert>
          <AlertTitle>Просрочки нет</AlertTitle>
          <AlertDescription>Все заказы в срок.</AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Заказ</TableHead>
              <TableHead>Дилер</TableHead>
              <TableHead>Дата</TableHead>
              <TableHead>Срок</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Сумма</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((order) => (
              <TableRow key={order.orderNumber}>
                <TableCell className="font-medium">
                  #{order.orderNumber}
                </TableCell>
                <TableCell>{order.dealer}</TableCell>
                <TableCell>{order.date}</TableCell>
                <TableCell>{order.dueDate}</TableCell>
                <TableCell>
                  <Badge variant="outline">{order.status}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(order.amount)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Layout title="Сводка" breadcrumbs={[{ label: "Сводка" }]}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousMonth}
              className="h-8 w-8"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[140px] text-center">
              {MONTH_NAMES[selectedMonth - 1]} {selectedYear}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              disabled={isCurrentMonth()}
              className="h-8 w-8"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground leading-tight hidden md:block">
            Ключевые показатели и проблемные зоны
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Обновить
          </Button>
        </div>
      </div>

      {/* Quick month tabs */}
      <div className="mb-4">
        <Tabs
          value={`${selectedYear}-${selectedMonth}`}
          onValueChange={(value) => {
            const [year, month] = value.split("-").map(Number);
            setSelectedYear(year);
            setSelectedMonth(month);
          }}
        >
          <TabsList className="w-full flex overflow-x-auto">
            {monthOptions.map((option) => (
              <TabsTrigger
                key={option.key}
                value={option.key}
                className="flex-1 min-w-[120px]"
              >
                {MONTH_NAMES[option.month - 1].slice(0, 3)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {isError && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Не удалось загрузить данные</AlertTitle>
          <AlertDescription>Попробуйте обновить страницу.</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">{renderKpiCards()}</section>

      <Separator className="my-5" />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Остатки ниже минимума</h2>
            <Badge variant="secondary">Склад</Badge>
          </div>
          {renderLowStock()}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Просроченные заказы</h2>
            <Badge variant="secondary">Производство</Badge>
          </div>
          {renderOverdueOrders()}
        </section>
      </div>
    </Layout>
  );
}
