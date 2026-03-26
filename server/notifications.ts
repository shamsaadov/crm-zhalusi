import { storage } from "./storage";
import { db } from "./db";
import { notifications, orders, users } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";

export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  try {
    await storage.createNotification({
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
    });
  } catch (error) {
    console.error("Notification error:", error);
  }
}

async function hasDuplicateNotification(
  userId: string,
  type: string,
  entityId: string
): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.type, type),
        eq(notifications.entityId, entityId),
        gte(notifications.createdAt, oneDayAgo)
      )
    );
  return Number(result[0]?.count || 0) > 0;
}

export async function generatePeriodicNotifications(): Promise<void> {
  try {
    const allUsers = await db.select().from(users);

    for (const user of allUsers) {
      // 1. Overdue orders (status "Новый" or "В производстве" older than 14 days)
      const allOrders = await storage.getOrders(user.id);
      const now = new Date();
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      for (const order of allOrders) {
        if (
          (order.status === "Новый" || order.status === "В производстве") &&
          new Date(order.date) < fourteenDaysAgo
        ) {
          const isDuplicate = await hasDuplicateNotification(
            user.id,
            "overdue_order",
            order.id
          );
          if (!isDuplicate) {
            await notify({
              userId: user.id,
              type: "overdue_order",
              title: "Просроченный заказ",
              message: `Заказ №${order.orderNumber} находится в статусе "${order.status}" более 14 дней`,
              entityType: "order",
              entityId: order.id,
            });
          }
        }
      }

      // 2. Low stock check
      const receipts = await storage.getWarehouseReceipts(user.id);
      const writeoffs = await storage.getWarehouseWriteoffs(user.id);

      const componentStock: Record<string, number> = {};
      const fabricStock: Record<string, number> = {};

      for (const receipt of receipts) {
        const items = await storage.getWarehouseReceiptItems(receipt.id);
        for (const item of items) {
          const qty = parseFloat(item.quantity?.toString() || "0");
          if (item.componentId) {
            componentStock[item.componentId] = (componentStock[item.componentId] || 0) + qty;
          }
          if (item.fabricId) {
            fabricStock[item.fabricId] = (fabricStock[item.fabricId] || 0) + qty;
          }
        }
      }

      for (const wo of writeoffs) {
        const qty = parseFloat(wo.quantity?.toString() || "0");
        if (wo.componentId) {
          componentStock[wo.componentId] = (componentStock[wo.componentId] || 0) - qty;
        }
        if (wo.fabricId) {
          fabricStock[wo.fabricId] = (fabricStock[wo.fabricId] || 0) - qty;
        }
      }

      const allComponents = await storage.getComponents(user.id);
      for (const comp of allComponents) {
        const stock = componentStock[comp.id] || 0;
        if (stock < 0) {
          const isDuplicate = await hasDuplicateNotification(
            user.id,
            "low_stock",
            comp.id
          );
          if (!isDuplicate) {
            await notify({
              userId: user.id,
              type: "low_stock",
              title: "Отрицательный остаток",
              message: `Комплектующая "${comp.name}" имеет отрицательный остаток: ${stock.toFixed(2)}`,
              entityType: "component",
              entityId: comp.id,
            });
          }
        }
      }

      const allFabrics = await storage.getFabrics(user.id);
      for (const fabric of allFabrics) {
        const stock = fabricStock[fabric.id] || 0;
        if (stock < 0) {
          const isDuplicate = await hasDuplicateNotification(
            user.id,
            "low_stock",
            fabric.id
          );
          if (!isDuplicate) {
            await notify({
              userId: user.id,
              type: "low_stock",
              title: "Отрицательный остаток",
              message: `Ткань "${fabric.name}" имеет отрицательный остаток: ${stock.toFixed(2)}`,
              entityType: "fabric",
              entityId: fabric.id,
            });
          }
        }
      }

      // 3. Overdue installment payments
      const overduePayments = await storage.getOverdueInstallmentPayments(user.id);
      for (const payment of overduePayments) {
        const isDuplicate = await hasDuplicateNotification(
          user.id,
          "overdue_payment",
          payment.id
        );
        if (!isDuplicate) {
          const order = await storage.getOrder(payment.plan.orderId);
          await notify({
            userId: user.id,
            type: "overdue_payment",
            title: "Просроченный платёж по рассрочке",
            message: `Платёж №${payment.paymentNumber} по заказу №${order?.orderNumber || "?"} (${parseFloat(payment.amount).toLocaleString("ru-RU")} ₽) просрочен — срок был ${payment.dueDate}`,
            entityType: "order",
            entityId: payment.plan.orderId,
          });
        }
      }
    }
  } catch (error) {
    console.error("Periodic notification generation error:", error);
  }
}
