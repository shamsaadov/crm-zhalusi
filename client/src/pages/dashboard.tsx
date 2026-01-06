import { useEffect, useMemo, useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw } from "lucide-react";

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
  sales7d: {
    ordersCount: number;
    totalAmount: number;
  };
  overduePayments: {
    totalAmount: number;
    count: number;
  };
  overdueOrders: OverdueOrder[];
};

const mockData: DashboardData = {
  lowStock: [
    {
      name: "Ткань Blackout 25 мм",
      quantity: 3.2,
      minQuantity: 5,
      unit: "м",
      lastPrice: 820,
    },
    {
      name: "Карниз алюминиевый 50 мм",
      quantity: 7,
      minQuantity: 10,
      unit: "м",
      lastPrice: 560,
    },
    {
      name: "Кронштейн усиленный",
      quantity: 14,
      minQuantity: 25,
      unit: "шт",
      lastPrice: 95,
    },
  ],
  orders: {
    today: 6,
    inProgress: 14,
    overdue: 3,
  },
  sales7d: {
    ordersCount: 21,
    totalAmount: 584000,
  },
  overduePayments: {
    totalAmount: 124000,
    count: 4,
  },
  overdueOrders: [
    {
      orderNumber: 1482,
      dealer: "Sunrise Decor",
      date: "2024-12-05",
      dueDate: "2024-12-10",
      status: "В производстве",
      amount: 72000,
    },
    {
      orderNumber: 1480,
      dealer: "Blind House",
      date: "2024-12-03",
      dueDate: "2024-12-07",
      status: "Готов",
      amount: 41500,
    },
    {
      orderNumber: 1476,
      dealer: "Light&Shadow",
      date: "2024-12-01",
      dueDate: "2024-12-06",
      status: "Новый",
      amount: 105500,
    },
  ],
};

type LoadStatus = "loading" | "success" | "error";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [status, setStatus] = useState<LoadStatus>("loading");

  const loadData = () => {
    setStatus("loading");
    const timer = window.setTimeout(() => {
      setData(mockData);
      setStatus("success");
    }, 450);

    return timer;
  };

  useEffect(() => {
    const timer = loadData();
    return () => clearTimeout(timer);
  }, []);

  const kpis = useMemo(() => {
    if (!data) return [];
    return [
      {
        title: "Остатки ниже минимума",
        value: data.lowStock.length,
        hint: "Позиций на контроле",
        tone: "destructive" as const,
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
        tone: "warning" as const,
      },
      {
        title: "Продажи за 7 дней",
        value: formatCurrency(data.sales7d.totalAmount),
        hint: `${data.sales7d.ordersCount} заказов`,
        tone: "default" as const,
      },
      {
        title: "Просроченные оплаты",
        value: formatCurrency(data.overduePayments.totalAmount),
        hint: `${data.overduePayments.count} плательщика`,
        tone: data.overduePayments.totalAmount > 0 ? "warning" : "default",
      },
    ];
  }, [data]);

  const renderKpiCards = () => {
    if (status === "loading") {
      return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, idx) => (
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {kpis.map((kpi) => (
          <Card key={kpi.title} className="relative overflow-hidden border-muted-foreground/10">
            <CardHeader className="px-4 pt-3 pb-2">
              <CardTitle className="text-sm font-medium">
                {kpi.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-1.5">
              <div className="text-2xl font-semibold leading-tight">
                {kpi.value}
              </div>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
              {kpi.tone !== "default" && (
                <Badge variant={kpi.tone === "destructive" ? "destructive" : "outline"}>
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
    if (status === "loading") {
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
    if (status === "loading") {
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
                <TableCell className="font-medium">#{order.orderNumber}</TableCell>
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
        <h1>ТУТ ПОКА НЕНАСТОЯЩИЕ ДАННЫЕ Я ИХ ПРИКРУЧУ ЧУТЬ ПОЗЖЕ</h1>
        <div>
          <p className="text-sm text-muted-foreground leading-tight">
            Мини-дашборд с ключевыми показателями и проблемными зонами.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={status === "loading"}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Обновить
        </Button>
      </div>

      {status === "error" && (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Не удалось загрузить данные</AlertTitle>
          <AlertDescription>Попробуйте обновить страницу.</AlertDescription>
        </Alert>
      )}

      <section className="space-y-3">
        {renderKpiCards()}
      </section>

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
