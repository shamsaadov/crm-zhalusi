// Тесты управленческой отчётности (ОПиУ, ДДС, Баланс).
//
// Run with: npx tsx --test server/__tests__/financial-reports.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculateOrderPayments,
  calculateBalance,
  calculateCashFlow,
  calculateProfitAndLoss,
  resolveOperationType,
  type FinData,
  type FinOperation,
} from "../reports/financial";
import {
  EXPENSE_OPERATION_TYPES,
  INCOME_OPERATION_TYPES,
} from "@shared/schema";

let seq = 0;
const id = (p: string) => `${p}-${++seq}`;

function op(partial: Partial<FinOperation> & Pick<FinOperation, "type" | "amount" | "date">): FinOperation {
  return {
    id: id("op"),
    operationType: null,
    cashboxId: "cash",
    fromCashboxId: null,
    toCashboxId: null,
    dealerId: null,
    supplierId: null,
    expenseTypeId: null,
    comment: null,
    ...partial,
  };
}

function baseData(): FinData {
  return {
    orders: [],
    operations: [],
    dealers: [
      { id: "d1", name: "ООО ОкнаПлюс", openingBalance: "1000" },
      { id: "d2", name: "ИП Кузнецова", openingBalance: "0" },
    ],
    suppliers: [{ id: "s1", name: "Ткани Опт", openingBalance: "500" }],
    cashboxes: [
      { id: "cash", name: "Наличные", openingBalance: "10000" },
      { id: "bank", name: "Расчётный счёт", openingBalance: "0" },
    ],
    expenseTypes: [
      { id: "rent", name: "Аренда", direction: "expense", operationType: null },
      { id: "salary", name: "Зарплата цеха", direction: "expense", operationType: "Зарплата сотрудникам" },
      { id: "car", name: "Автомобиль", direction: "expense", operationType: "Покупка имущества" },
      { id: "interest", name: "Проценты по вкладу", direction: "income", operationType: "Прочее поступление" },
    ],
    receipts: [],
    writeoffs: [],
  };
}

/** Типичный месяц: закупка, производство, отгрузка, оплаты, расходы. */
function scenario(): FinData {
  const d = baseData();
  d.receipts.push({ id: "r1", date: "2026-09-01", supplierId: "s1", total: "6000" });
  d.receipts.push({ id: "r2", date: "2026-09-02", supplierId: null, total: "300" }); // оприходование
  d.orders.push(
    { id: "o1", orderNumber: 1, dealerId: "d1", status: "Отгружен", shippedAt: "2026-09-10", salePrice: "5000" },
    { id: "o2", orderNumber: 2, dealerId: "d2", status: "Готов", shippedAt: null, salePrice: "3000" },
    { id: "o3", orderNumber: 3, dealerId: "d2", status: "Отгружен", shippedAt: "2026-10-05", salePrice: "2000" }
  );
  d.writeoffs.push(
    { id: "w1", orderId: "o1", date: "2026-09-08", total: "1800" },
    { id: "w2", orderId: "o2", date: "2026-09-20", total: "1100" },
    { id: "w3", orderId: null, date: "2026-09-25", total: "50" } // недостача
  );
  d.operations.push(
    op({ type: "income", amount: "4000", date: "2026-09-12", dealerId: "d1" }),
    op({ type: "income", amount: "3500", date: "2026-09-15", dealerId: "d2", cashboxId: "bank" }), // аванс
    op({ type: "supplier_payment", amount: "5000", date: "2026-09-16", supplierId: "s1" }),
    op({ type: "expense", amount: "1200", date: "2026-09-30", expenseTypeId: "rent" }),
    op({ type: "expense", amount: "900", date: "2026-09-30", expenseTypeId: "salary" }),
    op({ type: "expense", amount: "6000", date: "2026-09-03", expenseTypeId: "car" }),
    op({ type: "income", amount: "70", date: "2026-09-30", expenseTypeId: "interest", cashboxId: "bank" }),
    op({ type: "transfer", amount: "1000", date: "2026-09-20", cashboxId: null, fromCashboxId: "cash", toCashboxId: "bank" }),
    op({ type: "income", amount: "2000", date: "2026-09-05", operationType: "Взнос собственника" }),
    op({ type: "income", amount: "3000", date: "2026-09-06", operationType: "Получение займа", cashboxId: "bank" }),
    op({ type: "expense", amount: "400", date: "2026-09-28", operationType: "Выплата дивидендов" })
  );
  return d;
}

