// Управленческая отчётность по образцу УЭС: ОПиУ, ДДС, Баланс.
//
// Чистые функции над выгруженными данными пользователя — без обращения к БД,
// чтобы их можно было проверять тестами (server/__tests__/financial-reports.test.ts).
//
// Принципы (как в УЭС, ues-site-v13-work/app/ues/erpDomain.js):
// - ОПиУ по методу начисления: выручка — в день отгрузки заказа (orders.shippedAt),
//   себестоимость — списания материалов по этому заказу, расходы — по виду операции.
// - ДДС кассовый: только движения денег, перемещения между кассами в итог не входят.
// - Баланс строится так, что сходится по построению:
//   нераспределённая прибыль = ОПиУ за всё время до даты баланса.
//
// Все суммы внутри — целые копейки. Наружу отдаются рубли с 2 знаками.

import type { ExpenseOperationType, IncomeOperationType } from "@shared/schema";
import { resolveOperationType as resolveSharedOperationType } from "@shared/finance";

// ---------- Входные данные ----------

export interface FinOrder {
  id: string;
  orderNumber: number;
  dealerId: string | null;
  status: string | null;
  shippedAt: string | null; // YYYY-MM-DD
  salePrice: string | number | null;
}

export interface FinOperation {
  id: string;
  type: string; // income | expense | supplier_payment | transfer
  operationType: string | null;
  amount: string | number;
  date: string; // YYYY-MM-DD
  cashboxId: string | null;
  fromCashboxId: string | null;
  toCashboxId: string | null;
  dealerId: string | null;
  supplierId: string | null;
  expenseTypeId: string | null;
  comment: string | null;
}

export interface FinNamed {
  id: string;
  name: string;
  openingBalance?: string | number | null;
}

export interface FinExpenseType {
  id: string;
  name: string;
  direction: string;
  operationType: string | null;
}

export interface FinReceipt {
  id: string;
  date: string;
  supplierId: string | null;
  total: string | number | null;
}

export interface FinWriteoff {
  id: string;
  orderId: string | null;
  date: string;
  total: string | number | null;
}

export interface FinData {
  orders: FinOrder[];
  operations: FinOperation[]; // только проведённые (не черновики)
  dealers: FinNamed[]; // openingBalance > 0 — дилер должен нам
  suppliers: FinNamed[]; // openingBalance > 0 — мы должны поставщику
  cashboxes: FinNamed[];
  expenseTypes: FinExpenseType[];
  receipts: FinReceipt[]; // supplierId = null — оприходование (корректировка +)
  writeoffs: FinWriteoff[]; // orderId = null — списание по корректировке
}

// ---------- Выходные данные ----------

export interface ReportDoc {
  id: string;
  kind: "finance" | "order" | "writeoff" | "receipt" | "calc";
  label: string; // «ПКО от 01.10.2026», «Заказ №1012»
  date: string | null;
  amount: number;
  counterparty?: string | null;
  comment?: string | null;
  orderId?: string | null;
}

export interface ReportGroup {
  key: string;
  title: string;
  amount: number;
  share: number | null; // доля от итога секции, %
  pinned?: boolean;
  children?: ReportGroup[];
  docs?: ReportDoc[];
}

export interface ReportSection {
  key: string;
  title: string;
  total: number;
  groups: ReportGroup[];
}

// ---------- Утилиты ----------

const MIN_DATE = "0001-01-01";
const MAX_DATE = "9999-12-31";
const DEPRECIATION_MONTHS = 60;

