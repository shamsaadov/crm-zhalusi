import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ListTodo, 
  ShoppingCart, 
  Wallet, 
  Warehouse, 
  BarChart3,
  TrendingUp,
  Users,
  Building2,
  LogOut,
  Moon,
  Sun,
  User
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

const mainNavItems = [
  { title: "Заказы", url: "/orders", icon: ShoppingCart },
  { title: "Финансы", url: "/finance", icon: Wallet },
  { title: "Склад", url: "/warehouse", icon: Warehouse },
  { title: "Справочники", url: "/lists", icon: ListTodo },
];

const reportNavItems = [
  { title: "ДДС", url: "/reports/dds", icon: BarChart3 },
  { title: "Прибыль", url: "/reports/profit", icon: TrendingUp },
  { title: "Дебиторка/Кредиторка", url: "/reports/ar-ap", icon: Users },
  { title: "Остатки касс", url: "/reports/cash-total", icon: Building2 },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold">Жалюзи Учет</span>
            <span className="text-xs text-muted-foreground">Система управления</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Основное</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url || location.startsWith(item.url + "/")}
                  >
                    <Link href={item.url} data-testid={`nav-${item.url.slice(1)}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Отчеты</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reportNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`nav-${item.url.replace("/reports/", "report-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Link href="/profile" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors truncate max-w-[140px]" data-testid="nav-profile">
              <User className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">{user?.email}</span>
            </Link>
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
          </div>
          <Button 
            variant="outline" 
            className="w-full justify-start gap-2"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4" />
            Выйти
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
