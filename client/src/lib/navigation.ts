// Разделы и пункты меню в стиле УЭС (ues-site-v13-work/app/ues/UesApplication.js, конфиг O).
// Раздел — навигационная страница с карточками; пункты открываются вкладками.

import type { LucideIcon } from "lucide-react";
import {
  Home,
  ShoppingCart,
  Warehouse,
  Wallet,
  BarChart3,
  BookOpen,
  History,
  Settings,
  ClipboardList,
  KanbanSquare,
  Users,
  PackagePlus,
  Boxes,
  PackageMinus,
  SlidersHorizontal,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ListOrdered,
  Landmark,
  Tags,
  TrendingUp,
  Scale,
  Coins,
  Receipt,
  LayoutDashboard,
  Bell,
  User,
  Smartphone,
  Trash2,
  Layers,
  Wrench,
  Settings2,
  Palette,
  Percent,
  Truck,
} from "lucide-react";

export interface NavItem {
  title: string;
  path: string;
  description?: string;
  code?: string; // короткий код документа, как ПКО/РКО в УЭС
  icon: LucideIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface NavSection {
  key: string;
  title: string;
  icon: LucideIcon;
  /** Куда ведёт пункт меню: страница раздела или сразу экран. */
  path: string;
  description?: string;
  groups: NavGroup[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "main",
    title: "Главное",
    icon: Home,
    path: "/dashboard",
    groups: [],
  },
  {
    key: "sales",
    title: "Продажи",
    icon: ShoppingCart,
    path: "/section/sales",
    description: "Заказы дилеров, производство и отгрузки",
    groups: [
      {
        title: "Заказы",
        items: [
          { title: "Заказы покупателей", path: "/orders", code: "ЗП", icon: ClipboardList, description: "Заказы дилеров и розницы" },
          { title: "Канбан", path: "/kanban", icon: KanbanSquare, description: "Заказы по статусам производства" },
        ],
      },
    ],
  },
  {
    key: "warehouse",
    title: "Склад",
    icon: Warehouse,
    path: "/section/warehouse",
    description: "Поступления, остатки и списания материалов",
    groups: [
      {
        title: "Документы",
        items: [
          { title: "Поступления товаров", path: "/warehouse", code: "ПТ", icon: PackagePlus, description: "Приход тканей и комплектующих" },
          { title: "Списания", path: "/warehouse/writeoffs", code: "СП", icon: PackageMinus, description: "Расход материалов в заказы" },
          { title: "Корректировки остатков", path: "/warehouse/adjustments", code: "КО", icon: SlidersHorizontal, description: "Излишки и недостачи" },
        ],
      },
      {
        title: "Остатки",
        items: [
          { title: "Остатки на складе", path: "/warehouse/stock", icon: Boxes, description: "Количество и стоимость материалов" },
        ],
      },
    ],
  },
  {
    key: "finance",
    title: "Финансы",
    icon: Wallet,
    path: "/section/finance",
    description: "Деньги, кассы и расчёты",
    groups: [
      {
        title: "Основные операции",
        items: [
          { title: "Приходные кассовые ордера", path: "/finance/income", code: "ПКО", icon: ArrowDownToLine, description: "Поступления денег" },
          { title: "Расходные кассовые ордера", path: "/finance/expense", code: "РКО", icon: ArrowUpFromLine, description: "Выплаты и оплаты поставщикам" },
          { title: "Перемещения денег", path: "/finance/transfers", code: "ПД", icon: ArrowLeftRight, description: "Между своими кассами" },
          { title: "Все операции", path: "/finance", icon: ListOrdered, description: "Общий журнал движения денег" },
        ],
      },
      {
        title: "Взаиморасчёты",
        items: [
          { title: "Взаиморасчёты", path: "/finance/settlements", icon: Users, description: "Дилеры и поставщики" },
        ],
      },
    ],
  },
  {
    key: "reports",
    title: "Отчёты",
    icon: BarChart3,
    path: "/section/reports",
    description: "Управленческая отчётность",
    groups: [
      {
        title: "Финансовые отчёты",
        items: [
          { title: "ОПиУ", path: "/reports/pnl", icon: TrendingUp, description: "Доходы, расходы и прибыль" },
          { title: "ДДС", path: "/reports/cash-flow", icon: Coins, description: "Движение денежных средств" },
          { title: "Баланс", path: "/reports/balance", icon: Scale, description: "Активы, обязательства, капитал" },
          { title: "Остатки касс", path: "/reports/cash-total", icon: Landmark, description: "Деньги по кассам" },
        ],
      },
      {
        title: "Аналитика",
        items: [
          { title: "Прибыль по заказам", path: "/reports/profit", icon: Receipt, description: "Маржа по каждому заказу" },
          { title: "Дебиторка и кредиторка", path: "/reports/ar-ap", icon: Users, description: "Кто кому должен" },
          { title: "Операции по статьям", path: "/reports/dds", icon: BarChart3, description: "Простой отчёт по операциям" },
          { title: "Сводка", path: "/dashboard", icon: LayoutDashboard, description: "Показатели месяца" },
        ],
      },
    ],
  },
  {
    key: "lists",
    title: "Справочники",
    icon: BookOpen,
    path: "/lists",
    description: "Основные данные предприятия",
    // Страница раздела своя (pages/directories/overview.tsx); пункты здесь — для поиска в меню.
    groups: [
      {
        title: "Номенклатура",
        items: [
          { title: "Ткани", path: "/lists/fabrics", icon: Layers, description: "Полотна, ширина рулона, категории" },
          { title: "Комплектующие", path: "/lists/components", icon: Wrench, description: "Фурнитура" },
          { title: "Системы", path: "/lists/systems", icon: Settings2, description: "Конструкции и состав" },
          { title: "Цвета", path: "/lists/colors", icon: Palette, description: "Цвета" },
          { title: "Множители", path: "/lists/multipliers", icon: Percent, description: "Множители цены" },
        ],
      },
      {
        title: "Контрагенты",
        items: [
          { title: "Дилеры", path: "/lists/dealers", icon: Users, description: "Покупатели" },
          { title: "Поставщики", path: "/lists/suppliers", icon: Truck, description: "Поставщики" },
        ],
      },
      {
        title: "Деньги",
        items: [
          { title: "Кассы", path: "/lists/cashboxes", icon: Landmark, description: "Места хранения денежных средств" },
          { title: "Статьи расходов и доходов", path: "/lists/expense-types", icon: Tags, description: "Назначения поступлений и выплат" },
        ],
      },
    ],
  },
  {
    key: "history",
    title: "История",
    icon: History,
    path: "/audit-log",
    groups: [],
  },
  {
    key: "settings",
    title: "Настройки",
    icon: Settings,
    path: "/section/settings",
    description: "Профиль и мобильное приложение",
    groups: [
      {
        title: "Администрирование",
        items: [
          { title: "Помеченные на удаление", path: "/settings/deletions", icon: Trash2, description: "Восстановление и окончательное удаление" },
        ],
      },
      {
        title: "Пользователь",
        items: [
          { title: "Профиль", path: "/profile", icon: User, description: "Пароли и доступ к отчётам" },
          { title: "Уведомления", path: "/notifications", icon: Bell, description: "События в системе" },
        ],
      },
      {
        title: "Приложение дилера",
        items: [
          { title: "Уведомления в приложение", path: "/app-notifications", icon: Smartphone, description: "Рассылки дилерам" },
        ],
      },
    ],
  },
];

/** Пути, которые не открываются вкладкой (навигационные страницы, как разделы в УЭС). */
export function isNavigationPath(path: string) {
  return path.startsWith("/section/") || path === "/dashboard" || path === "/lists";
}

function pathOnly(path: string) {
  return path.split("?")[0];
}

/** Раздел, к которому относится путь — для подписи над заголовком и подсветки меню. */
export function sectionForPath(path: string): NavSection | undefined {
  const p = pathOnly(path);
  let best: { section: NavSection; len: number } | undefined;
  for (const section of NAV_SECTIONS) {
    const candidates = [
      // Собственный путь раздела весит чуть больше ссылки на него из другого раздела
      // (/lists принадлежит «Справочникам», хоть на него и ссылаются «Финансы»).
      { path: section.path, bonus: 0.5 },
      ...section.groups.flatMap((g) => g.items.map((i) => ({ path: i.path, bonus: 0 }))),
    ];
    for (const c of candidates) {
      const cp = pathOnly(c.path);
      if (p === cp || p.startsWith(cp + "/")) {
        const len = cp.length + c.bonus;
        if (!best || len > best.len) best = { section, len };
      }
    }
  }
  return best?.section;
}

export function sectionByKey(key: string) {
  return NAV_SECTIONS.find((s) => s.key === key);
}
