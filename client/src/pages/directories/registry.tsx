// Справочники в стиле УЭС (ues-site-v13-work/app/ues/UesApplication.js, объект g):
// у каждого — название, описание, значок, колонки списка и поля карточки «Основные сведения».

import type { ReactNode } from "react";
import {
  EXPENSE_OPERATION_TYPES,
  FABRIC_CATEGORIES,
  INCOME_OPERATION_TYPES,
} from "@shared/schema";
import { fmtMoney } from "@/components/ues/report-kit";

export type Row = Record<string, any>;

export interface Option {
  value: string;
  label: string;
}

/** Откуда берутся варианты выбора: фиксированный список или другой справочник. */
export type OptionsSource =
  | { kind: "static"; options: Option[] }
  | { kind: "directory"; key: DirectoryKey }
  | { kind: "systemKeys" }
  | { kind: "operationTypes" };

export interface FieldDef {
  name: string;
  label: string;
  type: "text" | "number" | "money" | "select" | "password";
  required?: boolean;
  options?: OptionsSource;
  /** Пустой вариант списка («Не задан»). */
  emptyLabel?: string;
  placeholder?: string;
  hint?: string;
  /** Список подсказок для ввода (единицы измерения). */
  suggestions?: string[];
}

export interface ColumnDef {
  header: string;
  num?: boolean;
  cell: (row: Row, ctx: CellContext) => ReactNode;
  text?: (row: Row, ctx: CellContext) => string;
}

export interface CellContext {
  lookup: (key: DirectoryKey, id: string | null | undefined) => string;
}

export interface DirectoryDef {
  key: DirectoryKey;
  title: string;
  /** Подпись записи в заголовке карточки. */
  recordTitle: (row: Row) => string;
  description: string;
  icon: string;
  api: string;
  /** Справочники, нужные для колонок и списков выбора. */
  needs?: DirectoryKey[];
  columns: ColumnDef[];
  fields: FieldDef[];
  /** Значения новой записи. */
  defaults?: Record<string, string>;
  /** Отправка: пустые строки → null, особые правила справочника. */
  toPayload?: (values: Record<string, string>, isNew: boolean) => Record<string, unknown>;
  deleteWarning?: string;
}

export type DirectoryKey =
  | "fabrics"
  | "components"
  | "systems"
  | "colors"
  | "multipliers"
  | "dealers"
  | "suppliers"
  | "cashboxes"
  | "expense-types";

const money = (v: unknown) => fmtMoney(parseFloat(String(v ?? 0)) || 0);
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/** Долг: больше нуля — красным, меньше нуля — это аванс. */
const debt = (v: number) => (
  <span className={v > 0.004 ? "ues-neg" : v < -0.004 ? "ues-pos" : "ues-muted"}>
    {v < -0.004 ? `аванс ${fmtMoney(-v)}` : fmtMoney(v)}
  </span>
);

const signed = (v: number) => (
  <span className={v < 0 ? "ues-neg" : v > 0 ? "ues-pos" : "ues-muted"}>{fmtMoney(v)}</span>
);