test("вид операции выводится из типа, дилера и статьи", () => {
  const d = baseData();
  const byId = new Map(d.expenseTypes.map((e) => [e.id, e]));
  assert.equal(resolveOperationType(op({ type: "income", amount: 1, date: "2026-01-01", dealerId: "d1" }), byId), "Оплата от покупателя");
  assert.equal(resolveOperationType(op({ type: "income", amount: 1, date: "2026-01-01" }), byId), "Прочее поступление");
  assert.equal(resolveOperationType(op({ type: "expense", amount: 1, date: "2026-01-01", expenseTypeId: "rent" }), byId), "Операционные расходы");
  assert.equal(resolveOperationType(op({ type: "expense", amount: 1, date: "2026-01-01", expenseTypeId: "salary" }), byId), "Зарплата сотрудникам");
  assert.equal(resolveOperationType(op({ type: "supplier_payment", amount: 1, date: "2026-01-01" }), byId), "Оплата поставщику");
  assert.equal(
    resolveOperationType(op({ type: "expense", amount: 1, date: "2026-01-01", expenseTypeId: "rent", operationType: "Прочие расходы" }), byId),
    "Прочие расходы",
    "явный вид операции важнее статьи"
  );
});

test("ОПиУ: выручка по отгрузке, себестоимость по списаниям, расходы по виду операции", () => {
  const r = calculateProfitAndLoss(scenario(), "2026-09-01", "2026-09-30");
  assert.equal(r._core.revenue, 500000, "в сентябре отгружен только заказ №1");
  assert.equal(r._core.cogs, 180000, "себестоимость — списания по отгруженному заказу");
  assert.equal(r._core.operatingExpenses, 210000, "аренда 1200 + зарплата 900");
  assert.equal(r._core.otherIncome, 7000);
  // Автомобиль куплен 03.09 — амортизация начинается с октября.
  assert.equal(r._core.depreciation, 0);
  assert.equal(r.kpis.netProfit, 5000 - 1800 - 1200 - 900 + 70);
  assert.equal(r.kpis.grossProfit, 3200);
  // Выплата дивидендов, займ, взнос, оплата поставщику в ОПиУ не попадают.
  const titles = r.sections.flatMap((s) => s.groups.map((g) => g.title));
  assert.ok(!titles.some((t) => /дивиденд|займ|взнос|поставщик/i.test(t)), titles.join(", "));
  // Продажи и себестоимость закреплены сверху секций.
  assert.equal(r.sections[0].groups[0].title, "Продажи");
  assert.equal(r.sections[1].groups[0].title, "Себестоимость проданного");
});

test("ОПиУ: амортизация линейно 60 месяцев с месяца после покупки", () => {
  const r = calculateProfitAndLoss(scenario(), "2026-10-01", "2026-10-31");
  assert.equal(r._core.depreciation, 10000, "6000 / 60 = 100 ₽ в месяц");
  assert.equal(r._core.revenue, 200000);
  assert.equal(r.costQuality.preliminary, true, "заказ №3 отгружен без списаний");
  assert.deepEqual(r.costQuality.shippedWithoutCost.map((o) => o.orderNumber), [3]);
});

test("ДДС: поступления, выплаты, остатки, перемещения не входят в итог", () => {
  const r = calculateCashFlow(scenario(), "2026-09-01", "2026-09-30");
  assert.equal(r.kpis.opening, 10000);
  assert.equal(r.kpis.inflow, 4000 + 3500 + 70 + 2000 + 3000);
  assert.equal(r.kpis.outflow, 5000 + 1200 + 900 + 6000 + 400);
  assert.equal(r.kpis.closing, r.kpis.opening + r.kpis.net);
  assert.equal(r.notes.transfersBetween, 1000);
  const cash = r.cashboxes.find((c) => c.id === "cash")!;
  assert.equal(cash.transferOut, 1000);
  assert.equal(cash.closing, 10000 + 4000 + 2000 - 5000 - 1200 - 900 - 6000 - 400 - 1000);
});

