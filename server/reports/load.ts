// Выгрузка данных пользователя для управленческих отчётов (server/reports/financial.ts).
// Один проход по 8 таблицам с фильтром по userId — без N+1 запросов.

import { and, eq } from "drizzle-orm";
import { db } from "../db";
import {
  cashboxes,
  dealers,
  expenseTypes,
  financeOperations,
  orders,
  suppliers,
  warehouseReceipts,
  warehouseWriteoffs,
} from "@shared/schema";
import type { FinData } from "./financial";

export async function loadFinData(userId: string): Promise<FinData> {
  const [
    orderRows,
    opRows,
    dealerRows,
    supplierRows,
    cashboxRows,
    expenseTypeRows,
    receiptRows,
    writeoffRows,
  ] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        dealerId: orders.dealerId,
        status: orders.status,
        shippedAt: orders.shippedAt,
        salePrice: orders.salePrice,
      })
      .from(orders)
      .where(eq(orders.userId, userId)),
    db
      .select({
        id: financeOperations.id,
        type: financeOperations.type,
        operationType: financeOperations.operationType,
        amount: financeOperations.amount,
        date: financeOperations.date,
        cashboxId: financeOperations.cashboxId,
        fromCashboxId: financeOperations.fromCashboxId,
        toCashboxId: financeOperations.toCashboxId,
        dealerId: financeOperations.dealerId,
        supplierId: financeOperations.supplierId,
        expenseTypeId: financeOperations.expenseTypeId,
        comment: financeOperations.comment,
      })
      .from(financeOperations)
      .where(and(eq(financeOperations.userId, userId), eq(financeOperations.isDraft, false))),
    db
      .select({ id: dealers.id, name: dealers.fullName, openingBalance: dealers.openingBalance })
      .from(dealers)
      .where(eq(dealers.userId, userId)),
    db
      .select({ id: suppliers.id, name: suppliers.name, openingBalance: suppliers.openingBalance })
      .from(suppliers)
      .where(eq(suppliers.userId, userId)),
    db
      .select({ id: cashboxes.id, name: cashboxes.name, openingBalance: cashboxes.openingBalance })
      .from(cashboxes)
      .where(eq(cashboxes.userId, userId)),
    db
      .select({
        id: expenseTypes.id,
        name: expenseTypes.name,
        direction: expenseTypes.direction,
        operationType: expenseTypes.operationType,
      })
      .from(expenseTypes)
      .where(eq(expenseTypes.userId, userId)),
    db
      .select({
        id: warehouseReceipts.id,
        date: warehouseReceipts.date,
        supplierId: warehouseReceipts.supplierId,
        total: warehouseReceipts.total,
      })
      .from(warehouseReceipts)
      .where(eq(warehouseReceipts.userId, userId)),
    db
      .select({
        id: warehouseWriteoffs.id,
        orderId: warehouseWriteoffs.orderId,
        date: warehouseWriteoffs.date,
        total: warehouseWriteoffs.total,
      })
      .from(warehouseWriteoffs)
      .where(eq(warehouseWriteoffs.userId, userId)),
  ]);

  return {
    orders: orderRows,
    operations: opRows,
    dealers: dealerRows,
    suppliers: supplierRows,
    cashboxes: cashboxRows,
    expenseTypes: expenseTypeRows,
    receipts: receiptRows,
    writeoffs: writeoffRows,
  };
}
