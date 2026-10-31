// Вкладки рабочей области в стиле УЭС (ues-site-v13-work/app/ues/tabDomain.js):
// журналы, отчёты и справочники открываются вкладками в шапке, разделы — нет.
// Вкладки хранятся в localStorage отдельно для каждого пользователя.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { isNavigationPath } from "@/lib/navigation";

export interface WorkspaceTab {
  path: string; // pathname + search
  title: string;
}

interface WorkspaceTabsContextValue {
  tabs: WorkspaceTab[];
  activePath: string;
  register: (path: string, title: string) => void;
  /** Закрыть вкладку. silent — не переходить на соседнюю (вызывающий сам решает, куда идти). */
  close: (path: string, opts?: { silent?: boolean }) => void;
  closeAll: () => void;
  move: (from: number, to: number) => void;
  open: (path: string) => void;
}

const WorkspaceTabsContext = createContext<WorkspaceTabsContextValue | null>(null);

const MAX_TABS = 20;

function storageKey(userId: string | undefined) {
  return userId ? `ues-tabs:${userId}` : null;
}

function readTabs(key: string | null): WorkspaceTab[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((t) => t && typeof t.path === "string" && typeof t.title === "string")
      : [];
  } catch {
    return [];
  }
}

export function currentFullPath() {
  return window.location.pathname + window.location.search;
}

export function WorkspaceTabsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const key = storageKey(user?.id);
  const [location, navigate] = useLocation();
  const search = useSearch();
  // Вкладки привязаны к пользователю. Сохранённый набор подхватываем прямо при
  // рендере (а не в эффекте), иначе эффект родителя затёр бы вкладку, которую
  // страница успела зарегистрировать при первой загрузке.
  const [state, setState] = useState<{ key: string | null; tabs: WorkspaceTab[] }>(() => ({
    key,
    tabs: readTabs(key),
  }));
  if (state.key !== key) {
    setState({ key, tabs: readTabs(key) });
  }
  const tabs = state.key === key ? state.tabs : readTabs(key);
  const setTabs = useCallback(
    (update: (prev: WorkspaceTab[]) => WorkspaceTab[]) =>
      setState((prev) => {
        const next = update(prev.tabs);
        return next === prev.tabs ? prev : { ...prev, tabs: next };
      }),
    []
  );

  useEffect(() => {
    if (!state.key) return;
    try {
      localStorage.setItem(state.key, JSON.stringify(state.tabs));
    } catch {
      // приватный режим — вкладки просто не запомнятся
    }
  }, [state]);

  // location от wouter — без query; берём полный путь из адресной строки.
  const activePath = useMemo(() => currentFullPath(), [location, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const register = useCallback((path: string, title: string) => {
    if (isNavigationPath(path)) return;
    setTabs((prev) => {
      const i = prev.findIndex((t) => t.path === path);
      if (i >= 0) {
        if (prev[i].title === title) return prev;
        const next = [...prev];
        next[i] = { path, title };
        return next;
      }
      const next = [...prev, { path, title }];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
  }, []);

  const close = useCallback(
    (path: string, opts?: { silent?: boolean }) => {
      setTabs((prev) => {
        const i = prev.findIndex((t) => t.path === path);
        if (i < 0) return prev;
        const next = prev.filter((t) => t.path !== path);
        if (!opts?.silent && path === currentFullPath()) {
          // Закрыли активную — переходим на соседнюю вкладку или на главную.
          const neighbour = next[i] ?? next[i - 1];
          setTimeout(() => navigate(neighbour ? neighbour.path : "/dashboard"), 0);
        }
        return next;
      });
    },
    [navigate]
  );

  const closeAll = useCallback(() => {
    setTabs(() => []);
    if (!isNavigationPath(currentFullPath())) navigate("/dashboard");
  }, [navigate]);

  const move = useCallback((from: number, to: number) => {
    setTabs((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev;
      const next = [...prev];
      const [t] = next.splice(from, 1);
      next.splice(to, 0, t);
      return next;
    });
  }, []);

  const open = useCallback((path: string) => navigate(path), [navigate]);

  const value = useMemo(
    () => ({ tabs, activePath, register, close, closeAll, move, open }),
    [tabs, activePath, register, close, closeAll, move, open]
  );

  return <WorkspaceTabsContext.Provider value={value}>{children}</WorkspaceTabsContext.Provider>;
}

export function useWorkspaceTabs() {
  const ctx = useContext(WorkspaceTabsContext);
  if (!ctx) throw new Error("useWorkspaceTabs must be used inside WorkspaceTabsProvider");
  return ctx;
}

/** Регистрирует текущую страницу как вкладку с заданным заголовком. */
export function useRegisterTab(title: string, enabled = true) {
  const { register } = useWorkspaceTabs();
  const [location] = useLocation();
  const search = useSearch();
  useEffect(() => {
    if (enabled && title) register(currentFullPath(), title);
  }, [enabled, title, location, search, register]);
}