test("ДДС по одной кассе: перемещения становятся поступлением/выплатой", () => {
  const r = calculateCashFlow(scenario(), "2026-09-01", "2026-09-30", { cashboxId: "bank" });
  assert.equal(r.kpis.opening, 0);
  assert.equal(r.kpis.inflow, 3500 + 70 + 3000 + 1000);
  assert.equal(r.kpis.closing, 3500 + 70 + 3000 + 1000);
  assert.equal(r.notes.transfersBetween, 0);
});

test("Баланс сходится и раскладывает долги по сторонам", () => {
  const b = calculateBalance(scenario(), "2026-09-30");
  assert.equal(b.kpis.difference, 0);
  const row = (k: string) => b.rows.find((r) => r.key === k)!.amount;
  // ОкнаПлюс: 1000 начальный + 5000 отгрузка − 4000 оплата = 2000 долг.
  assert.equal(row("receivables"), 2000);
  // Кузнецова: заплатила 3500, ничего не отгружено к 30.09 — аванс.
  assert.equal(row("customerAdvances"), 3500);
  // Поставщик: 500 + 6000 − 5000 = 1500.
  assert.equal(row("payables"), 1500);
  // Склад: 6000 + 300 − 1800 − 1100 − 50.
  assert.equal(row("inventory"), 3350);
  assert.equal(row("wip"), 1100, "материалы заказа №2, который ещё не отгружен");
  assert.equal(row("property"), 6000);
  assert.equal(row("loans"), 3000);
  assert.equal(row("stockAdjustments"), 250);
  assert.equal(row("dividends"), -400);
});

test("Баланс сходится на каждую дату сценария", () => {
  const d = scenario();
  for (const asOf of ["2026-08-31", "2026-09-01", "2026-09-10", "2026-09-30", "2026-10-05", "2027-12-31", "2032-01-01"]) {
    assert.equal(calculateBalance(d, asOf).kpis.difference, 0, asOf);
  }
});

