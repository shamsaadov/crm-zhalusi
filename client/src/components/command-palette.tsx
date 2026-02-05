import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ShoppingCart,
  Users,
  Truck,
  LayoutDashboard,
  Wallet,
  Package,
  List,
  BarChart3,
  TrendingUp,
  UserCircle,
  Calculator,
  FileText,
  Search,
  Hash,
  ExternalLink,
  Phone,
  MapPin,
  Calendar,
  Banknote,
  Eye,
} from "lucide-react";
import type { Order, Dealer, Supplier } from "@shared/schema";
import { format } from "date-fns";
import { ru } from "date-fns/locale";

// Навигация по разделам
const navigationItems = [
  { name: "Сводка", href: "/dashboard", icon: LayoutDashboard, keywords: ["главная", "дашборд", "home"] },
  { name: "Заказы", href: "/orders", icon: ShoppingCart, keywords: ["orders", "продажи"] },
  { name: "Финансы", href: "/finance", icon: Wallet, keywords: ["деньги", "касса", "finance"] },
  { name: "Склад", href: "/warehouse", icon: Package, keywords: ["товары", "остатки", "warehouse"] },
  { name: "Справочники", href: "/lists", icon: List, keywords: ["настройки", "lists"] },
  { name: "Отчёт ДДС", href: "/reports/dds", icon: BarChart3, keywords: ["движение", "денежные", "cash flow"] },
  { name: "Отчёт Прибыль", href: "/reports/profit", icon: TrendingUp, keywords: ["маржа", "доход", "profit"] },
  { name: "Дебиторка/Кредиторка", href: "/reports/ar-ap", icon: FileText, keywords: ["долги", "баланс"] },
  { name: "Остатки касс", href: "/reports/cash-total", icon: Calculator, keywords: ["баланс", "кассы"] },
  { name: "Профиль", href: "/profile", icon: UserCircle, keywords: ["аккаунт", "настройки", "profile"] },
];

interface SearchResults {
  orders: (Order & { dealer?: Dealer })[];
  dealers: Dealer[];
  suppliers: Supplier[];
}

type QuickViewType = "order" | "dealer" | "supplier";
type QuickViewItem =
  | { type: "order"; data: Order & { dealer?: Dealer } }
  | { type: "dealer"; data: Dealer }
  | { type: "supplier"; data: Supplier };

function formatCurrency(value: number | string | null | undefined) {
  const num = typeof value === "string" ? parseFloat(value) : value || 0;
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(num);
}