export function toKop(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const rub = (kop: number) => Math.round(kop) / 100 || 0; // без «-0»

function inRange(date: string | null | undefined, from: string, to: string) {
  return !!date && date >= from && date <= to;
}

function maxDate(a: string, b: string) {
  return a > b ? a : b;
}

function dayBefore(date: string): string {
  if (date <= MIN_DATE) return MIN_DATE;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(date: string | null | undefined) {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Вид операции платежа (общая логика клиента и сервера — shared/finance.ts).
 */
export function resolveOperationType(
  op: FinOperation,
  expenseTypesById: Map<string, FinExpenseType>
): IncomeOperationType | ExpenseOperationType | "Перемещение" {
  const article = op.expenseTypeId ? expenseTypesById.get(op.expenseTypeId) : undefined;
  return resolveSharedOperationType(op, article);
}

/** Знак движения денег по кассам: +поступление, −выплата, 0 перемещение. */
function cashSign(op: FinOperation) {
  if (op.type === "income") return 1;
  if (op.type === "expense" || op.type === "supplier_payment") return -1;
  return 0;
}

interface Ctx {
  data: FinData;
  expenseTypes: Map<string, FinExpenseType>;
  dealers: Map<string, FinNamed>;
  suppliers: Map<string, FinNamed>;
  cashboxes: Map<string, FinNamed>;
  orders: Map<string, FinOrder>;
  opType: Map<string, string>;
}

function makeCtx(data: FinData): Ctx {
  const expenseTypes = new Map(data.expenseTypes.map((e) => [e.id, e]));
  const opType = new Map<string, string>();
  for (const op of data.operations) opType.set(op.id, resolveOperationType(op, expenseTypes));
  return {
    data,
    expenseTypes,
    dealers: new Map(data.dealers.map((d) => [d.id, d])),
    suppliers: new Map(data.suppliers.map((s) => [s.id, s])),
    cashboxes: new Map(data.cashboxes.map((c) => [c.id, c])),
    orders: new Map(data.orders.map((o) => [o.id, o])),
    opType,
  };
}

function opCounterparty(ctx: Ctx, op: FinOperation): string | null {
  if (op.dealerId) return ctx.dealers.get(op.dealerId)?.name ?? null;
  if (op.supplierId) return ctx.suppliers.get(op.supplierId)?.name ?? null;
  return null;
}

function opDoc(ctx: Ctx, op: FinOperation, amountKop: number): ReportDoc {
  const prefix =
    op.type === "income" ? "ПКО" : op.type === "transfer" ? "Перемещение" : "РКО";
  return {
    id: op.id,
    kind: "finance",
    label: `${prefix} от ${fmtDate(op.date)}`,
    date: op.date,
    amount: rub(amountKop),
    counterparty: opCounterparty(ctx, op),
    comment: op.comment,
  };
}

function articleTitle(ctx: Ctx, op: FinOperation, fallback: string) {
  const a = op.expenseTypeId ? ctx.expenseTypes.get(op.expenseTypeId) : undefined;
  return a?.name || fallback;
}

/** Копилка для групп: ключ → сумма + документы + подгруппы. */
class GroupBuilder {
  private map = new Map<
    string,
    { title: string; kop: number; pinned?: boolean; docs: ReportDoc[]; kids: GroupBuilder | null }
  >();

  add(key: string, title: string, kop: number, doc?: ReportDoc, pinned?: boolean) {
    const g = this.map.get(key) ?? { title, kop: 0, pinned, docs: [], kids: null };
    g.kop += kop;
    if (doc) g.docs.push(doc);
    if (pinned) g.pinned = true;
    this.map.set(key, g);
    return g;
  }

  child(key: string, title: string, pinned?: boolean) {
    const g = this.add(key, title, 0, undefined, pinned);
    if (!g.kids) g.kids = new GroupBuilder();
    return g.kids;
  }

  addNested(
    key: string,
    title: string,
    childKey: string,
    childTitle: string,
    kop: number,
    doc?: ReportDoc,
    pinned?: boolean
  ) {
    const kids = this.child(key, title, pinned);
    this.map.get(key)!.kop += kop;
    kids.add(childKey, childTitle, kop, doc);
  }

  totalKop() {
    let t = 0;
    this.map.forEach((g) => (t += g.kop));
    return t;
  }

  build(shareBaseKop: number | null): ReportGroup[] {
    const out: ReportGroup[] = [];
    this.map.forEach((g, key) => {
      if (g.kop === 0 && g.docs.length === 0 && !g.kids) return;
      out.push({
        key,
        title: g.title,
        amount: rub(g.kop),
        share:
          shareBaseKop && shareBaseKop > 0 && g.kop > 0
            ? Math.round((g.kop / shareBaseKop) * 1000) / 10
            : null,
        pinned: g.pinned || undefined,
        children: g.kids ? g.kids.build(g.kop > 0 ? g.kop : null) : undefined,
        docs: g.docs.length
          ? [...g.docs].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
          : undefined,
      });
    });
    return out.sort(
      (a, b) =>
        Number(!!b.pinned) - Number(!!a.pinned) || b.amount - a.amount || a.title.localeCompare(b.title)
    );
  }
}

// ---------- Имущество и амортизация ----------

function monthIndex(date: string) {
  const [y, m] = date.split("-").map(Number);
  return y * 12 + (m - 1);
}

/**
 * Накопленная амортизация на дату: линейно 60 месяцев, начиная с месяца
 * после покупки (как в УЭС, calculatePropertyAssets).
 */
function accumulatedDepreciation(costKop: number, purchaseDate: string, asOf: string) {
  if (asOf < purchaseDate) return 0;
  const months = Math.max(0, Math.min(DEPRECIATION_MONTHS, monthIndex(asOf) - monthIndex(purchaseDate)));
  return Math.round((costKop * months) / DEPRECIATION_MONTHS);
}

// ---------- ОПиУ ----------

interface PnlCore {
  revenue: number;
  cogs: number;
  otherIncome: number;
  operatingExpenses: number;
  otherExpenses: number;
  depreciation: number;
  netProfit: number;
}

/** Дата признания себестоимости: позже из даты списания и даты отгрузки. */
function writeoffRecognitionDate(w: FinWriteoff, order: FinOrder | undefined) {
  if (!order?.shippedAt) return null;
  return maxDate(w.date, order.shippedAt);
}

function isShipped(order: FinOrder) {
  return order.status === "Отгружен" && !!order.shippedAt;
}

export function calculateProfitAndLoss(data: FinData, from: string, to: string) {
  const ctx = makeCtx(data);
  const income = new GroupBuilder();
  const expenses = new GroupBuilder();
  const core: PnlCore = {
    revenue: 0,
    cogs: 0,
    otherIncome: 0,
    operatingExpenses: 0,
    otherExpenses: 0,
    depreciation: 0,
    netProfit: 0,
  };

  // Выручка: отгрузки периода, раскрытие по дилеру → заказам.
  const shippedInPeriod = new Set<string>();
  for (const o of data.orders) {
    if (!isShipped(o) || !inRange(o.shippedAt, from, to)) continue;
    shippedInPeriod.add(o.id);
    const kop = toKop(o.salePrice);
    core.revenue += kop;
    const dealer = o.dealerId ? ctx.dealers.get(o.dealerId) : undefined;
    income.addNested(
      "revenue",
      "Продажи",
      o.dealerId ?? "no-dealer",
      dealer?.name ?? "Без дилера",
      kop,
      {
        id: o.id,
        kind: "order",
        label: `Заказ №${o.orderNumber}`,
        date: o.shippedAt,
        amount: rub(kop),
        counterparty: dealer?.name ?? null,
        orderId: o.id,
      },
      true
    );
  }

  // Себестоимость: списания по отгруженным заказам, признанные в периоде.
  const costByOrder = new Map<string, number>();
  const ordersWithWriteoffs = new Set<string>();
  for (const w of data.writeoffs) {
    if (!w.orderId) continue;
    ordersWithWriteoffs.add(w.orderId);
    const order = ctx.orders.get(w.orderId);
    if (!order || !isShipped(order)) continue;
    const rec = writeoffRecognitionDate(w, order);
    if (!inRange(rec, from, to)) continue;
    costByOrder.set(w.orderId, (costByOrder.get(w.orderId) ?? 0) + toKop(w.total));
  }
  costByOrder.forEach((kop, orderId) => {
    const o = ctx.orders.get(orderId)!;
    core.cogs += kop;
    const dealer = o.dealerId ? ctx.dealers.get(o.dealerId) : undefined;
    expenses.add(
      "cogs",
      "Себестоимость проданного",
      kop,
      {
        id: o.id,
        kind: "order",
        label: `Заказ №${o.orderNumber}`,
        date: o.shippedAt,
        amount: rub(kop),
        counterparty: dealer?.name ?? null,
        orderId: o.id,
      },
      true
    );
  });

  // Платежи, которые являются доходом или расходом периода.
  for (const op of data.operations) {
    if (!inRange(op.date, from, to)) continue;
    const t = ctx.opType.get(op.id)!;
    const kop = toKop(op.amount);
    if (t === "Прочее поступление") {
      core.otherIncome += kop;
      const title = articleTitle(ctx, op, "Прочие доходы");
      income.add(`article:${op.expenseTypeId ?? "other-income"}`, title, kop, opDoc(ctx, op, kop));
    } else if (t === "Операционные расходы" || t === "Зарплата сотрудникам") {
      core.operatingExpenses += kop;
      const fallback = t === "Зарплата сотрудникам" ? "Зарплата" : "Без статьи";
      const title = articleTitle(ctx, op, fallback);
      const key = op.expenseTypeId ? `article:${op.expenseTypeId}` : `op:${t}`;
      expenses.add(key, title, kop, opDoc(ctx, op, kop));
    } else if (t === "Прочие расходы") {
      core.otherExpenses += kop;
      const title = articleTitle(ctx, op, "Прочие расходы");
      const key = op.expenseTypeId ? `article:${op.expenseTypeId}` : "op:other-expenses";
      expenses.add(key, title, kop, opDoc(ctx, op, kop));
    }
  }

  // Амортизация имущества за период.
  for (const op of data.operations) {
    if (ctx.opType.get(op.id) !== "Покупка имущества") continue;
    const cost = toKop(op.amount);
    const kop =
      accumulatedDepreciation(cost, op.date, to) -
      accumulatedDepreciation(cost, op.date, dayBefore(from));
    if (kop <= 0) continue;
    core.depreciation += kop;
    expenses.add("depreciation", "Амортизация", kop, {
      ...opDoc(ctx, op, kop),
      kind: "calc",
      label: `${articleTitle(ctx, op, "Имущество")} — покупка от ${fmtDate(op.date)}`,
    });
  }

  core.netProfit =
    core.revenue + core.otherIncome - core.cogs - core.operatingExpenses - core.otherExpenses - core.depreciation;

  const incomeTotal = income.totalKop();
  const expenseTotal = expenses.totalKop();

  // Отгрузки периода без списаний — себестоимость не подтверждена складом.
  const shippedWithoutCost = data.orders
    .filter((o) => shippedInPeriod.has(o.id) && !ordersWithWriteoffs.has(o.id))
    .map((o) => ({
      orderId: o.id,
      orderNumber: o.orderNumber,
      shippedAt: o.shippedAt,
      salePrice: rub(toKop(o.salePrice)),
    }))
    .sort((a, b) => a.orderNumber - b.orderNumber);

  const grossProfit = core.revenue - core.cogs;

  return {
    period: { from, to },
    kpis: {
      income: rub(incomeTotal),
      expenses: rub(expenseTotal),
      cogs: rub(core.cogs),
      grossProfit: rub(grossProfit),
      netProfit: rub(core.netProfit),
      margin: incomeTotal > 0 ? Math.round((core.netProfit / incomeTotal) * 1000) / 10 : null,
    },
    sections: [
      { key: "income", title: "Доходы", total: rub(incomeTotal), groups: income.build(incomeTotal) },
      { key: "expenses", title: "Расходы", total: rub(expenseTotal), groups: expenses.build(expenseTotal) },
    ] as ReportSection[],
    result: { title: "Прибыль", amount: rub(core.netProfit) },
    rows: [
      { key: "revenue", title: "Выручка", amount: rub(core.revenue), level: 0 },
      { key: "cogs", title: "Себестоимость продаж", amount: rub(-core.cogs), level: 0 },
      { key: "gross", title: "Валовая прибыль", amount: rub(grossProfit), level: 0, total: true },
      { key: "opex", title: "Операционные расходы", amount: rub(-core.operatingExpenses), level: 0 },
      { key: "depreciation", title: "Амортизация", amount: rub(-core.depreciation), level: 1 },
      { key: "otherIncome", title: "Прочие доходы", amount: rub(core.otherIncome), level: 0 },
      { key: "otherExpenses", title: "Прочие расходы", amount: rub(-core.otherExpenses), level: 0 },
      { key: "net", title: "Чистая прибыль", amount: rub(core.netProfit), level: 0, total: true },
    ],
    costQuality: {
      preliminary: shippedWithoutCost.length > 0,
      shippedWithoutCost,
    },
    _core: core,
  };
}

// ---------- ДДС ----------

const INCOME_GROUP_TITLES: Record<string, string> = {
  "Оплата от покупателя": "Оплата от покупателей",
  "Возврат от поставщика": "Возвраты от поставщиков",
  "Взнос собственника": "Взносы собственника",
  "Получение займа": "Получение займов",
  "Прочее поступление": "Прочие поступления",
};

const EXPENSE_GROUP_TITLES: Record<string, string> = {
  "Оплата поставщику": "Оплата поставщикам",
  "Операционные расходы": "Без статьи",
  "Зарплата сотрудникам": "Зарплата",
  "Покупка имущества": "Покупка имущества",
  "Возврат покупателю": "Возвраты покупателям",
  "Возврат займа": "Возврат займов",
  "Выплата дивидендов": "Выплата дивидендов",
  "Прочие расходы": "Прочие расходы",
};

/** Движение денег по кассе для одной операции (для отчёта по кассам). */
function cashDeltaForBox(op: FinOperation, boxId: string): { in: number; out: number; tIn: number; tOut: number } {
  const kop = toKop(op.amount);
  const r = { in: 0, out: 0, tIn: 0, tOut: 0 };
  if (op.type === "transfer") {
    if (op.toCashboxId === boxId) r.tIn = kop;
    if (op.fromCashboxId === boxId) r.tOut = kop;
  } else if (op.cashboxId === boxId) {
    if (cashSign(op) > 0) r.in = kop;
    else if (cashSign(op) < 0) r.out = kop;
  }
  return r;
}

export function calculateCashFlow(
  data: FinData,
  from: string,
  to: string,
  opts: { cashboxId?: string | null } = {}
) {
  const ctx = makeCtx(data);
  const boxFilter = opts.cashboxId || null;
  const boxes = boxFilter ? data.cashboxes.filter((c) => c.id === boxFilter) : data.cashboxes;
  const boxIds = new Set(boxes.map((b) => b.id));

  // Остатки и движения по каждой кассе.
  const perBox = boxes.map((b) => {
    let opening = toKop(b.openingBalance);
    let inflow = 0;
    let outflow = 0;
    let transferIn = 0;
    let transferOut = 0;
    for (const op of data.operations) {
      const d = cashDeltaForBox(op, b.id);
      if (op.date < from) {
        opening += d.in - d.out + d.tIn - d.tOut;
      } else if (op.date <= to) {
        inflow += d.in;
        outflow += d.out;
        transferIn += d.tIn;
        transferOut += d.tOut;
      }
    }
    const closing = opening + inflow - outflow + transferIn - transferOut;
    return { id: b.id, name: b.name, opening, inflow, outflow, transferIn, transferOut, closing };
  });

  const inflows = new GroupBuilder();
  const outflows = new GroupBuilder();
  let transfersBetween = 0;

  for (const op of data.operations) {
    if (!inRange(op.date, from, to)) continue;
    const kop = toKop(op.amount);
    const t = ctx.opType.get(op.id)!;

    if (op.type === "transfer") {
      const fromIn = !!op.fromCashboxId && boxIds.has(op.fromCashboxId);
      const toIn = !!op.toCashboxId && boxIds.has(op.toCashboxId);
      if (fromIn && toIn) {
        transfersBetween += kop;
      } else if (toIn) {
        const src = op.fromCashboxId ? ctx.cashboxes.get(op.fromCashboxId)?.name : null;
        inflows.add("transfer-in", "Перемещение из других касс", kop, {
          ...opDoc(ctx, op, kop),
          counterparty: src ?? null,
        });
      } else if (fromIn) {
        const dst = op.toCashboxId ? ctx.cashboxes.get(op.toCashboxId)?.name : null;
        outflows.add("transfer-out", "Перемещение в другие кассы", kop, {
          ...opDoc(ctx, op, kop),
          counterparty: dst ?? null,
        });
      }
      continue;
    }
    if (!op.cashboxId || !boxIds.has(op.cashboxId)) continue;

    const doc = opDoc(ctx, op, kop);
    if (op.type === "income") {
      if (t === "Оплата от покупателя") {
        const dealer = op.dealerId ? ctx.dealers.get(op.dealerId) : undefined;
        inflows.addNested(
          `op:${t}`,
          INCOME_GROUP_TITLES[t],
          op.dealerId ?? "no-dealer",
          dealer?.name ?? "Без покупателя",
          kop,
          doc,
          true
        );
      } else if (op.expenseTypeId) {
        inflows.add(`article:${op.expenseTypeId}`, articleTitle(ctx, op, t), kop, doc);
      } else {
        inflows.add(`op:${t}`, INCOME_GROUP_TITLES[t] ?? t, kop, doc);
      }
    } else {
      if (t === "Оплата поставщику") {
        const supplier = op.supplierId ? ctx.suppliers.get(op.supplierId) : undefined;
        outflows.addNested(
          `op:${t}`,
          EXPENSE_GROUP_TITLES[t],
          op.supplierId ?? "no-supplier",
          supplier?.name ?? "Без поставщика",
          kop,
          doc,
          true
        );
      } else if (op.expenseTypeId) {
        outflows.add(`article:${op.expenseTypeId}`, articleTitle(ctx, op, t), kop, doc);
      } else {
        outflows.add(`op:${t}`, EXPENSE_GROUP_TITLES[t] ?? t, kop, doc);
      }
    }
  }

  const sum = (f: (b: (typeof perBox)[number]) => number) => perBox.reduce((s, b) => s + f(b), 0);
  const opening = sum((b) => b.opening);
  const closing = sum((b) => b.closing);
  const inflowTotal = inflows.totalKop();
  const outflowTotal = outflows.totalKop();

  return {
    period: { from, to },
    cashboxId: boxFilter,
    kpis: {
      opening: rub(opening),
      inflow: rub(inflowTotal),
      outflow: rub(outflowTotal),
      net: rub(inflowTotal - outflowTotal),
      closing: rub(closing),
    },
    sections: [
      { key: "inflow", title: "Поступления", total: rub(inflowTotal), groups: inflows.build(inflowTotal) },
      { key: "outflow", title: "Выплаты", total: rub(outflowTotal), groups: outflows.build(outflowTotal) },
    ] as ReportSection[],
    result: { title: "Разница за период", amount: rub(inflowTotal - outflowTotal) },
    notes: {
      transfersBetween: rub(transfersBetween),
    },
    cashboxes: perBox.map((b) => ({
      id: b.id,
      name: b.name,
      opening: rub(b.opening),
      inflow: rub(b.inflow),
      outflow: rub(b.outflow),
      transferIn: rub(b.transferIn),
      transferOut: rub(b.transferOut),
      closing: rub(b.closing),
    })),
  };
}

// ---------- Взаиморасчёты ----------

export interface Settlement {
  id: string;
  name: string;
  charged: number; // копейки: начислено (долг растёт)
  paid: number; // копейки: оплачено (долг уменьшается)
  balance: number; // charged − paid
}

const NO_DEALER = "no-dealer";

/** Расчёты с дилерами на дату: долг > 0 — дилер должен нам, < 0 — аванс от дилера. */
export function dealerSettlements(data: FinData, asOf: string, ctx = makeCtx(data)) {
  const map = new Map<string, Settlement>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      const d = ctx.dealers.get(id);
      s = { id, name: d?.name ?? "Без дилера", charged: 0, paid: 0, balance: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const d of data.dealers) {
    const open = toKop(d.openingBalance);
    if (open > 0) get(d.id).charged += open;
    else if (open < 0) get(d.id).paid += -open;
  }
  for (const o of data.orders) {
    if (!isShipped(o) || o.shippedAt! > asOf) continue;
    // Заказ без дилера тоже даёт выручку — его долг копится в строке «Без дилера».
    get(o.dealerId ?? NO_DEALER).charged += toKop(o.salePrice);
  }
  for (const op of data.operations) {
    if (!op.dealerId || op.date > asOf) continue;
    const t = ctx.opType.get(op.id);
    if (t === "Оплата от покупателя") get(op.dealerId).paid += toKop(op.amount);
    else if (t === "Возврат покупателю") get(op.dealerId).charged += toKop(op.amount);
  }
  map.forEach((s) => (s.balance = s.charged - s.paid));
  return Array.from(map.values());
}

/** Расчёты с поставщиками на дату: > 0 — мы должны, < 0 — аванс поставщику. */
export function supplierSettlements(data: FinData, asOf: string, ctx = makeCtx(data)) {
  const map = new Map<string, Settlement>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) {
      const sup = ctx.suppliers.get(id);
      s = { id, name: sup?.name ?? "Без поставщика", charged: 0, paid: 0, balance: 0 };
      map.set(id, s);
    }
    return s;
  };
  for (const sup of data.suppliers) {
    const open = toKop(sup.openingBalance);
    if (open > 0) get(sup.id).charged += open;
    else if (open < 0) get(sup.id).paid += -open;
  }
  for (const r of data.receipts) {
    if (!r.supplierId || r.date > asOf) continue;
    get(r.supplierId).charged += toKop(r.total);
  }
  for (const op of data.operations) {
    if (!op.supplierId || op.date > asOf) continue;
    const t = ctx.opType.get(op.id);
    if (t === "Оплата поставщику") get(op.supplierId).paid += toKop(op.amount);
    else if (t === "Возврат от поставщика") get(op.supplierId).charged += toKop(op.amount);
  }
  map.forEach((s) => (s.balance = s.charged - s.paid));
  return Array.from(map.values());
}

// ---------- Баланс ----------

export interface BalanceRow {
  key: string;
  title: string;
  amount: number;
  level: number;
  kind: "section" | "line" | "total";
  details?: { id: string; title: string; amount: number }[];
}

export function calculateBalance(data: FinData, asOf: string) {
  const ctx = makeCtx(data);

  // Денежные средства по кассам.
  const cashDetails = data.cashboxes.map((b) => {
    let kop = toKop(b.openingBalance);
    for (const op of data.operations) {
      if (op.date > asOf) continue;
      const d = cashDeltaForBox(op, b.id);
      kop += d.in - d.out + d.tIn - d.tOut;
    }
    return { id: b.id, title: b.name, kop };
  });
  const cash = cashDetails.reduce((s, d) => s + d.kop, 0);

  // Взаиморасчёты.
  const dealers = dealerSettlements(data, asOf, ctx);
  const suppliers = supplierSettlements(data, asOf, ctx);
  const receivables = dealers.filter((d) => d.balance > 0);
  const customerAdvances = dealers.filter((d) => d.balance < 0);
  const payables = suppliers.filter((s) => s.balance > 0);
  const supplierAdvances = suppliers.filter((s) => s.balance < 0);
  const sumBal = (arr: Settlement[]) => arr.reduce((s, x) => s + x.balance, 0);

  // Платежи без контрагента у операций, которые его требуют.
  let unallocated = 0; // > 0 — обязательство (получили деньги, не знаем от кого)
  for (const op of data.operations) {
    if (op.date > asOf) continue;
    const t = ctx.opType.get(op.id);
    const kop = toKop(op.amount);
    if ((t === "Оплата от покупателя" || t === "Возврат покупателю") && !op.dealerId) {
      unallocated += t === "Оплата от покупателя" ? kop : -kop;
    }
    if ((t === "Оплата поставщику" || t === "Возврат от поставщика") && !op.supplierId) {
      unallocated += t === "Возврат от поставщика" ? kop : -kop;
    }
  }

  // Склад: стоимость приходов минус стоимость списаний на дату.
  let inventory = 0;
  let stockAdjustments = 0; // оприходования без поставщика − списания без заказа
  for (const r of data.receipts) {
    if (r.date > asOf) continue;
    const kop = toKop(r.total);
    inventory += kop;
    if (!r.supplierId) stockAdjustments += kop;
  }
  // Материалы, списанные в заказы, которые ещё не отгружены, — незавершённое производство.
  let wip = 0;
  for (const w of data.writeoffs) {
    if (w.date > asOf) continue;
    const kop = toKop(w.total);
    inventory -= kop;
    if (!w.orderId) {
      stockAdjustments -= kop;
      continue;
    }
    const order = ctx.orders.get(w.orderId);
    const shippedBy = order && isShipped(order) && order.shippedAt! <= asOf;
    if (!shippedBy) wip += kop;
  }

  // Имущество: стоимость покупки минус накопленная амортизация.
  let property = 0;
  let loans = 0;
  let ownerContributions = 0;
  let dividends = 0;
  for (const op of data.operations) {
    if (op.date > asOf) continue;
    const t = ctx.opType.get(op.id);
    const kop = toKop(op.amount);
    if (t === "Покупка имущества") property += kop - accumulatedDepreciation(kop, op.date, asOf);
    else if (t === "Получение займа") loans += kop;
    else if (t === "Возврат займа") loans -= kop;
    else if (t === "Взнос собственника") ownerContributions += kop;
    else if (t === "Выплата дивидендов") dividends += kop;
  }

  // Начальные остатки из справочников.
  const openingEquity =
    data.cashboxes.reduce((s, c) => s + toKop(c.openingBalance), 0) +
    data.dealers.reduce((s, d) => s + toKop(d.openingBalance), 0) -
    data.suppliers.reduce((s, x) => s + toKop(x.openingBalance), 0);

  const retained = calculateProfitAndLoss(data, MIN_DATE, asOf)._core.netProfit;

  const receivablesKop = sumBal(receivables);
  const supplierAdvKop = -sumBal(supplierAdvances);
  const payablesKop = sumBal(payables);
  const customerAdvKop = -sumBal(customerAdvances);
  const unallocatedAsset = unallocated < 0 ? -unallocated : 0;
  const unallocatedLiability = unallocated > 0 ? unallocated : 0;

  const assets = cash + receivablesKop + supplierAdvKop + inventory + wip + property + unallocatedAsset;
  const liabilities = payablesKop + customerAdvKop + loans + unallocatedLiability;
  const equity = openingEquity + stockAdjustments + ownerContributions - dividends + retained;

  const settleDetails = (arr: Settlement[], sign: 1 | -1) =>
    arr
      .map((s) => ({ id: s.id, title: s.name, amount: rub(sign * s.balance) }))
      .sort((a, b) => b.amount - a.amount);

  const line = (
    key: string,
    title: string,
    kop: number,
    level = 1,
    details?: BalanceRow["details"]
  ): BalanceRow => ({ key, title, amount: rub(kop), level, kind: "line", details });

  const rows: BalanceRow[] = [
    { key: "assets", title: "АКТИВЫ", amount: rub(assets), level: 0, kind: "section" },
    line(
      "cash",
      "Денежные средства",
      cash,
      1,
      cashDetails.map((d) => ({ id: d.id, title: d.title, amount: rub(d.kop) }))
    ),
    line("receivables", "Дебиторская задолженность покупателей", receivablesKop, 1, settleDetails(receivables, 1)),
    line("supplierAdvances", "Авансы поставщикам", supplierAdvKop, 1, settleDetails(supplierAdvances, -1)),
    line("inventory", "Запасы на складе", inventory),
    line("wip", "Материалы в незавершённых заказах", wip),
    line("property", "Имущество", property),
    ...(unallocatedAsset ? [line("unallocatedAsset", "Выплаты без контрагента", unallocatedAsset)] : []),
    { key: "liabilities", title: "ОБЯЗАТЕЛЬСТВА", amount: rub(liabilities), level: 0, kind: "section" },
    line("payables", "Задолженность поставщикам", payablesKop, 1, settleDetails(payables, 1)),
    line("customerAdvances", "Авансы покупателей", customerAdvKop, 1, settleDetails(customerAdvances, -1)),
    line("loans", "Займы", loans),
    ...(unallocatedLiability
      ? [line("unallocatedLiability", "Поступления без контрагента", unallocatedLiability)]
      : []),
    { key: "equity", title: "КАПИТАЛ", amount: rub(equity), level: 0, kind: "section" },
    line("openingEquity", "Начальные остатки", openingEquity),
    line("stockAdjustments", "Корректировки остатков склада", stockAdjustments),
    line("ownerContributions", "Взносы собственника", ownerContributions),
    line("dividends", "Выплаченные дивиденды", -dividends),
    line("retained", "Нераспределённая прибыль", retained),
  ];

  return {
    asOf,
    kpis: {
      assets: rub(assets),
      liabilities: rub(liabilities),
      equity: rub(equity),
      difference: rub(assets - liabilities - equity),
    },
    rows,
  };
}

export { MIN_DATE, MAX_DATE };