export const DIRECTORIES: DirectoryDef[] = [
  {
    key: "fabrics",
    title: "Ткани",
    recordTitle: (r) => r.name,
    description: "Полотна для жалюзи: ширина рулона, тип и категория",
    icon: "ТК",
    api: "/api/fabrics",
    needs: ["colors"],
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Цвет", cell: (r, c) => c.lookup("colors", r.colorId), text: (r, c) => c.lookup("colors", r.colorId) },
      { header: "Тип", cell: (r) => (r.fabricType === "zebra" ? "Зебра" : "Рулонная") },
      { header: "Категория", cell: (r) => dash(r.category), text: (r) => r.category ?? "" },
      { header: "Ширина рулона, см", num: true, cell: (r) => dash(r.width ? parseFloat(r.width) : "") },
      { header: "Цена за м²", num: true, cell: (r) => (r.price ? money(r.price) : "—") },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "colorId", label: "Цвет", type: "select", options: { kind: "directory", key: "colors" }, emptyLabel: "Не указан" },
      {
        name: "fabricType",
        label: "Тип полотна",
        type: "select",
        required: true,
        options: {
          kind: "static",
          options: [
            { value: "roll", label: "Рулонная" },
            { value: "zebra", label: "Зебра (два слоя)" },
          ],
        },
      },
      {
        name: "category",
        label: "Категория",
        type: "select",
        options: { kind: "static", options: FABRIC_CATEGORIES.map((c) => ({ value: c, label: c })) },
        emptyLabel: "Не указана",
      },
      { name: "width", label: "Ширина рулона, см", type: "number", hint: "Нужна для поступлений в п.м. и для раскроя." },
      { name: "price", label: "Цена за м²", type: "money", hint: "Используется, пока нет поступлений с ценой." },
    ],
    defaults: { fabricType: "roll" },
  },
  {
    key: "components",
    title: "Комплектующие",
    recordTitle: (r) => r.name,
    description: "Карнизы, цепочки, кронштейны и прочая фурнитура",
    icon: "КМ",
    api: "/api/components",
    needs: ["colors"],
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Цвет", cell: (r, c) => c.lookup("colors", r.colorId), text: (r, c) => c.lookup("colors", r.colorId) },
      { header: "Ед. изм.", cell: (r) => dash(r.unit), text: (r) => r.unit ?? "" },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "colorId", label: "Цвет", type: "select", options: { kind: "directory", key: "colors" }, emptyLabel: "Не указан" },
      { name: "unit", label: "Единица измерения", type: "text", placeholder: "шт", suggestions: ["шт", "м", "п.м.", "м²", "компл."] },
    ],
  },
  {
    key: "systems",
    title: "Системы",
    recordTitle: (r) => r.name,
    description: "Конструкции жалюзи: коэффициенты, множитель и состав комплектующих",
    icon: "СИ",
    api: "/api/systems",
    needs: ["colors", "multipliers", "components"],
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Ключ коэффициентов", cell: (r) => dash(r.systemKey), text: (r) => r.systemKey ?? "" },
      { header: "Множитель", cell: (r, c) => c.lookup("multipliers", r.multiplierId) },
      { header: "Цвет", cell: (r, c) => c.lookup("colors", r.colorId) },
      { header: "Формула", cell: (r) => dash(r.formula), text: (r) => r.formula ?? "" },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "systemKey", label: "Ключ коэффициентов", type: "select", options: { kind: "systemKeys" }, emptyLabel: "Не задан" },
      { name: "multiplierId", label: "Множитель", type: "select", options: { kind: "directory", key: "multipliers" }, emptyLabel: "Не задан" },
      { name: "colorId", label: "Цвет", type: "select", options: { kind: "directory", key: "colors" }, emptyLabel: "Не указан" },
      { name: "formula", label: "Формула", type: "text" },
    ],
  },
  {
    key: "colors",
    title: "Цвета",
    recordTitle: (r) => r.name,
    description: "Цвета тканей, систем и комплектующих",
    icon: "ЦВ",
    api: "/api/colors",
    columns: [{ header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name }],
    fields: [{ name: "name", label: "Наименование", type: "text", required: true }],
  },
  {
    key: "multipliers",
    title: "Множители",
    recordTitle: (r) => r.name || `Множитель ${r.value}`,
    description: "Множители цены систем: цена створки = коэффициент × множитель",
    icon: "×",
    api: "/api/multipliers",
    columns: [
      { header: "Наименование", cell: (r) => <b>{dash(r.name)}</b>, text: (r) => r.name ?? "" },
      { header: "Значение", num: true, cell: (r) => dash(r.value ? parseFloat(r.value) : ""), text: (r) => String(r.value) },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "value", label: "Значение", type: "number", required: true },
    ],
  },
  {
    key: "dealers",
    title: "Дилеры",
    recordTitle: (r) => r.fullName,
    description: "Покупатели: начальные долги, ставки цеха и вход в приложение",
    icon: "Д",
    api: "/api/dealers",
    columns: [
      { header: "ФИО / наименование", cell: (r) => <b>{r.fullName}</b>, text: (r) => r.fullName },
      { header: "Город", cell: (r) => dash(r.city), text: (r) => r.city ?? "" },
      { header: "Телефон", cell: (r) => dash(r.phone), text: (r) => r.phone ?? "" },
      { header: "Приложение", cell: (r) => (r.login ? <span className="ues-pos">{r.login}</span> : <span className="ues-muted">нет входа</span>), text: (r) => r.login ?? "" },
      { header: "Начальный долг", num: true, cell: (r) => money(r.openingBalance) },
      // API отдаёт баланс со знаком «минус — дилер должен нам»; показываем долг положительным.
      { header: "Долг по всем заказам", num: true, cell: (r) => (typeof r.balance === "number" ? debt(-r.balance) : "—") },
    ],
    fields: [
      { name: "fullName", label: "ФИО / наименование", type: "text", required: true },
      { name: "city", label: "Город", type: "text" },
      { name: "phone", label: "Телефон", type: "text", placeholder: "+7 900 000-00-00" },
      { name: "openingBalance", label: "Начальный долг", type: "money", hint: "Больше нуля — дилер должен нам, меньше нуля — его аванс." },
      { name: "workshopRateRulon", label: "Ставка цеха, рулонные", type: "number" },
      { name: "workshopRateZebra", label: "Ставка цеха, зебра", type: "number" },
      { name: "login", label: "Логин в приложении", type: "text" },
      { name: "password", label: "Пароль в приложении", type: "password", placeholder: "Оставьте пустым, чтобы не менять" },
    ],
    defaults: { openingBalance: "0", workshopRateRulon: "28", workshopRateZebra: "28" },
    toPayload: (v) => {
      const out: Record<string, unknown> = { ...v };
      if (!v.password) delete out.password;
      return out;
    },
    deleteWarning: "Заказы и платежи дилера останутся, но потеряют связь с ним.",
  },
  {
    key: "suppliers",
    title: "Поставщики",
    recordTitle: (r) => r.name,
    description: "Поставщики тканей и комплектующих, начальные долги",
    icon: "П",
    api: "/api/suppliers",
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Начальный долг", num: true, cell: (r) => money(r.openingBalance) },
      { header: "Наш долг", num: true, cell: (r) => (typeof r.balance === "number" ? debt(r.balance) : "—") },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "openingBalance", label: "Начальный долг", type: "money", hint: "Больше нуля — мы должны поставщику." },
    ],
    defaults: { openingBalance: "0" },
  },
  {
    key: "cashboxes",
    title: "Кассы",
    recordTitle: (r) => r.name,
    description: "Места хранения денежных средств",
    icon: "↗",
    api: "/api/cashboxes",
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Начальный остаток", num: true, cell: (r) => money(r.openingBalance) },
      { header: "Остаток сейчас", num: true, cell: (r) => (typeof r.balance === "number" ? signed(r.balance) : "—") },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      { name: "openingBalance", label: "Начальный остаток", type: "money", hint: "Деньги в кассе на момент начала учёта." },
    ],
    defaults: { openingBalance: "0" },
    deleteWarning: "Касса с операциями не удалится — сначала перенесите или удалите её операции.",
  },
  {
    key: "expense-types",
    title: "Статьи расходов и доходов",
    recordTitle: (r) => r.name,
    description: "Назначения поступлений и выплат денежных средств",
    icon: "ДР",
    api: "/api/expense-types",
    columns: [
      { header: "Наименование", cell: (r) => <b>{r.name}</b>, text: (r) => r.name },
      { header: "Тип статьи", cell: (r) => (r.direction === "income" ? "Доход" : "Расход") },
      {
        header: "Вид операции",
        cell: (r) =>
          r.operationType ?? (
            <span className="ues-muted">
              {r.direction === "income" ? "Прочее поступление" : "Операционные расходы"} (по умолчанию)
            </span>
          ),
        text: (r) => r.operationType ?? "",
      },
    ],
    fields: [
      { name: "name", label: "Наименование", type: "text", required: true },
      {
        name: "direction",
        label: "Тип статьи",
        type: "select",
        required: true,
        options: {
          kind: "static",
          options: [
            { value: "expense", label: "Расход" },
            { value: "income", label: "Доход" },
          ],
        },
      },
      {
        name: "operationType",
        label: "Вид операции",
        type: "select",
        options: { kind: "operationTypes" },
        emptyLabel: "Не задан",
        hint: "Подставляется в ПКО и РКО и решает, куда статья попадёт в ОПиУ и Балансе.",
      },
    ],
    defaults: { direction: "expense" },
  },
];

export const DIRECTORY_BY_KEY = Object.fromEntries(DIRECTORIES.map((d) => [d.key, d])) as Record<
  DirectoryKey,
  DirectoryDef
>;

/** Варианты вида операции для статьи — под её тип. */
export function operationTypeOptions(direction: string): Option[] {
  const list: readonly string[] = direction === "income" ? INCOME_OPERATION_TYPES : EXPENSE_OPERATION_TYPES;
  return list.map((o) => ({ value: o, label: o }));
}

/** Подпись записи справочника для списков выбора. */
export function optionLabel(key: DirectoryKey, row: Row): string {
  return DIRECTORY_BY_KEY[key].recordTitle(row) ?? "";
}
