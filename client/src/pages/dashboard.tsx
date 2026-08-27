import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Layers,
  Scissors,
  Settings2,
  TrendingUp,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

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
  dailySashes: {
    date: string;
    count: number;
  }[];
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

type ChartData = {
  months: {
    month: string;
    sales: number;
    profit: number;
    orders: number;
    income: number;
    expense: number;
  }[];
  topDealers: {
    name: string;
    sales: number;
    orders: number;
  }[];
  topFabrics: {
    name: string;
    count: number;
    sales: number;
  }[];
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

type KpiId =
  | "lowStock"
  | "ordersToday"
  | "inProgress"
  | "overdueOrders"
  | "salesMonth"
  | "overduePayments"
  | "sashesCreated"
  | "sashesSold";

type DashboardSectionId =
  | "dailySashes"
  | "lowStock"
  | "overdueOrders"
  | "salesChart"
  | "topDealers"
  | "topFabrics";

type DashboardSettings = {
  kpis: Record<KpiId, boolean>;
  sections: Record<DashboardSectionId, boolean>;
};

const DASHBOARD_SETTINGS_KEY = "crm-zhalusi-dashboard-settings";

const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  kpis: {
    lowStock: true,
    ordersToday: true,
    inProgress: true,
    overdueOrders: true,
    salesMonth: true,
    overduePayments: true,
    sashesCreated: true,
    sashesSold: true,
  },
  sections: {
    dailySashes: true,
    lowStock: true,
    overdueOrders: true,
    salesChart: true,
    topDealers: true,
    topFabrics: true,
  },
};

