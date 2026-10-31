// Оболочка приложения в стиле УЭС: синяя шапка с вкладками открытых экранов,
// меню разделов слева, заголовок страницы с подписью раздела.

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  LogOut,
  Menu,
  Moon,
  Search,
  Sun,
  User,
  X,
  XCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotificationBell } from "@/components/notification-bell";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { NAV_SECTIONS, isNavigationPath, sectionForPath, type NavItem } from "@/lib/navigation";
import { currentFullPath, useRegisterTab, useWorkspaceTabs } from "@/lib/workspace-tabs";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
  title: string;
  /** Подпись над заголовком; по умолчанию — название раздела. */
  caption?: string;
  /** Кнопки справа от заголовка. */
  actions?: React.ReactNode;
  /** Оставлено для совместимости со старыми страницами. */
  breadcrumbs?: { label: string; href?: string }[];
}

const SIDEBAR_KEY = "ues-sidebar-collapsed";

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}

export function Layout({ children, title, caption, actions }: LayoutProps) {
  const [location] = useLocation();
  const narrow = useIsNarrow();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useRegisterTab(title, !isNavigationPath(currentFullPath()));

  useEffect(() => setMobileOpen(false), [location]);

  const toggleSidebar = () => {
    if (narrow) {
      setMobileOpen((v) => !v);
      return;
    }
    setCollapsed((v) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const section = sectionForPath(currentFullPath());
  const sidebarVisible = narrow ? mobileOpen : !collapsed;

  return (
    <div className="flex h-screen w-full flex-col bg-[var(--ues-bg)]">
      <Header onToggleSidebar={toggleSidebar} />
      <div className="relative flex min-h-0 flex-1">
        {sidebarVisible && (
          <>
            {narrow && (
              <div
                className="absolute inset-0 z-30 bg-black/30"
                onClick={() => setMobileOpen(false)}
                aria-hidden
              />
            )}
            <Sidebar className={narrow ? "absolute inset-y-0 left-0 z-40 shadow-xl" : ""} />
          </>
        )}
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="ues-page">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="ues-page-caption">{caption ?? section?.title ?? ""}</div>
                <h1 className="ues-page-title" data-testid="text-page-title">
                  {title}
                </h1>
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

// ---------- Шапка ----------

function Header({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="ues-header z-50 flex shrink-0 items-center gap-1.5 px-2">
      <button className="ues-header-btn" onClick={onToggleSidebar} title="Меню" data-testid="button-sidebar-toggle">
        <Menu className="h-4 w-4" />
      </button>
      <Link href="/dashboard" className="mr-1 flex items-center gap-2 pl-1 pr-2">
        <span className="ues-logo">Ж</span>
        <span className="hidden text-[13px] font-bold tracking-wide sm:inline">Жалюзи</span>
      </Link>
      <button className="ues-header-btn" onClick={() => window.history.back()} title="Назад">
        <ArrowLeft className="h-3.5 w-3.5" />
      </button>
      <button className="ues-header-btn" onClick={() => window.history.forward()} title="Вперёд">
        <ArrowRight className="h-3.5 w-3.5" />
      </button>

      <TabsStrip />

      <button
        className="ues-header-btn gap-1.5 px-2 text-[12px]"
        onClick={() =>
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))
        }
        title="Поиск (⌘K)"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Поиск</span>
      </button>
      <div className="ues-header-bell [&_button]:h-[26px] [&_button]:w-[26px] [&_button]:text-white/90 [&_button:hover]:bg-white/15">
        <NotificationBell />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ues-header-btn gap-1.5 px-2 text-[12px]" data-testid="button-profile-menu">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[11px] font-bold">
              {(user?.name || user?.email || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[140px] truncate md:inline">{user?.name || user?.email}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user?.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/profile" data-testid="nav-profile">
              <User className="mr-2 h-4 w-4" />
              Профиль
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={toggleTheme} data-testid="button-theme-toggle">
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            {theme === "dark" ? "Светлая тема" : "Тёмная тема"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout} data-testid="button-logout">
            <LogOut className="mr-2 h-4 w-4" />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

function TabsStrip() {
  const { tabs, activePath, close, closeAll, move, open } = useWorkspaceTabs();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Активная вкладка всегда видна.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>(".ues-tab.is-active");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activePath, tabs.length]);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1 px-1">
      <div ref={stripRef} className="ues-tabs-strip flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {tabs.map((tab, i) => (
          <div
            key={tab.path}
            role="tab"
            aria-selected={tab.path === activePath}
            className={cn("ues-tab", tab.path === activePath && "is-active", dragIndex === i && "is-dragging")}
            title={tab.title}
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragEnd={() => setDragIndex(null)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
            }}
            onClick={() => open(tab.path)}
            onAuxClick={(e) => {
              if (e.button === 1) close(tab.path);
            }}
            data-testid={`workspace-tab-${i}`}
          >
            <span className="ues-tab-title">{tab.title}</span>
            <button
              className="ues-tab-close"
              onClick={(e) => {
                e.stopPropagation();
                close(tab.path);
              }}
              title="Закрыть вкладку"
              aria-label={`Закрыть «${tab.title}»`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {tabs.length > 1 && (
        <button className="ues-header-btn" onClick={closeAll} title="Закрыть все вкладки">
          <XCircle className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

// ---------- Меню разделов ----------

function Sidebar({ className }: { className?: string }) {
  const [query, setQuery] = useState("");
  const path = currentFullPath();
  const active = sectionForPath(path);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const sections = NAV_SECTIONS.filter((s) => s.title.toLowerCase().includes(q));
    const items: (NavItem & { section: string })[] = [];
    for (const s of NAV_SECTIONS) {
      for (const g of s.groups) {
        for (const item of g.items) {
          const hay = `${item.title} ${item.code ?? ""} ${item.description ?? ""}`.toLowerCase();
          if (hay.includes(q) && !items.some((x) => x.path === item.path)) {
            items.push({ ...item, section: s.title });
          }
        }
      }
    }
    return { sections, items };
  }, [q]);

  const sectionsToShow = results ? results.sections : NAV_SECTIONS;

  return (
    <aside className={cn("ues-sidebar flex shrink-0 flex-col", className)}>
      <div className="px-3 pb-2 pt-3">
        <div className="ues-sidebar-caption mb-2 px-1">РАЗДЕЛЫ</div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ues-muted)]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти раздел"
            className="ues-input h-8 w-full !pl-7 text-[12.5px]"
            data-testid="input-nav-search"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {sectionsToShow.map((s) => (
          <Link
            key={s.key}
            href={s.path}
            className={cn("ues-nav-item", active?.key === s.key && "is-active")}
            data-testid={`nav-section-${s.key}`}
          >
            <s.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{s.title}</span>
          </Link>
        ))}
        {results && results.items.length > 0 && (
          <div className="mt-2 border-t border-[var(--ues-border)] pt-2">
            {results.items.map((item) => (
              <Link key={item.path} href={item.path} className="ues-nav-sub !pl-3" title={item.section}>
                <span className="truncate">
                  {item.code ? `${item.code} · ` : ""}
                  {item.title}
                </span>
              </Link>
            ))}
          </div>
        )}
        {results && results.sections.length === 0 && results.items.length === 0 && (
          <div className="px-2 py-3 text-[12px] text-[var(--ues-muted)]">Ничего не найдено</div>
        )}
      </nav>
    </aside>
  );
}