// Quick View для заказа
function OrderQuickView({
  order,
  onOpenFull,
  onClose
}: {
  order: Order & { dealer?: Dealer };
  onOpenFull: () => void;
  onClose: () => void;
}) {
  const profit = parseFloat(order.salePrice?.toString() || "0") - parseFloat(order.costPrice?.toString() || "0");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
            <Hash className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Заказ #{order.orderNumber}</h3>
            <p className="text-sm text-muted-foreground">
              {order.date && format(new Date(order.date), "d MMMM yyyy", { locale: ru })}
            </p>
          </div>
        </div>
        <Badge variant={order.status === "Отгружен" ? "default" : "secondary"}>
          {order.status || "Новый"}
        </Badge>
      </div>

      <Separator />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Дилер</p>
          <p className="font-medium">{order.dealer?.fullName || "—"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Город</p>
          <p className="font-medium">{order.dealer?.city || "—"}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Продажа</p>
          <p className="font-medium font-mono">{formatCurrency(order.salePrice)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Себестоимость</p>
          <p className="font-medium font-mono">{formatCurrency(order.costPrice)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Прибыль</p>
          <p className={`font-medium font-mono ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>
            {profit >= 0 ? "+" : ""}{formatCurrency(profit)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Оплачено</p>
          <p className="font-medium font-mono">{formatCurrency(order.paidAmount)}</p>
        </div>
      </div>

      {order.comment && (
        <>
          <Separator />
          <div>
            <p className="text-sm text-muted-foreground mb-1">Комментарий</p>
            <p className="text-sm">{order.comment}</p>
          </div>
        </>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button onClick={onOpenFull} className="flex-1">
          <ExternalLink className="h-4 w-4 mr-2" />
          Открыть полностью
        </Button>
        <Button variant="outline" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

// Quick View для дилера
function DealerQuickView({
  dealer,
  onOpenFull,
  onClose
}: {
  dealer: Dealer;
  onOpenFull: () => void;
  onClose: () => void;
}) {
  // Загружаем статистику дилера
  const { data: stats, isLoading } = useQuery<{
    totalOrders: number;
    totalSales: number;
    balance: number;
    lastOrderDate: string | null;
  }>({
    queryKey: ["/api/dealers", dealer.id, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/dealers/${dealer.id}/stats`, { credentials: "include" });
      if (!res.ok) return { totalOrders: 0, totalSales: 0, balance: 0, lastOrderDate: null };
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
          <Users className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{dealer.fullName}</h3>
          <p className="text-sm text-muted-foreground">Дилер</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        {dealer.city && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <span>{dealer.city}</span>
          </div>
        )}
        {dealer.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${dealer.phone}`} className="hover:underline">{dealer.phone}</a>
          </div>
        )}
      </div>

      <Separator />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-16 mb-1" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Всего заказов</p>
            <p className="text-xl font-semibold">{stats?.totalOrders || 0}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Сумма продаж</p>
            <p className="text-xl font-semibold font-mono">{formatCurrency(stats?.totalSales || 0)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Баланс</p>
            <p className={`text-xl font-semibold font-mono ${(stats?.balance || 0) < 0 ? "text-red-600" : "text-green-600"}`}>
              {formatCurrency(stats?.balance || 0)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Последний заказ</p>
            <p className="font-medium">
              {stats?.lastOrderDate
                ? format(new Date(stats.lastOrderDate), "d MMM yyyy", { locale: ru })
                : "—"
              }
            </p>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button onClick={onOpenFull} className="flex-1">
          <ExternalLink className="h-4 w-4 mr-2" />
          Заказы дилера
        </Button>
        <Button variant="outline" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

// Quick View для поставщика
function SupplierQuickView({
  supplier,
  onOpenFull,
  onClose
}: {
  supplier: Supplier;
  onOpenFull: () => void;
  onClose: () => void;
}) {
  // Загружаем статистику поставщика
  const { data: stats, isLoading } = useQuery<{
    totalPayments: number;
    balance: number;
  }>({
    queryKey: ["/api/suppliers", supplier.id, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/suppliers/${supplier.id}/stats`, { credentials: "include" });
      if (!res.ok) return { totalPayments: 0, balance: 0 };
      return res.json();
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
          <Truck className="h-6 w-6 text-orange-600 dark:text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">{supplier.name}</h3>
          <p className="text-sm text-muted-foreground">Поставщик</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-3">
        {supplier.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <a href={`tel:${supplier.phone}`} className="hover:underline">{supplier.phone}</a>
          </div>
        )}
      </div>

      <Separator />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i}>
              <Skeleton className="h-4 w-16 mb-1" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Всего оплачено</p>
            <p className="text-xl font-semibold font-mono">{formatCurrency(stats?.totalPayments || 0)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Баланс</p>
            <p className={`text-xl font-semibold font-mono ${(stats?.balance || 0) < 0 ? "text-red-600" : ""}`}>
              {formatCurrency(stats?.balance || 0)}
            </p>
          </div>
        </div>
      )}

      <Separator />

      <div className="flex gap-2">
        <Button onClick={onOpenFull} className="flex-1">
          <ExternalLink className="h-4 w-4 mr-2" />
          Открыть в справочнике
        </Button>
        <Button variant="outline" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const [quickView, setQuickView] = useState<QuickViewItem | null>(null);

  // Глобальный хоткей Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Поиск по данным (только когда есть запрос)
  const { data: searchResults } = useQuery<SearchResults>({
    queryKey: ["/api/search", search],
    queryFn: async () => {
      if (!search.trim() || search.length < 2) {
        return { orders: [], dealers: [], suppliers: [] };
      }
      const res = await fetch(`/api/search?q=${encodeURIComponent(search)}`, {
        credentials: "include",
      });
      if (!res.ok) return { orders: [], dealers: [], suppliers: [] };
      return res.json();
    },
    enabled: open && search.length >= 2,
    staleTime: 1000,
  });

  const handleNavigate = useCallback((href: string) => {
    setOpen(false);
    setSearch("");
    setQuickView(null);
    setLocation(href);
  }, [setLocation]);

  const handleQuickView = useCallback((item: QuickViewItem) => {
    setOpen(false);
    setQuickView(item);
  }, []);

  const handleCloseQuickView = useCallback(() => {
    setQuickView(null);
    setOpen(true);
  }, []);

  const handleOpenFull = useCallback(() => {
    if (!quickView) return;

    setQuickView(null);

    switch (quickView.type) {
      case "order":
        setLocation(`/orders?search=${quickView.data.orderNumber}`);
        break;
      case "dealer":
        setLocation(`/orders?dealerId=${quickView.data.id}`);
        break;
      case "supplier":
        setLocation(`/lists?tab=suppliers`);
        break;
    }
  }, [quickView, setLocation]);

  const hasResults = searchResults && (
    searchResults.orders.length > 0 ||
    searchResults.dealers.length > 0 ||
    searchResults.suppliers.length > 0
  );

  return (
    <>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Поиск по заказам, дилерам, разделам..."
          value={search}
          onValueChange={setSearch}
        />
        <CommandList>
          <CommandEmpty>
            {search.length < 2 ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Search className="h-8 w-8" />
                <p>Начните вводить для поиска</p>
              </div>
            ) : (
              "Ничего не найдено"
            )}
          </CommandEmpty>

          {/* Результаты поиска по заказам */}
          {searchResults && searchResults.orders.length > 0 && (
            <CommandGroup heading="Заказы">
              {searchResults.orders.slice(0, 5).map((order) => (
                <CommandItem
                  key={order.id}
                  value={`order-${order.orderNumber}`}
                  onSelect={() => handleQuickView({ type: "order", data: order })}
                >
                  <Hash className="mr-2 h-4 w-4 text-blue-500" />
                  <span className="font-mono">{order.orderNumber}</span>
                  <span className="ml-2 text-muted-foreground truncate">
                    {order.dealer?.fullName || "Без дилера"}
                  </span>
                  <CommandShortcut className="flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {order.status}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Результаты поиска по дилерам */}
          {searchResults && searchResults.dealers.length > 0 && (
            <CommandGroup heading="Дилеры">
              {searchResults.dealers.slice(0, 5).map((dealer) => (
                <CommandItem
                  key={dealer.id}
                  value={`dealer-${dealer.fullName}`}
                  onSelect={() => handleQuickView({ type: "dealer", data: dealer })}
                >
                  <Users className="mr-2 h-4 w-4 text-green-500" />
                  <span>{dealer.fullName}</span>
                  {dealer.city && (
                    <span className="ml-2 text-muted-foreground">{dealer.city}</span>
                  )}
                  <CommandShortcut>
                    <Eye className="h-3 w-3" />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Результаты поиска по поставщикам */}
          {searchResults && searchResults.suppliers.length > 0 && (
            <CommandGroup heading="Поставщики">
              {searchResults.suppliers.slice(0, 5).map((supplier) => (
                <CommandItem
                  key={supplier.id}
                  value={`supplier-${supplier.name}`}
                  onSelect={() => handleQuickView({ type: "supplier", data: supplier })}
                >
                  <Truck className="mr-2 h-4 w-4 text-orange-500" />
                  <span>{supplier.name}</span>
                  <CommandShortcut>
                    <Eye className="h-3 w-3" />
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {hasResults && <CommandSeparator />}

          {/* Навигация */}
          <CommandGroup heading="Навигация">
            {navigationItems.map((item) => (
              <CommandItem
                key={item.href}
                value={`${item.name} ${item.keywords.join(" ")}`}
                onSelect={() => handleNavigate(item.href)}
              >
                <item.icon className="mr-2 h-4 w-4" />
                <span>{item.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Quick View Dialog */}
      <Dialog open={!!quickView} onOpenChange={(open) => !open && setQuickView(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Быстрый просмотр
            </DialogTitle>
          </DialogHeader>

          {quickView?.type === "order" && (
            <OrderQuickView
              order={quickView.data}
              onOpenFull={handleOpenFull}
              onClose={handleCloseQuickView}
            />
          )}

          {quickView?.type === "dealer" && (
            <DealerQuickView
              dealer={quickView.data}
              onOpenFull={handleOpenFull}
              onClose={handleCloseQuickView}
            />
          )}

          {quickView?.type === "supplier" && (
            <SupplierQuickView
              supplier={quickView.data}
              onOpenFull={handleOpenFull}
              onClose={handleCloseQuickView}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