function loadDashboardSettings(): DashboardSettings {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD_SETTINGS;

  try {
    const saved = JSON.parse(
      window.localStorage.getItem(DASHBOARD_SETTINGS_KEY) || "null"
    ) as Partial<DashboardSettings> | null;
    return {
      kpis: { ...DEFAULT_DASHBOARD_SETTINGS.kpis, ...(saved?.kpis || {}) },
      sections: {
        ...DEFAULT_DASHBOARD_SETTINGS.sections,
        ...(saved?.sections || {}),
      },
    };
  } catch {
    return DEFAULT_DASHBOARD_SETTINGS;
  }
}

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
  const [settings, setSettings] = useState<DashboardSettings>(
    loadDashboardSettings
  );

  const monthOptions = useMemo(() => getMonthOptions(), []);

  useEffect(() => {
    window.localStorage.setItem(DASHBOARD_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

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

  const { data: chartData, isLoading: chartsLoading } = useQuery<ChartData>({
    queryKey: ["/api/dashboard/charts"],
    queryFn: async () => {
      const response = await fetch("/api/dashboard/charts", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch chart data");
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
        id: "lowStock" as const,
        title: "Остатки ниже минимума",
        value: data.lowStock.length,
        hint: "Позиций на контроле",
        tone: data.lowStock.length > 0 ? "destructive" : "default",
      },
      {
        id: "ordersToday" as const,
        title: "Заказы сегодня",
        value: data.orders.today,
        hint: "Создано за текущий день",
        tone: "default" as const,
      },
      {
        id: "inProgress" as const,
        title: "В работе",
        value: data.orders.inProgress,
        hint: "Статусы Новый/В производстве",
        tone: "default" as const,
      },
      {
        id: "overdueOrders" as const,
        title: "Просроченные заказы",
        value: data.orders.overdue,
        hint: "Требуют отгрузки",
        tone: data.orders.overdue > 0 ? "warning" : "default",
      },
      {
        id: "salesMonth" as const,
        title: `Продажи за ${MONTH_NAMES[selectedMonth - 1].toLowerCase()}`,
        value: formatCurrency(data.salesMonth.totalAmount),
        hint: `${data.salesMonth.ordersCount} заказов`,
        tone: "default" as const,
      },
      {
        id: "overduePayments" as const,
        title: "Просроченные оплаты",
        value: formatCurrency(data.overduePayments.totalAmount),
        hint: `${data.overduePayments.count} дилеров`,
        tone: data.overduePayments.totalAmount > 0 ? "warning" : "default",
      },
      {
        id: "sashesCreated" as const,
        title: "Створок занесено за месяц",
        value: data.sashes.created,
        hint: `За ${MONTH_NAMES[selectedMonth - 1].toLowerCase()}`,
        tone: "default" as const,
        icon: Layers,
      },
      {
        id: "sashesSold" as const,
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

    const visibleKpis = kpis.filter((kpi) => settings.kpis[kpi.id]);

    if (!visibleKpis.length) {
      return (
        <Alert>
          <AlertTitle>Карточки отключены</AlertTitle>
          <AlertDescription>
            Включите нужные показатели в настройках сводки.
          </AlertDescription>
        </Alert>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {visibleKpis.map((kpi) => (
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

  const renderDailySashes = () => {
    if (isLoading) return <Skeleton className="h-64 w-full" />;

    const items = data?.dailySashes || [];
    return (
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>День</TableHead>
              <TableHead className="text-right">Занесено створок</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.date}>
                <TableCell>{item.date.slice(8, 10)}.{item.date.slice(5, 7)}.{item.date.slice(0, 4)}</TableCell>
                <TableCell className="text-right font-medium">{item.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const updateKpiSetting = (id: KpiId, enabled: boolean) => {
    setSettings((current) => ({
      ...current,
      kpis: { ...current.kpis, [id]: enabled },
    }));
  };

  const updateSectionSetting = (
    id: DashboardSectionId,
    enabled: boolean
  ) => {
    setSettings((current) => ({
      ...current,
      sections: { ...current.sections, [id]: enabled },
    }));
  };

  const settingGroups: {
    title: string;
    items: { id: KpiId | DashboardSectionId; label: string; kind: "kpi" | "section" }[];
  }[] = [
    {
      title: "Карточки показателей",
      items: [
        { id: "sashesCreated", label: "Створки занесено за месяц", kind: "kpi" },
        { id: "sashesSold", label: "Створки продано", kind: "kpi" },
        { id: "ordersToday", label: "Заказы сегодня", kind: "kpi" },
        { id: "inProgress", label: "В работе", kind: "kpi" },
        { id: "salesMonth", label: "Продажи за месяц", kind: "kpi" },
        { id: "lowStock", label: "Остатки ниже минимума", kind: "kpi" },
        { id: "overdueOrders", label: "Просроченные заказы", kind: "kpi" },
        { id: "overduePayments", label: "Просроченные оплаты", kind: "kpi" },
      ],
    },
    {
      title: "Разделы и графики",
      items: [
        { id: "dailySashes", label: "Створки по дням", kind: "section" },
        { id: "lowStock", label: "Таблица остатков", kind: "section" },
        { id: "overdueOrders", label: "Таблица просроченных заказов", kind: "section" },
        { id: "salesChart", label: "График продаж и прибыли", kind: "section" },
        { id: "topDealers", label: "График топ-дилеров", kind: "section" },
        { id: "topFabrics", label: "График топ-тканей", kind: "section" },
      ],
    },
  ];

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
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="h-4 w-4 mr-2" />
                Настроить
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Настройки сводки</DialogTitle>
                <DialogDescription>
                  Выберите, какие карточки, таблицы и графики показывать на этой странице.
                  Настройки сохраняются в этом браузере.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-6 py-2">
                {settingGroups.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <h3 className="text-sm font-semibold">{group.title}</h3>
                    <div className="space-y-3">
                      {group.items.map((item) => {
                        const enabled =
                          item.kind === "kpi"
                            ? settings.kpis[item.id as KpiId]
                            : settings.sections[item.id as DashboardSectionId];
                        return (
                          <div
                            key={`${item.kind}-${item.id}`}
                            className="flex items-center justify-between gap-4"
                          >
                            <span className="text-sm">{item.label}</span>
                            <Switch
                              checked={enabled}
                              onCheckedChange={(checked) =>
                                item.kind === "kpi"
                                  ? updateKpiSetting(item.id as KpiId, checked)
                                  : updateSectionSetting(
                                      item.id as DashboardSectionId,
                                      checked
                                    )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                onClick={() => setSettings(DEFAULT_DASHBOARD_SETTINGS)}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Вернуть все блоки
              </Button>
            </DialogContent>
          </Dialog>
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

      {settings.sections.dailySashes && (
        <>
          <Separator className="my-5" />
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Створки, занесённые по дням</h2>
                <p className="text-sm text-muted-foreground">
                  Считаются созданные строки створок в заказах за дату заказа. Отгрузка не учитывается.
                </p>
              </div>
              <Badge variant="secondary">Ввод в программу</Badge>
            </div>
            {renderDailySashes()}
          </section>
        </>
      )}

      {(settings.sections.lowStock || settings.sections.overdueOrders) && (
        <>
          <Separator className="my-5" />
          <div className="grid gap-6 xl:grid-cols-2">
            {settings.sections.lowStock && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Остатки ниже минимума</h2>
                  <Badge variant="secondary">Склад</Badge>
                </div>
                {renderLowStock()}
              </section>
            )}

            {settings.sections.overdueOrders && (
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Просроченные заказы</h2>
                  <Badge variant="secondary">Производство</Badge>
                </div>
                {renderOverdueOrders()}
              </section>
            )}
          </div>
        </>
      )}

      {/* Charts Section */}
      {(settings.sections.salesChart ||
        settings.sections.topDealers ||
        settings.sections.topFabrics) && (
        <>
          <Separator className="my-5" />
          <div className="grid gap-6 xl:grid-cols-2">
        {/* Sales & Profit Chart */}
        {settings.sections.salesChart && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Продажи и прибыль
            </CardTitle>
            <CardDescription>Динамика за последние 6 месяцев</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData?.months ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData.months}>
                  <defs>
                    <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(142, 76%, 36%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number) => [formatCurrency(value), ""]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Продажи"
                    stroke="hsl(var(--primary))"
                    fill="url(#salesGradient)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    name="Прибыль"
                    stroke="hsl(142, 76%, 36%)"
                    fill="url(#profitGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Нет данных
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Top Dealers Chart */}
        {settings.sections.topDealers && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Топ дилеров
            </CardTitle>
            <CardDescription>По продажам за текущий месяц</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData?.topDealers && chartData.topDealers.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.topDealers} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis
                    type="number"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number, name: string) => [
                      name === "sales" ? formatCurrency(value) : value,
                      name === "sales" ? "Продажи" : "Заказов"
                    ]}
                  />
                  <Bar
                    dataKey="sales"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                    name="sales"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Нет данных за текущий месяц
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Top Fabrics Chart */}
        {settings.sections.topFabrics && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Топ тканей
            </CardTitle>
            <CardDescription>По количеству створок за текущий месяц</CardDescription>
          </CardHeader>
          <CardContent>
            {chartsLoading ? (
              <Skeleton className="h-[300px] w-full" />
            ) : chartData?.topFabrics && chartData.topFabrics.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData.topFabrics} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                  <XAxis
                    type="number"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    className="text-xs"
                    tick={{ fill: "hsl(var(--muted-foreground))" }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number, name: string) => [
                      name === "count" ? `${value} шт` : formatCurrency(value),
                      name === "count" ? "Створок" : "Продажи"
                    ]}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(262, 83%, 58%)"
                    radius={[0, 4, 4, 0]}
                    name="count"
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                Нет данных за текущий месяц
              </div>
            )}
          </CardContent>
        </Card>}
          </div>
        </>
      )}
    </Layout>
  );
}
