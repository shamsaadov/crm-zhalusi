import { storage } from "./storage";
import { db } from "./db";
import { notifications, orders, users, dealerNotifications, dealers } from "@shared/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { sendApns, setApnsDeadTokenCleanup } from "./apns";

// Wire the dead-token cleanup once at module load — when APNs reports a token
// as BadDeviceToken/Unregistered, drop it from device_tokens so we don't keep
// hammering Apple with stale tokens.
setApnsDeadTokenCleanup((token) => storage.deleteDeviceToken(token, "ios"));

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

export async function notifyDealer(params: {
  dealerId: string;
  userId: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  isBroadcast?: boolean;
}): Promise<void> {
  try {
    await storage.createDealerNotification({
      dealerId: params.dealerId,
      userId: params.userId,
      title: params.title,
      message: params.message,
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      isBroadcast: params.isBroadcast ?? false,
    });
  } catch (error) {
    console.error("Dealer notification error:", error);
    // DB write failed — skip push: there's no in-app row to land on if the user taps.
    return;
  }

  // Best-effort APNs push. We intentionally do not await fully — the HTTP
  // response to the original request shouldn't be held up by Apple's network,
  // and a failed push is not user-facing (the in-app notification is already
  // saved).
  sendDealerPush(params).catch((err) => {
    console.error("Dealer push error:", err);
  });
}

async function sendDealerPush(params: {
  dealerId: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const tokens = await storage.getDeviceTokensForDealer(params.dealerId);
  if (tokens.length === 0) return;

  await sendApns(
    tokens.map((t) => ({ token: t.token, platform: t.platform as "ios" | "android" })),
    {
      title: params.title,
      body: params.message,
      data: {
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
      },
    }
  );
}

async function hasDuplicateDealerNotification(
  dealerId: string,
  entityId: string
): Promise<boolean> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(dealerNotifications)
    .where(
      and(
        eq(dealerNotifications.dealerId, dealerId),
        eq(dealerNotifications.entityId, entityId),
        gte(dealerNotifications.createdAt, oneDayAgo)
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
        const isDuplicate = await hasDuplicateNotification(user.id, "overdue_payment", payment.id);
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

    // Dealer notifications: installment payment reminders
    try {
      const allDealers = await db.select().from(dealers).where(eq(dealers.isActive, true));
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const threeDaysLater = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

      for (const dealer of allDealers) {
        try {
          const plans = await storage.getDealerInstallmentPlans(dealer.id);
          for (const plan of plans) {
            const order = plan.order;
            for (const payment of plan.payments) {
              if (payment.isPaid) continue;

              // Overdue payment
              if (payment.dueDate < todayStr) {
                const isDup = await hasDuplicateDealerNotification(dealer.id, payment.id);
                if (!isDup) {
                  await notifyDealer({
                    dealerId: dealer.id,
                    userId: dealer.userId,
                    title: "Просроченный платёж",
                    message: `Платёж №${payment.paymentNumber} по заказу №${order?.orderNumber || "?"} (${parseFloat(payment.amount).toLocaleString("ru-RU")} ₽) просрочен — срок был ${payment.dueDate}`,
                    entityType: "installment",
                    entityId: plan.id,
                  });
                }
              }
              // Upcoming payment (within 3 days)
              else if (payment.dueDate <= threeDaysLater && payment.dueDate >= todayStr) {
                const isDup = await hasDuplicateDealerNotification(dealer.id, payment.id);
                if (!isDup) {
                  const daysLeft = Math.ceil((new Date(payment.dueDate).getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                  const dayWord = daysLeft === 0 ? "сегодня" : daysLeft === 1 ? "завтра" : `через ${daysLeft} дн.`;
                  await notifyDealer({
                    dealerId: dealer.id,
                    userId: dealer.userId,
                    title: "Предстоящий платёж",
                    message: `Платёж №${payment.paymentNumber} по заказу №${order?.orderNumber || "?"} (${parseFloat(payment.amount).toLocaleString("ru-RU")} ₽) — ${dayWord}`,
                    entityType: "installment",
                    entityId: plan.id,
                  });
                }
              }
            }
          }
        } catch (dealerErr) {
          console.error(`Dealer notification error for ${dealer.id}:`, dealerErr);
        }
      }
    } catch (dealerNotifErr) {
      console.error("Dealer periodic notification error:", dealerNotifErr);
    }
  } catch (error) {
    console.error("Periodic notification generation error:", error);
  }
}