test("Баланс сходится на случайных данных (500 прогонов)", () => {
  let rnd = 42;
  const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const money = () => (Math.floor(rand() * 1_000_000) / 100).toFixed(2);
  const day = () => {
    const m = 1 + Math.floor(rand() * 12);
    const dd = 1 + Math.floor(rand() * 28);
    return `2026-${String(m).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  };

  for (let run = 0; run < 500; run++) {
    const d = baseData();
    d.dealers[0].openingBalance = (rand() * 2000 - 1000).toFixed(2);
    d.suppliers[0].openingBalance = (rand() * 2000 - 1000).toFixed(2);
    for (let i = 0; i < 8; i++) {
      const shipped = rand() < 0.6;
      const oid = id("o");
      d.orders.push({
        id: oid,
        orderNumber: i + 1,
        dealerId: rand() < 0.9 ? pick(["d1", "d2"]) : null,
        status: shipped ? "Отгружен" : pick(["Новый", "Готов", "В производстве"]),
        shippedAt: shipped ? day() : null,
        salePrice: money(),
      });
      if (rand() < 0.7) d.writeoffs.push({ id: id("w"), orderId: oid, date: day(), total: money() });
    }
    for (let i = 0; i < 4; i++) {
      d.receipts.push({ id: id("r"), date: day(), supplierId: rand() < 0.8 ? "s1" : null, total: money() });
      if (rand() < 0.3) d.writeoffs.push({ id: id("w"), orderId: null, date: day(), total: money() });
    }
    for (let i = 0; i < 25; i++) {
      const kind = pick(["income", "expense", "supplier_payment", "transfer"] as const);
      const o = op({ type: kind, amount: money(), date: day(), cashboxId: pick(["cash", "bank"]) });
      if (kind === "transfer") {
        o.cashboxId = null;
        o.fromCashboxId = "cash";
        o.toCashboxId = "bank";
      } else if (kind === "income") {
        o.operationType = rand() < 0.5 ? pick(INCOME_OPERATION_TYPES) : null;
        if (rand() < 0.6) o.dealerId = pick(["d1", "d2"]);
        if (rand() < 0.3) o.supplierId = "s1";
        if (rand() < 0.3) o.expenseTypeId = "interest";
      } else if (kind === "expense") {
        o.operationType = rand() < 0.6 ? pick(EXPENSE_OPERATION_TYPES) : null;
        if (rand() < 0.4) o.expenseTypeId = pick(["rent", "salary", "car"]);
        if (rand() < 0.3) o.dealerId = pick(["d1", "d2"]);
        if (rand() < 0.3) o.supplierId = "s1";
      } else if (rand() < 0.8) {
        o.supplierId = "s1";
      }
      d.operations.push(o);
    }
    for (const asOf of [day(), day(), "2026-12-31", "2031-06-30"]) {
      const b = calculateBalance(d, asOf);
      assert.equal(b.kpis.difference, 0, `run ${run}, asOf ${asOf}: ${JSON.stringify(b.kpis)}`);
    }
    // ДДС: остаток на конец = остаток на начало + разница (+ перемещения взаимно гасятся).
    const cf = calculateCashFlow(d, "2026-03-01", "2026-08-31");
    assert.equal(Math.round((cf.kpis.opening + cf.kpis.net - cf.kpis.closing) * 100) || 0, 0, `run ${run} cash flow`);
    // Остаток кассы в ДДС совпадает со строкой баланса.
    const bal = calculateBalance(d, "2026-08-31");
    assert.equal(cf.kpis.closing, bal.rows.find((r) => r.key === "cash")!.amount, `run ${run} cash vs balance`);
  }
});

test("Розничный заказ без дилера: выручка один раз, долг закрыт оплатой", () => {
  const d = baseData();
  d.orders.push({ id: "retail", orderNumber: 77, dealerId: null, status: "Отгружен", shippedAt: "2026-10-10", salePrice: "10000" });
  // Так оплату создаёт сам заказ (orders.ts): без дилера, с видом «Оплата от покупателя».
  d.operations.push(
    op({ type: "income", amount: "10000", date: "2026-10-01", operationType: "Оплата от покупателя", comment: "Оплата заказа №77" })
  );
  const pnl = calculateProfitAndLoss(d, "2026-10-01", "2026-10-31");
  assert.equal(pnl._core.revenue, 1000000);
  assert.equal(pnl._core.otherIncome, 0, "оплата заказа не прочий доход");
  const before = calculateBalance(d, "2026-10-05");
  assert.equal(before.rows.find((r) => r.key === "customerAdvances")!.amount, 10000, "до отгрузки — аванс розницы");
  const after = calculateBalance(d, "2026-10-31");
  const retail = (key: string) =>
    after.rows.find((r) => r.key === key)!.details?.find((x) => x.id === "no-dealer")?.amount ?? 0;
  assert.equal(retail("receivables"), 0, "розница рассчиталась");
  assert.equal(retail("customerAdvances"), 0);
  assert.equal(after.rows.find((r) => r.key === "receivables")!.amount, 1000, "остался только начальный долг ОкнаПлюс");
  assert.equal(after.kpis.difference, 0);
});

test("Оплата заказов: оплаты дилера закрывают заказы от старых к новым", () => {
  const d = baseData(); // у d1 начальный долг 1000
  d.orders.push(
    { id: "a", orderNumber: 1, dealerId: "d1", status: "Отгружен", shippedAt: "2026-10-02", salePrice: "3000", date: "2026-10-01" },
    { id: "b", orderNumber: 2, dealerId: "d1", status: "Новый", shippedAt: null, salePrice: "5000", date: "2026-10-05" },
    { id: "c", orderNumber: 3, dealerId: "d1", status: "Новый", shippedAt: null, salePrice: "2000", date: "2026-10-09" },
    { id: "r", orderNumber: 9, dealerId: null, status: "Новый", shippedAt: null, salePrice: "800", date: "2026-10-09" }
  );
  d.operations.push(
    op({ type: "income", amount: "6000", date: "2026-10-10", dealerId: "d1" }),
    op({ type: "income", amount: "500", date: "2026-10-10", operationType: "Оплата от покупателя", comment: "Оплата заказа №9" })
  );
  const p = calculateOrderPayments(d);
  // 6000 − 1000 начального долга = 5000: заказ №1 целиком, №2 на 2000.
  assert.deepEqual(p.get("a"), { paid: 3000, total: 3000, state: "full" });
  assert.deepEqual(p.get("b"), { paid: 2000, total: 5000, state: "partial" });
  assert.deepEqual(p.get("c"), { paid: 0, total: 2000, state: "none" });
  assert.deepEqual(p.get("r"), { paid: 500, total: 800, state: "partial" });
});
