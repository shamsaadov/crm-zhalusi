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
} from "lucide-react";
import type { Order, Dealer, Supplier } from "@shared/schema";

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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

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

  const handleSelect = useCallback((href: string) => {
    setOpen(false);
    setSearch("");
    setLocation(href);
  }, [setLocation]);

  const hasResults = searchResults && (
    searchResults.orders.length > 0 ||
    searchResults.dealers.length > 0 ||
    searchResults.suppliers.length > 0
  );

  return (
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
                onSelect={() => handleSelect(`/orders?search=${order.orderNumber}`)}
              >
                <Hash className="mr-2 h-4 w-4 text-blue-500" />
                <span className="font-mono">{order.orderNumber}</span>
                <span className="ml-2 text-muted-foreground">
                  {order.dealer?.fullName || "Без дилера"}
                </span>
                <CommandShortcut>{order.status}</CommandShortcut>
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
                onSelect={() => handleSelect(`/orders?dealerId=${dealer.id}`)}
              >
                <Users className="mr-2 h-4 w-4 text-green-500" />
                <span>{dealer.fullName}</span>
                {dealer.city && (
                  <span className="ml-2 text-muted-foreground">{dealer.city}</span>
                )}
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
                onSelect={() => handleSelect(`/lists?tab=suppliers&search=${supplier.name}`)}
              >
                <Truck className="mr-2 h-4 w-4 text-orange-500" />
                <span>{supplier.name}</span>
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
              onSelect={() => handleSelect(item.href)}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

// Кнопка для открытия (опционально, можно добавить в header)
export function CommandPaletteButton() {
  const [, setOpen] = useState(false);

  return (
    <button
      onClick={() => setOpen(true)}
      className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
    >
      <Search className="h-4 w-4" />
      <span className="hidden sm:inline">Поиск...</span>
      <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </button>
  );
}
