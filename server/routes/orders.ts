import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { installmentPlans as installmentPlansTable, orderSashes as orderSashesTable, orders as ordersTable } from "@shared/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logAudit } from "../audit";
import { calculateOrderPayments } from "../reports/financial";
import { loadFinData } from "../reports/load";
import { notify, notifyDealer } from "../notifications";

interface AuthRequest extends Request {
  userId?: string;
}

type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => void;

/** Строка заказа, которая идёт в производство (товар-комплектующая — нет). */
export function isProductionSash(s: { componentId?: string | null; systemId?: string | null }) {
  return !(s.componentId && !s.systemId);
}

/** Для значка «Производство» в журнале: передано / готово из N изделий. */
function productionCounts(sashes: { componentId?: string | null; systemId?: string | null; productionStatus?: string | null }[]) {
  const prod = sashes.filter(isProductionSash);
  return {
    productionTotal: prod.length,
    productionSent: prod.filter((s) => s.productionStatus).length,
    productionReady: prod.filter((s) => s.productionStatus === "ready").length,
  };
}

const PRODUCTION_SASH = sql`not (component_id is not null and system_id is null)`;

/**
 * Статус заказа → состояние створок в производстве (ручная смена статуса).
 * Откат из «Готов/Отгружен» в работу отменяет выпуск: списание материалов снимается.
 */
async function syncSashProduction(orderId: string, from: string, to: string) {
  if (to === "Новый") {
    await db.execute(sql`update order_sashes set production_status = null, production_sent_at = null, production_ready_at = null where order_id = ${orderId}`);
  } else if (to === "В производстве") {
    await db.execute(sql`update order_sashes set production_status = 'in_work', production_sent_at = coalesce(production_sent_at, timezone('utc', now())), production_ready_at = null where order_id = ${orderId} and ${PRODUCTION_SASH}`);
  } else if (to === "Готов" || to === "Отгружен") {
    await db.execute(sql`update order_sashes set production_status = 'ready', production_sent_at = coalesce(production_sent_at, timezone('utc', now())), production_ready_at = coalesce(production_ready_at, timezone('utc', now())) where order_id = ${orderId} and coalesce(production_status, '') <> 'ready' and ${PRODUCTION_SASH}`);
  }
  const wasReleased = from === "Готов" || from === "Отгружен";
  if (wasReleased && (to === "Новый" || to === "В производстве")) {
    await storage.deleteWarehouseWriteoffsByOrderId(orderId);
  }
}

export function createOrdersRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // Helper function to sanitize sash data
  const sanitizeSashData = (sash: {
    width: string;
    height: string;
    systemId?: string;
    systemColorId?: string;
    controlSide?: string;
    fabricId?: string;
    fabricColorId?: string;
    sashPrice?: string;
    sashCost?: string;
    coefficient?: string;
    room?: number;
    roomName?: string;
    // Mobile-app fallback fields: preserved so that editing an order created
    // from a mobile measurement doesn't lose the dealer's original selection.
    systemName?: string;
    systemType?: string;
    category?: string;
    fabricName?: string;
    componentId?: string;
  }) => ({
    width: sash.width,
    height: sash.height,
    systemId: sash.systemId || null,
    systemColorId: sash.systemColorId || null,
    controlSide: sash.controlSide || null,
    fabricId: sash.fabricId || null,
    fabricColorId: sash.fabricColorId || null,
    sashPrice: sash.sashPrice || "0",
    sashCost: sash.sashCost || "0",
    coefficient: sash.coefficient || null,
    room: sash.room || 1,
    roomName: sash.roomName || null,
    systemName: sash.systemName || null,
    systemType: sash.systemType || null,
    category: sash.category || null,
    fabricName: sash.fabricName || null,
    componentId: sash.componentId || null,
  });

  // Helper function to calculate current stock levels
  async function getStockLevels(userId: string) {
    const [receipts, writeoffs] = await Promise.all([
      storage.getWarehouseReceipts(userId),
      storage.getWarehouseWriteoffs(userId),
    ]);

    const fabricStock: Record<string, number> = {};
    const componentStock: Record<string, number> = {};

    // Add receipts
    for (const receipt of receipts) {
      const items = await storage.getWarehouseReceiptItems(receipt.id);
      for (const item of items) {
        const qty = parseFloat(item.quantity?.toString() || "0");
        if (item.fabricId) {
          fabricStock[item.fabricId] = (fabricStock[item.fabricId] || 0) + qty;
        }
        if (item.componentId) {
          componentStock[item.componentId] =
            (componentStock[item.componentId] || 0) + qty;
        }
      }
    }

    // Subtract writeoffs
    for (const wo of writeoffs) {
      const qty = parseFloat(wo.quantity?.toString() || "0");
      if (wo.fabricId) {
        fabricStock[wo.fabricId] = (fabricStock[wo.fabricId] || 0) - qty;
      }
      if (wo.componentId) {
        componentStock[wo.componentId] =
          (componentStock[wo.componentId] || 0) - qty;
      }
    }

    return { fabricStock, componentStock };
  }

  // Compute current weighted-avg price per fabric from warehouse receipts.
  // When no receipts exist, fall back to the manual `fabrics.price` column
  // (set via "Пересчитать себестоимость" before a buy-in is recorded).
  // Fabrics with neither receipts nor manual price get 0 — blocks shipping
  // so costPrice isn't understated.
  async function getFabricAvgPrices(
    userId: string
  ): Promise<Record<string, number>> {
    const receipts = await storage.getWarehouseReceipts(userId);
    const totals: Record<string, { value: number; qty: number }> = {};
    for (const receipt of receipts) {
      const items = await storage.getWarehouseReceiptItems(receipt.id);
      for (const item of items) {
        if (!item.fabricId) continue;
        const qty = parseFloat(item.quantity?.toString() || "0");
        const price = parseFloat(item.price?.toString() || "0");
        if (!totals[item.fabricId]) totals[item.fabricId] = { value: 0, qty: 0 };
        totals[item.fabricId].value += qty * price;
        totals[item.fabricId].qty += qty;
      }
    }
    const allFabrics = await storage.getFabrics(userId);
    const result: Record<string, number> = {};
    for (const fabric of allFabrics) {
      const t = totals[fabric.id];
      const avg = t && t.qty > 0 ? t.value / t.qty : 0;
      if (avg > 0) {
        result[fabric.id] = avg;
      } else {
        const manual = parseFloat(fabric.price?.toString() || "0");
        result[fabric.id] = manual > 0 ? manual : 0;
      }
    }
    return result;
  }

  // Helper function to validate stock for sash order
  async function validateSashOrderStock(
    userId: string,
    sashes: any[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const { fabricStock, componentStock } = await getStockLevels(userId);

    const allFabrics = await storage.getFabrics(userId);
    const allSystems = await storage.getSystems(userId);

    // Calculate required materials
    const requiredFabrics: Record<string, { qty: number; name: string }> = {};
    const requiredComponents: Record<string, { qty: number; name: string }> =
      {};

    for (const sash of sashes) {
      const width = parseFloat(sash.width || "0");
      const height = parseFloat(sash.height || "0");
      const widthM = width / 100;
      const heightM = height / 100;
      const areaM2 = widthM * heightM;
      const quantity = parseInt(sash.quantity || "1");

      // Check fabric
      if (sash.fabricId) {
        const fabric = allFabrics.find((f) => f.id === sash.fabricId);
        if (fabric) {
          const fabricMultiplier = fabric.fabricType === "zebra" ? 2 : 1;
          const fabricQty = areaM2 * fabricMultiplier * quantity;

          if (!requiredFabrics[sash.fabricId]) {
            requiredFabrics[sash.fabricId] = { qty: 0, name: fabric.name };
          }
          requiredFabrics[sash.fabricId].qty += fabricQty;
        }
      }

      // Check system components
      if (sash.systemId) {
        const system = allSystems.find((s) => s.id === sash.systemId);
        if (system) {
          const systemComps = await storage.getSystemComponents(system.id);
          const allComponents = await storage.getComponents(userId);

          for (const sc of systemComps) {
            const component = allComponents.find(
              (c) => c.id === sc.componentId
            );
            if (component) {
              const compQuantity = parseFloat(sc.quantity?.toString() || "1");
              const sizeSource = sc.sizeSource || null;
              const sizeMultiplier = parseFloat(
                sc.sizeMultiplier?.toString() || "1"
              );
              const unit = component.unit || "шт";

              let componentQty = compQuantity;
              const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
                unit.toLowerCase()
              );

              if (isMetric) {
                if (sizeSource === "width") {
                  componentQty = widthM * sizeMultiplier * compQuantity;
                } else if (sizeSource === "height") {
                  componentQty = heightM * sizeMultiplier * compQuantity;
                } else {
                  componentQty = widthM * sizeMultiplier * compQuantity;
                }
              }

              componentQty *= quantity;

              if (!requiredComponents[sc.componentId]) {
                requiredComponents[sc.componentId] = {
                  qty: 0,
                  name: component.name,
                };
              }
              requiredComponents[sc.componentId].qty += componentQty;
            }
          }
        }
      }

      // Check direct component (для заказов товара)
      if (sash.componentId && !sash.systemId) {
        const allComponents = await storage.getComponents(userId);
        const component = allComponents.find((c) => c.id === sash.componentId);
        if (component) {
          const componentQty = quantity;

          if (!requiredComponents[sash.componentId]) {
            requiredComponents[sash.componentId] = {
              qty: 0,
              name: component.name,
            };
          }
          requiredComponents[sash.componentId].qty += componentQty;
        }
      }
    }

    // Validate fabric stock
    for (const [fabricId, { qty, name }] of Object.entries(requiredFabrics)) {
      const available = fabricStock[fabricId] || 0;
      if (available < qty) {
        errors.push(
          `Недостаточно ткани "${name}": требуется ${qty.toFixed(
            2
          )} м², доступно ${available.toFixed(2)} м²`
        );
      }
    }

    // Validate component stock
    for (const [componentId, { qty, name }] of Object.entries(
      requiredComponents
    )) {
      const available = componentStock[componentId] || 0;
      if (available < qty) {
        errors.push(
          `Недостаточно комплектующих "${name}": требуется ${qty.toFixed(
            2
          )}, доступно ${available.toFixed(2)}`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // Helper function to validate stock for product order
  async function validateProductOrderStock(
    userId: string,
    components: { componentId: string; quantity: string }[]
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const { componentStock } = await getStockLevels(userId);
    const allComponents = await storage.getComponents(userId);

    for (const item of components) {
      const component = allComponents.find((c) => c.id === item.componentId);
      const requiredQty = parseFloat(item.quantity || "1");
      const available = componentStock[item.componentId] || 0;

      if (available < requiredQty) {
        const name = component?.name || "Неизвестная комплектующая";
        errors.push(
          `Недостаточно "${name}": требуется ${requiredQty.toFixed(
            2
          )}, доступно ${available.toFixed(2)}`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  // ===== ORDERS =====
  router.get(
    "/orders",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const cursor = req.query.cursor as string | undefined;
        const paginated = req.query.paginated === "true";
        const status =
          typeof req.query.status === "string" && req.query.status !== "all"
            ? req.query.status
            : undefined;
        const dealerId =
          typeof req.query.dealerId === "string" && req.query.dealerId !== "all"
            ? req.query.dealerId
            : undefined;
        const from =
          typeof req.query.from === "string" && req.query.from.length > 0
            ? req.query.from
            : undefined;
        const to =
          typeof req.query.to === "string" && req.query.to.length > 0
            ? req.query.to
            : undefined;
        const search =
          typeof req.query.search === "string" && req.query.search.length > 0
            ? req.query.search
            : undefined;
        const orderTypeFilter =
          typeof req.query.orderType === "string" &&
          ["sash", "product"].includes(req.query.orderType as string)
            ? (req.query.orderType as "sash" | "product")
            : undefined;

        const dealerList = await storage.getDealers(req.userId!);

        // Precompute shipped debt per dealer (sum of salePrice for shipped orders)
        // and non-shipped orders total to derive actual shipped debt from dealer balance
        const shippedDebtMap = new Map<string, number>();
        const nonShippedMap = new Map<string, number>();
        const allOrders = await storage.getOrders(req.userId!, {});
        for (const o of allOrders) {
          if (o.dealerId) {
            const price = parseFloat(o.salePrice?.toString() || "0");
            if (o.status === "Отгружен") {
              shippedDebtMap.set(o.dealerId, (shippedDebtMap.get(o.dealerId) || 0) + price);
            } else {
              nonShippedMap.set(o.dealerId, (nonShippedMap.get(o.dealerId) || 0) + price);
            }
          }
        }
        // Actual shipped debt = total debt (opening + all orders - payments) minus non-shipped orders
        // dealer.balance = -(opening + allOrdersTotal - payments)
        // so -(dealer.balance) = opening + allOrdersTotal - payments
        // shippedDebt = -(dealer.balance) - nonShippedTotal = opening + shippedOrdersTotal - payments
        for (const dealer of dealerList) {
          const nonShippedTotal = nonShippedMap.get(dealer.id) || 0;
          const actualShippedDebt = -(dealer.balance) - nonShippedTotal;
          shippedDebtMap.set(dealer.id, actualShippedDebt);
        }

        // Helper to determine order type based on sashes
        const getOrderType = (sashes: any[]) => {
          if (sashes.length === 0) return "product";
          // If any sash has componentId but no systemId/fabricId -> product order
          const hasProductSash = sashes.some(
            (s) => s.componentId && !s.systemId && !s.fabricId
          );
          return hasProductSash ? "product" : "sash";
        };

        // Для значков журнала заказов (как в УЭС): оплата и списанные материалы.
        const finData = await loadFinData(req.userId!);
        const payments = calculateOrderPayments(finData);
        const ordersWithWriteoffs = new Set(
          finData.writeoffs.map((w) => w.orderId).filter((id): id is string => !!id)
        );

        const enrichOrders = async (ordersToEnrich: any[]) => {
          return Promise.all(
            ordersToEnrich.map(async (order) => {
              const sashes = await storage.getOrderSashes(order.id);
              const dealer = dealerList.find((d) => d.id === order.dealerId);
              const fabricIds = Array.from(
                new Set(
                  sashes
                    .map((s) => s.fabricId)
                    .filter((id): id is string => !!id)
                )
              );
              return {
                ...order,
                dealer,
                dealerBalance: dealer?.balance,
                dealerShippedDebt: order.dealerId ? (shippedDebtMap.get(order.dealerId) || 0) : 0,
                sashesCount: sashes.length,
                orderType: getOrderType(sashes),
                fabricIds,
                paidAmount: payments.get(order.id)?.paid ?? 0,
                paymentState: payments.get(order.id)?.state ?? "none",
                materialsWrittenOff: ordersWithWriteoffs.has(order.id),
                ...productionCounts(sashes),
              };
            })
          );
        };

        // Помеченные на удаление: по умолчанию скрыты; ?deleted=include|only — показать.
        const deleted: "exclude" | "include" | "only" =
          req.query.deleted === "include" || req.query.deleted === "only"
            ? (req.query.deleted as "include" | "only")
            : "exclude";
        const filters = { status, dealerId, from, to, search, deleted };

        if (paginated) {
          let result = await storage.getOrdersPaginated(
            req.userId!,
            {
              limit,
              cursor,
            },
            filters
          );

          let enriched = await enrichOrders(result.data);
          if (orderTypeFilter) {
            enriched = enriched.filter((o) => o.orderType === orderTypeFilter);
          }

          // Fetch more pages if filtered results are fewer than limit but there are more pages
          while (
            orderTypeFilter &&
            enriched.length < limit &&
            result.hasMore &&
            result.nextCursor
          ) {
            result = await storage.getOrdersPaginated(
              req.userId!,
              { limit, cursor: result.nextCursor },
              filters
            );
            let more = await enrichOrders(result.data);
            more = more.filter((o) => o.orderType === orderTypeFilter);
            enriched = enriched.concat(more);
          }

          const trimmed = enriched.slice(0, limit);
          const hasMore = enriched.length > limit || result.hasMore;
          const nextCursor =
            enriched.length > limit && enriched[limit]
              ? `${enriched[limit].date}_${enriched[limit].id}`
              : result.nextCursor;

          res.json({
            data: trimmed,
            nextCursor,
            hasMore,
          });
        } else {
          // Legacy non-paginated response for backward compatibility
          const orderList = await storage.getOrders(req.userId!, filters);

          let enriched = await enrichOrders(orderList);
          if (orderTypeFilter) {
            enriched = enriched.filter((o) => o.orderType === orderTypeFilter);
          }

          res.json(enriched);
        }
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.get(
    "/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const order = await storage.getOrder(req.params.id);
        if (!order || order.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }
        const sashes = await storage.getOrderSashes(order.id);
        const dealerList = await storage.getDealers(req.userId!);
        const systemList = await storage.getSystems(req.userId!);
        const fabricList = await storage.getFabrics(req.userId!);
        const colorList = await storage.getColors(req.userId!);

        const enrichedSashes = sashes.map((sash) => ({
          ...sash,
          system: systemList.find((s) => s.id === sash.systemId),
          systemColor: colorList.find((c) => c.id === sash.systemColorId),
          fabric: fabricList.find((f) => f.id === sash.fabricId),
          fabricColor: colorList.find((c) => c.id === sash.fabricColorId),
        }));

        // Оплата по заказу — тем же распределением, что и значок в журнале.
        const payment = calculateOrderPayments(await loadFinData(req.userId!)).get(order.id);
        const writeoffs = await storage.getWarehouseWriteoffsByOrderId(order.id);

        // Ищем финансовую операцию оплаты для этого заказа
        const financeOps = await storage.getFinanceOperations(req.userId!);
        const paymentComment = `Оплата заказа №${order.orderNumber}`;
        // Ищем операцию по точному совпадению или по содержанию номера заказа
        const paymentOp = financeOps.find(
          (op) =>
            op.type === "income" &&
            op.comment?.includes(`заказа №${order.orderNumber}`) &&
            !op.deletedAt
        );

        res.json({
          ...order,
          dealer: dealerList.find((d) => d.id === order.dealerId),
          sashes: enrichedSashes,
          isPaid: !!paymentOp,
          cashboxId: paymentOp?.cashboxId || null,
          paidAmount: payment?.paid ?? 0,
          paymentState: payment?.state ?? "none",
          materialsWrittenOff: writeoffs.length > 0,
          ...productionCounts(sashes),
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/orders",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { sashes, skipStockValidation, isPaid, cashboxId, ...orderData } =
          req.body;

        // Проверка остатков при создании заказа (только если статус НЕ "Новый" и НЕ "В производстве")
        const createStatus = orderData.status || "Новый";
        if (
          createStatus !== "Новый" &&
          createStatus !== "В производстве" &&
          sashes && Array.isArray(sashes) && sashes.length > 0 && !skipStockValidation
        ) {
          const validation = await validateSashOrderStock(req.userId!, sashes);
          if (!validation.valid) {
            return res.status(400).json({
              message: "Недостаточно материалов на складе",
              errors: validation.errors,
              stockError: true,
            });
          }
        }

        const orderNumber = await storage.getNextOrderNumber(req.userId!);

        const order = await storage.createOrder({
          ...orderData,
          dealerId: orderData.dealerId || null, // пусто — розница
          orderNumber,
          userId: req.userId,
        });

        if (sashes && Array.isArray(sashes)) {
          for (const sash of sashes) {
            await storage.createOrderSash({
              ...sanitizeSashData(sash),
              orderId: order.id,
            });
          }
        }

        // Create finance income operation if order is paid
        if (
          isPaid &&
          orderData.salePrice &&
          parseFloat(orderData.salePrice) > 0
        ) {
          // Используем указанную кассу или первую по умолчанию
          let targetCashboxId = cashboxId;
          if (!targetCashboxId) {
            const allCashboxes = await storage.getCashboxes(req.userId!);
            if (allCashboxes.length > 0) {
              targetCashboxId = allCashboxes[0].id;
            }
          }

          if (targetCashboxId) {
            await storage.createFinanceOperation({
              type: "income",
              operationType: "Оплата от покупателя", // оплата заказа — не прочий доход
              amount: orderData.salePrice,
              date: orderData.date,
              cashboxId: targetCashboxId,
              dealerId:
                orderData.dealerId && orderData.dealerId.trim() !== ""
                  ? orderData.dealerId
                  : null,
              comment: `Оплата заказа №${orderNumber}`,
              userId: req.userId!,
            });
          }
        }

        logAudit({
          userId: req.userId!,
          action: "create",
          entityType: "order",
          entityId: order.id,
          after: order,
          metadata: { orderNumber },
        });

        res.json(order);
      } catch (error) {
        console.error("Create order error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Создание заказа товара (только комплектующие, без створок)
  router.post(
    "/orders/product",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          components,
          skipStockValidation,
          isPaid,
          cashboxId,
          ...orderData
        } = req.body;

        // Проверка остатков при создании заказа товара (только если статус НЕ "Новый" и НЕ "В производстве")
        const productStatus = orderData.status || "Новый";
        if (
          productStatus !== "Новый" &&
          productStatus !== "В производстве" &&
          components && Array.isArray(components) && components.length > 0 && !skipStockValidation
        ) {
          const validation = await validateProductOrderStock(req.userId!, components);
          if (!validation.valid) {
            return res.status(400).json({
              message: "Недостаточно товара на складе",
              errors: validation.errors,
              stockError: true,
            });
          }
        }

        const orderNumber = await storage.getNextOrderNumber(req.userId!);

        let comment = orderData.comment || "";
        if (components && Array.isArray(components) && components.length > 0) {
          const allComponents = await storage.getComponents(req.userId!);
          const componentNames = components
            .map((c: { componentId: string; quantity: string }) => {
              const comp = allComponents.find((x) => x.id === c.componentId);
              return comp ? `${comp.name} x${c.quantity}` : null;
            })
            .filter(Boolean)
            .join(", ");

          comment = comment
            ? `${comment}\n[Товар: ${componentNames}]`
            : `[Товар: ${componentNames}]`;
        }

        const order = await storage.createOrder({
          ...orderData,
          dealerId: orderData.dealerId || null, // пусто — розница
          comment,
          orderNumber,
          userId: req.userId,
        });

        // Сохраняем компоненты как "створки" для возможности списания
        if (components && Array.isArray(components) && components.length > 0) {
          for (const comp of components) {
            await storage.createOrderSash({
              orderId: order.id,
              componentId: comp.componentId,
              width: "0",
              height: "0",
            });
          }
        }

        if (
          isPaid &&
          orderData.salePrice &&
          parseFloat(orderData.salePrice) > 0
        ) {
          let targetCashboxId = cashboxId;
          if (!targetCashboxId) {
            const allCashboxes = await storage.getCashboxes(req.userId!);
            if (allCashboxes.length > 0) {
              targetCashboxId = allCashboxes[0].id;
            }
          }

          if (targetCashboxId) {
            await storage.createFinanceOperation({
              type: "income",
              operationType: "Оплата от покупателя", // оплата заказа — не прочий доход
              amount: orderData.salePrice,
              date: orderData.date,
              cashboxId: targetCashboxId,
              dealerId:
                orderData.dealerId && orderData.dealerId.trim() !== ""
                  ? orderData.dealerId
                  : null,
              comment: `Оплата заказа №${orderNumber}`,
              userId: req.userId!,
            });
          }
        }

        res.json(order);
      } catch (error) {
        console.error("Create product order error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { sashes, skipStockValidation, isPaid, cashboxId, ...orderData } =
          req.body;

        // Получаем существующий заказ
        const existingOrder = await storage.getOrder(req.params.id);
        if (!existingOrder || existingOrder.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }

        // Проверка остатков при редактировании заказа (только если статус НЕ "Новый" и НЕ "В производстве")
        const editStatus = orderData.status || existingOrder?.status || "Новый";
        if (
          editStatus !== "Новый" &&
          editStatus !== "В производстве" &&
          sashes && Array.isArray(sashes) && sashes.length > 0 && !skipStockValidation
        ) {
          const validation = await validateSashOrderStock(req.userId!, sashes);
          if (!validation.valid) {
            return res.status(400).json({
              message: "Недостаточно материалов на складе",
              errors: validation.errors,
              stockError: true,
            });
          }
        }

        if ("dealerId" in orderData && !orderData.dealerId) orderData.dealerId = null; // пусто — розница
        const order = await storage.updateOrder(req.params.id, orderData);

        if (sashes && Array.isArray(sashes)) {
          // Строки пересоздаются, но створка с прежним id сохраняет id и своё
          // состояние в производстве (в работе / готово).
          const before = new Map(
            (await storage.getOrderSashes(req.params.id)).map((s) => [s.id, s])
          );
          await storage.deleteOrderSashesByOrderId(req.params.id);
          for (const sash of sashes) {
            const prev = typeof sash.id === "string" ? before.get(sash.id) : undefined;
            before.delete(sash.id);
            await storage.createOrderSash({
              ...sanitizeSashData(sash),
              orderId: req.params.id,
              ...(prev
                ? {
                    id: prev.id,
                    productionStatus: prev.productionStatus,
                    productionSentAt: prev.productionSentAt,
                    productionReadyAt: prev.productionReadyAt,
                  }
                : {}),
            } as typeof orderSashesTable.$inferInsert);
          }
        }

        // Создаём финансовую операцию, если заказ отмечен как оплаченный
        const salePrice = orderData.salePrice || existingOrder?.salePrice;
        if (isPaid && salePrice && parseFloat(salePrice) > 0) {
          // Проверяем, не была ли уже создана оплата для этого заказа
          const paymentComment = `Оплата заказа №${
            existingOrder?.orderNumber || order?.orderNumber
          }`;
          const existingOperations = await storage.getFinanceOperations(
            req.userId!,
            false
          );
          const alreadyPaid = existingOperations.some(
            (op) => op.comment === paymentComment && op.type === "income"
          );

          if (!alreadyPaid) {
            // Используем указанную кассу или первую по умолчанию
            let targetCashboxId = cashboxId;
            if (!targetCashboxId) {
              const allCashboxes = await storage.getCashboxes(req.userId!);
              if (allCashboxes.length > 0) {
                targetCashboxId = allCashboxes[0].id;
              }
            }

            if (targetCashboxId) {
              await storage.createFinanceOperation({
                type: "income",
              operationType: "Оплата от покупателя", // оплата заказа — не прочий доход
                amount: salePrice,
                date:
                  orderData.date ||
                  existingOrder?.date ||
                  new Date().toISOString().split("T")[0],
                cashboxId: targetCashboxId,
                dealerId:
                  orderData.dealerId && orderData.dealerId.trim() !== ""
                    ? orderData.dealerId
                    : existingOrder?.dealerId || null,
                comment: paymentComment,
                userId: req.userId!,
              });
            }
          }
        }

        logAudit({
          userId: req.userId!,
          action: "update",
          entityType: "order",
          entityId: req.params.id,
          before: existingOrder,
          after: order,
          metadata: { orderNumber: existingOrder?.orderNumber || order?.orderNumber },
        });

        res.json(order);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  type StatusReply = { code: number; body: any };
  const reply = (code: number, body: any): StatusReply => ({ code, body });

  /**
   * Смена статуса заказа со всеми последствиями (долг дилера, списание материалов
   * при «Готов», проверка цен при «Отгружен»). Используется журналом и производством.
   */
  async function applyOrderStatus(
    userId: string,
    orderId: string,
    status: string
  ): Promise<StatusReply> {
    const order = await storage.getOrder(orderId);
    if (!order || order.userId !== userId) {
      return reply(404, { message: "Заказ не найден" });
    }

    const oldStatus = order.status || "Новый";
    if (status === oldStatus) return reply(200, order);

    // Как в УЭС: отгрузить можно только то, что готово с производства.
    if (status === "Отгружен") {
      const prod = (await storage.getOrderSashes(orderId)).filter(isProductionSash);
      const ready = prod.filter((s) => s.productionStatus === "ready").length;
      if (ready < prod.length && oldStatus !== "Готов") {
        return reply(400, {
          message: `Нельзя отгрузить: производство не завершено (готово ${ready} из ${prod.length}).`,
          productionError: true,
        });
      }
    }
    let dealerDebt = parseFloat(order.dealerDebt?.toString() || "0");

    // 1. Новый → просто черновик, ничего не делаем

    // 2. В производстве → добавляем долг дилеру (если долг ещё не установлен)
    if (status === "В производстве" && oldStatus === "Новый") {
      dealerDebt = parseFloat(order.salePrice?.toString() || "0");
    }

    // 3. Готов → списываем материалы со склада
    if (status === "Готов" && oldStatus !== "Готов") {
      // Проверяем, не было ли уже списания для этого заказа
      const existingWriteoffs =
        await storage.getWarehouseWriteoffsByOrderId(orderId);

      if (existingWriteoffs.length === 0) {
        // Получаем створки заказа
        const sashes = await storage.getOrderSashes(orderId);

        // ПРОВЕРКА ОСТАТКОВ перед изменением статуса на "Готов"
        const validation = await validateSashOrderStock(
          userId,
          sashes
        );
        if (!validation.valid) {
          return reply(400, {
            message:
              "Невозможно изменить статус на 'Готов'. Недостаточно материалов на складе",
            errors: validation.errors,
            stockError: true,
          });
        }

        const allFabrics = await storage.getFabrics(userId);
        const allSystems = await storage.getSystems(userId);
        const allComponents = await storage.getComponents(userId);

        // Получаем текущие остатки и средние цены
        const receipts = await storage.getWarehouseReceipts(userId);
        const writeoffs = await storage.getWarehouseWriteoffs(userId);

        // Рассчитываем текущие остатки тканей
        const fabricStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            avgPrice: number;
            totalValue: number;
            lastPrice: number;
          }
        > = {};
        for (const receipt of receipts) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          for (const item of items.filter((i) => i.fabricId)) {
            if (!fabricStock[item.fabricId!]) {
              fabricStock[item.fabricId!] = {
                quantity: 0,
                totalReceived: 0,
                avgPrice: 0,
                totalValue: 0,
                lastPrice: 0,
              };
            }
            const qty = parseFloat(item.quantity?.toString() || "0");
            const price = parseFloat(item.price?.toString() || "0");
            fabricStock[item.fabricId!].quantity += qty;
            fabricStock[item.fabricId!].totalReceived += qty;
            fabricStock[item.fabricId!].totalValue += qty * price;
            fabricStock[item.fabricId!].lastPrice = price; // Последняя цена закупки
          }
        }
        // Вычитаем предыдущие списания
        for (const wo of writeoffs) {
          if (wo.fabricId && fabricStock[wo.fabricId]) {
            fabricStock[wo.fabricId].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }
        // Считаем средние цены (от общего количества поступлений, а не от остатка)
        for (const id of Object.keys(fabricStock)) {
          if (fabricStock[id].totalReceived > 0) {
            fabricStock[id].avgPrice =
              fabricStock[id].totalValue / fabricStock[id].totalReceived;
          }
        }

        // Рассчитываем текущие остатки комплектующих
        const componentStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            avgPrice: number;
            totalValue: number;
            lastPrice: number;
          }
        > = {};
        for (const receipt of receipts) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          for (const item of items.filter((i) => i.componentId)) {
            if (!componentStock[item.componentId!]) {
              componentStock[item.componentId!] = {
                quantity: 0,
                totalReceived: 0,
                avgPrice: 0,
                totalValue: 0,
                lastPrice: 0,
              };
            }
            const qty = parseFloat(item.quantity?.toString() || "0");
            const price = parseFloat(item.price?.toString() || "0");
            componentStock[item.componentId!].quantity += qty;
            componentStock[item.componentId!].totalReceived += qty;
            componentStock[item.componentId!].totalValue += qty * price;
            componentStock[item.componentId!].lastPrice = price;
          }
        }
        // Вычитаем предыдущие списания
        for (const wo of writeoffs) {
          if (wo.componentId && componentStock[wo.componentId]) {
            componentStock[wo.componentId].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }
        // Считаем средние цены (от общего количества поступлений, а не от остатка)
        for (const id of Object.keys(componentStock)) {
          if (componentStock[id].totalReceived > 0) {
            componentStock[id].avgPrice =
              componentStock[id].totalValue /
              componentStock[id].totalReceived;
          }
        }

        const today = new Date().toISOString().split("T")[0];
        let writeoffsCreated = 0;

        // Обрабатываем каждую створку
        for (const sash of sashes) {
          const width = parseFloat(sash.width?.toString() || "0");
          const height = parseFloat(sash.height?.toString() || "0");
          const widthM = width / 100;
          const heightM = height / 100;
          const areaM2 = widthM * heightM;
          // Свойство quantity отсутствует у sash, использовать 1 по умолчанию
          const quantity = 1;

          // Списываем ткань
          if (sash.fabricId) {
            const fabric = allFabrics.find((f) => f.id === sash.fabricId);
            const stock = fabricStock[sash.fabricId];

            // Списываем даже если stock не найден, используем цену 0
            if (fabric) {
              const fabricMultiplier =
                fabric.fabricType === "zebra" ? 2 : 1;
              const fabricQty = areaM2 * fabricMultiplier * quantity;
              const price = stock?.lastPrice || stock?.avgPrice || 0;

              await storage.createWarehouseWriteoff({
                orderId: orderId,
                itemType: "fabric",
                fabricId: sash.fabricId,
                quantity: fabricQty.toFixed(4),
                price: price.toFixed(2),
                total: (fabricQty * price).toFixed(2),
                date: today,
                userId: userId,
              });
              writeoffsCreated++;
            }
          }

          // Списываем комплектующие системы
          if (sash.systemId) {
            const system = allSystems.find((s) => s.id === sash.systemId);
            if (system) {
              // Получаем компоненты системы
              const systemComps = await storage.getSystemComponents(
                system.id
              );

              for (const sc of systemComps) {
                const component = allComponents.find(
                  (c) => c.id === sc.componentId
                );
                const stock = componentStock[sc.componentId];

                // Списываем даже если stock не найден
                if (component) {
                  const compQuantity = parseFloat(
                    sc.quantity?.toString() || "1"
                  );
                  const sizeSource = sc.sizeSource || null;
                  const sizeMultiplier = parseFloat(
                    sc.sizeMultiplier?.toString() || "1"
                  );
                  const unit = component.unit || "шт";

                  let componentQty = compQuantity;
                  const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
                    unit.toLowerCase()
                  );

                  if (isMetric) {
                    if (sizeSource === "width") {
                      componentQty = widthM * sizeMultiplier * compQuantity;
                    } else if (sizeSource === "height") {
                      componentQty =
                        heightM * sizeMultiplier * compQuantity;
                    } else {
                      componentQty = widthM * sizeMultiplier * compQuantity;
                    }
                  }

                  // Умножаем на количество створок
                  componentQty *= quantity;

                  const price = stock?.lastPrice || stock?.avgPrice || 0;

                  await storage.createWarehouseWriteoff({
                    orderId: orderId,
                    itemType: "component",
                    componentId: sc.componentId,
                    quantity: componentQty.toFixed(4),
                    price: price.toFixed(2),
                    total: (componentQty * price).toFixed(2),
                    date: today,
                    userId: userId,
                  });
                  writeoffsCreated++;
                }
              }
            }
          }

          // Списываем компонент напрямую (для заказов товара)
          if (sash.componentId && !sash.systemId) {
            const component = allComponents.find(
              (c) => c.id === sash.componentId
            );
            const stock = componentStock[sash.componentId];

            if (component) {
              const componentQty = quantity; // quantity уже парсится из sash.quantity
              const price = stock?.lastPrice || stock?.avgPrice || 0;

              await storage.createWarehouseWriteoff({
                orderId: orderId,
                itemType: "component",
                componentId: sash.componentId,
                quantity: componentQty.toFixed(4),
                price: price.toFixed(2),
                total: (componentQty * price).toFixed(2),
                date: today,
                userId: userId,
              });
              writeoffsCreated++;
            }
          }
        }
      }
    }

    // 4. Отгружен → если материалы ещё не были списаны (пропустили "Готов"), списываем
    if (status === "Отгружен" && oldStatus !== "Отгружен") {
      // Блокируем отгрузку, если у любой ткани заказа нет средней цены
      // (ткань была создана, но поступлений не было — себестоимость была
      // бы занижена). Пользователь должен сначала оприходовать закупку.
      const orderSashes = await storage.getOrderSashes(orderId);
      const orderFabricIds = Array.from(
        new Set(
          orderSashes
            .map((s) => s.fabricId)
            .filter((id): id is string => !!id)
        )
      );
      if (orderFabricIds.length > 0) {
        const fabricAvgPrices = await getFabricAvgPrices(userId);
        const allFabrics = await storage.getFabrics(userId);
        const missing = orderFabricIds
          .filter((id) => !fabricAvgPrices[id] || fabricAvgPrices[id] === 0)
          .map(
            (id) => allFabrics.find((f) => f.id === id)?.name || id
          );
        if (missing.length > 0) {
          return reply(400, {
            message: `Невозможно отгрузить заказ: не указана цена за ткань (${missing.join(
              ", "
            )}). Оприходуйте закупку на складе.`,
            missingFabricPrices: missing,
            fabricPriceError: true,
          });
        }
      }

      const existingWriteoffs =
        await storage.getWarehouseWriteoffsByOrderId(orderId);

      if (existingWriteoffs.length === 0) {
        // Материалы не списаны — выполняем списание как при "Готов"
        const sashes = await storage.getOrderSashes(orderId);

        const validation = await validateSashOrderStock(
          userId,
          sashes
        );
        if (!validation.valid) {
          return reply(400, {
            message:
              "Невозможно изменить статус на 'Отгружен'. Недостаточно материалов на складе",
            errors: validation.errors,
            stockError: true,
          });
        }

        const allFabrics = await storage.getFabrics(userId);
        const allSystems = await storage.getSystems(userId);
        const allComponents = await storage.getComponents(userId);

        const receipts = await storage.getWarehouseReceipts(userId);
        const writeoffs = await storage.getWarehouseWriteoffs(userId);

        // Рассчитываем текущие остатки тканей
        const fabricStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            avgPrice: number;
            totalValue: number;
            lastPrice: number;
          }
        > = {};
        for (const receipt of receipts) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          for (const item of items.filter((i) => i.fabricId)) {
            if (!fabricStock[item.fabricId!]) {
              fabricStock[item.fabricId!] = {
                quantity: 0,
                totalReceived: 0,
                avgPrice: 0,
                totalValue: 0,
                lastPrice: 0,
              };
            }
            const qty = parseFloat(item.quantity?.toString() || "0");
            const price = parseFloat(item.price?.toString() || "0");
            fabricStock[item.fabricId!].quantity += qty;
            fabricStock[item.fabricId!].totalReceived += qty;
            fabricStock[item.fabricId!].totalValue += qty * price;
            fabricStock[item.fabricId!].lastPrice = price;
          }
        }
        for (const wo of writeoffs) {
          if (wo.fabricId && fabricStock[wo.fabricId]) {
            fabricStock[wo.fabricId].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }
        for (const id of Object.keys(fabricStock)) {
          if (fabricStock[id].totalReceived > 0) {
            fabricStock[id].avgPrice =
              fabricStock[id].totalValue / fabricStock[id].totalReceived;
          }
        }

        // Рассчитываем текущие остатки комплектующих
        const componentStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            avgPrice: number;
            totalValue: number;
            lastPrice: number;
          }
        > = {};
        for (const receipt of receipts) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          for (const item of items.filter((i) => i.componentId)) {
            if (!componentStock[item.componentId!]) {
              componentStock[item.componentId!] = {
                quantity: 0,
                totalReceived: 0,
                avgPrice: 0,
                totalValue: 0,
                lastPrice: 0,
              };
            }
            const qty = parseFloat(item.quantity?.toString() || "0");
            const price = parseFloat(item.price?.toString() || "0");
            componentStock[item.componentId!].quantity += qty;
            componentStock[item.componentId!].totalReceived += qty;
            componentStock[item.componentId!].totalValue += qty * price;
            componentStock[item.componentId!].lastPrice = price;
          }
        }
        for (const wo of writeoffs) {
          if (wo.componentId && componentStock[wo.componentId]) {
            componentStock[wo.componentId].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }
        for (const id of Object.keys(componentStock)) {
          if (componentStock[id].totalReceived > 0) {
            componentStock[id].avgPrice =
              componentStock[id].totalValue /
              componentStock[id].totalReceived;
          }
        }

        const today = new Date().toISOString().split("T")[0];

        for (const sash of sashes) {
          const width = parseFloat(sash.width?.toString() || "0");
          const height = parseFloat(sash.height?.toString() || "0");
          const widthM = width / 100;
          const heightM = height / 100;
          const areaM2 = widthM * heightM;
          const quantity = 1;

          if (sash.fabricId) {
            const fabric = allFabrics.find((f) => f.id === sash.fabricId);
            const stock = fabricStock[sash.fabricId];

            if (fabric) {
              const fabricMultiplier =
                fabric.fabricType === "zebra" ? 2 : 1;
              const fabricQty = areaM2 * fabricMultiplier * quantity;
              const price = stock?.lastPrice || stock?.avgPrice || 0;

              await storage.createWarehouseWriteoff({
                orderId: orderId,
                itemType: "fabric",
                fabricId: sash.fabricId,
                quantity: fabricQty.toFixed(4),
                price: price.toFixed(2),
                total: (fabricQty * price).toFixed(2),
                date: today,
                userId: userId,
              });
            }
          }

          if (sash.systemId) {
            const system = allSystems.find((s) => s.id === sash.systemId);
            if (system) {
              const systemComps = await storage.getSystemComponents(
                system.id
              );

              for (const sc of systemComps) {
                const component = allComponents.find(
                  (c) => c.id === sc.componentId
                );
                const stock = componentStock[sc.componentId];

                if (component) {
                  const compQuantity = parseFloat(
                    sc.quantity?.toString() || "1"
                  );
                  const sizeSource = sc.sizeSource || null;
                  const sizeMultiplier = parseFloat(
                    sc.sizeMultiplier?.toString() || "1"
                  );
                  const unit = component.unit || "шт";

                  let componentQty = compQuantity;
                  const isMetric = ["м", "пм", "п.м.", "м.п."].includes(
                    unit.toLowerCase()
                  );

                  if (isMetric) {
                    if (sizeSource === "width") {
                      componentQty = widthM * sizeMultiplier * compQuantity;
                    } else if (sizeSource === "height") {
                      componentQty =
                        heightM * sizeMultiplier * compQuantity;
                    } else {
                      componentQty = widthM * sizeMultiplier * compQuantity;
                    }
                  }

                  const price = stock?.lastPrice || stock?.avgPrice || 0;

                  await storage.createWarehouseWriteoff({
                    orderId: orderId,
                    itemType: "component",
                    componentId: sc.componentId,
                    quantity: componentQty.toFixed(4),
                    price: price.toFixed(2),
                    total: (componentQty * price).toFixed(2),
                    date: today,
                    userId: userId,
                  });
                }
              }
            }
          }

          if (sash.componentId && !sash.systemId) {
            const component = allComponents.find(
              (c) => c.id === sash.componentId
            );
            const stock = componentStock[sash.componentId];

            if (component) {
              const price = stock?.lastPrice || stock?.avgPrice || 0;

              await storage.createWarehouseWriteoff({
                orderId: orderId,
                itemType: "component",
                componentId: sash.componentId,
                quantity: quantity.toFixed(4),
                price: price.toFixed(2),
                total: (quantity * price).toFixed(2),
                date: today,
                userId: userId,
              });
            }
          }
        }
      }
    }

    const updated = await storage.updateOrder(orderId, {
      status,
      dealerDebt: dealerDebt.toString(),
    });
    await syncSashProduction(orderId, oldStatus, status);

    logAudit({
      userId: userId,
      action: "status_change",
      entityType: "order",
      entityId: orderId,
      before: { status: oldStatus },
      after: { status },
      metadata: { orderNumber: order.orderNumber },
    });

    notify({
      userId: userId,
      type: "order_status",
      title: "Статус заказа изменен",
      message: `Заказ №${order.orderNumber}: ${oldStatus} -> ${status}`,
      entityType: "order",
      entityId: order.id,
    });

    if (order.dealerId) {
      const statusLabels: Record<string, string> = {
        "Новый": "Новый",
        "В производстве": "В производстве",
        "Готов": "Готов к выдаче",
        "Отгружен": "Отгружен",
      };
      notifyDealer({
        dealerId: order.dealerId,
        userId: userId,
        title: "Статус заказа изменён",
        message: `Заказ №${order.orderNumber}: ${statusLabels[status] || status}`,
        entityType: "order",
        entityId: order.id,
      });
    }

    return reply(200, updated);
  }

  router.patch(
    "/orders/:id/status",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const r = await applyOrderStatus(req.userId!, req.params.id, req.body.status);
        res.status(r.code).json(r.body);
      } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const orderToDelete = await storage.getOrder(req.params.id);
        if (!orderToDelete || orderToDelete.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }
        // Пометка на удаление (как в УЭС): заказ выпадает из расчётов, связи с
        // замерами сохраняются; окончательно — в «Настройки → Помеченные на удаление».
        await storage.deleteOrder(req.params.id);

        if (orderToDelete) {
          logAudit({
            userId: req.userId!,
            action: "delete",
            entityType: "order",
            entityId: req.params.id,
            before: orderToDelete,
            metadata: { orderNumber: orderToDelete.orderNumber },
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== ORDER SASHES =====
  router.get(
    "/orders/:orderId/sashes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const sashes = await storage.getOrderSashes(req.params.orderId);
        res.json(sashes);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/orders/:orderId/sashes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const sash = await storage.createOrderSash({
          ...sanitizeSashData(req.body),
          orderId: req.params.orderId,
        });
        res.json(sash);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== INSTALLMENT PLANS =====

  router.get(
    "/orders/:id/installment",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const plan = await storage.getInstallmentPlanByOrderId(req.params.id);
        res.json(plan);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/orders/:id/installment",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const order = await storage.getOrder(req.params.id);
        if (!order || order.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }
        const { downPayment = 0, months, paymentDay } = req.body;
        const totalAmount = parseFloat(order.salePrice?.toString() || "0");
        const dp = parseFloat(downPayment.toString());
        if (dp < 0 || dp >= totalAmount) return res.status(400).json({ message: "Некорректный первый взнос" });
        if (!months || months < 1 || months > 36) return res.status(400).json({ message: "Некорректное кол-во месяцев" });
        if (!paymentDay || paymentDay < 1 || paymentDay > 28) return res.status(400).json({ message: "День оплаты от 1 до 28" });

        const existingPlan = await storage.getInstallmentPlanByOrderId(order.id);
        if (existingPlan) await storage.deactivateInstallmentPlan(existingPlan.id);

        const remaining = totalAmount - dp;
        const monthlyRaw = Math.floor((remaining / months) * 100) / 100;
        const plan = await storage.createInstallmentPlan({
          orderId: order.id, totalAmount: totalAmount.toString(), downPayment: dp.toString(),
          months, paymentDay, monthlyPayment: monthlyRaw.toString(), userId: req.userId!,
        });

        const today = new Date();
        if (dp > 0) {
          await storage.createInstallmentPayment({
            planId: plan.id, paymentNumber: 0, dueDate: today.toISOString().split("T")[0],
            amount: dp.toString(), userId: req.userId!,
          });
        }
        let startMonth = today.getMonth() + 1;
        let startYear = today.getFullYear();
        if (today.getDate() > paymentDay) startMonth++;
        for (let i = 0; i < months; i++) {
          let m = startMonth + i, y = startYear;
          while (m > 12) { m -= 12; y++; }
          const amount = i === months - 1 ? remaining - monthlyRaw * (months - 1) : monthlyRaw;
          await storage.createInstallmentPayment({
            planId: plan.id, paymentNumber: i + 1,
            dueDate: `${y}-${String(m).padStart(2, "0")}-${String(paymentDay).padStart(2, "0")}`,
            amount: amount.toFixed(2), userId: req.userId!,
          });
        }
        const result = await storage.getInstallmentPlanByOrderId(order.id);
        res.json(result);
      } catch (error) {
        console.error("Installment create error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/installment-payments/:id/pay",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const payment = await storage.getInstallmentPayment(req.params.id);
        if (!payment || payment.userId !== req.userId) return res.status(404).json({ message: "Платёж не найден" });
        if (payment.isPaid) return res.status(400).json({ message: "Уже оплачен" });
        const { cashboxId } = req.body;
        if (!cashboxId) return res.status(400).json({ message: "Выберите кассу" });

        const [planRow] = await db.select().from(installmentPlansTable).where(eq(installmentPlansTable.id, payment.planId));
        if (!planRow) return res.status(404).json({ message: "План не найден" });
        const order = await storage.getOrder(planRow.orderId);

        const finOp = await storage.createFinanceOperation({
          type: "income",
          amount: payment.amount,
          operationType: "Оплата от покупателя", // платёж по рассрочке — оплата заказа
          date: new Date().toISOString().split("T")[0], cashboxId,
          dealerId: order?.dealerId || null,
          comment: `Рассрочка, платёж №${payment.paymentNumber} по заказу №${order?.orderNumber || "?"}`,
          userId: req.userId!,
        });
        await storage.markInstallmentPaymentPaid(payment.id, finOp.id, new Date().toISOString().split("T")[0]);
        res.json({ success: true });
      } catch (error) {
        console.error("Installment pay error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/installment-payments/:id/unpay",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const payment = await storage.getInstallmentPayment(req.params.id);
        if (!payment || payment.userId !== req.userId) return res.status(404).json({ message: "Платёж не найден" });
        if (!payment.isPaid) return res.status(400).json({ message: "Платёж не оплачен" });
        if (payment.financeOperationId) await storage.hardDeleteFinanceOperation(payment.financeOperationId);
        await storage.markInstallmentPaymentUnpaid(payment.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/orders/:id/installment",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const plan = await storage.getInstallmentPlanByOrderId(req.params.id);
        if (!plan) return res.status(404).json({ message: "План не найден" });
        await storage.deactivateInstallmentPlan(plan.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== CUTTING LAYOUTS =====

  // Кусок раскроя. width/height — габарит С припусками (по нему идёт укладка),
  // sashWidth/sashHeight — чистый размер створки, sideAllowance — запас с каждой
  // стороны по ширине, heightAllowance — запас по высоте, layers — число слоёв
  // полотна (2 для зебры), roomName — комната створки для подписи на чертеже.
  type CuttingPiece = {
    sashIndex: number;
    width: number;
    height: number;
    sashWidth: number;
    sashHeight: number;
    sideAllowance: number;
    heightAllowance: number;
    layers: number;
    roomName: string | null;
  };

  type CuttingInputPiece = {
    index: number;
    width: number;
    height: number;
    quantity: number;
    roomName: string | null;
  };

  const SIDE_ALLOWANCE_CM = 3;
  const HEIGHT_ALLOWANCE_CM = 20;

  function calculateOptimalCutting(
    pieces: CuttingInputPiece[],
    rollWidth: number,
    fabricType: string = "roll"
  ): {
    rows: Array<{
      rowIndex: number;
      cutLength: number;
      pieces: CuttingPiece[];
      usedWidth: number;
      wasteWidth: number;
    }>;
    totalLength: number;
    wastePercent: number;
  } {
    // Развернуть все куски по количеству.
    // Припуски: по 3 см с каждой стороны по ширине (итого 6 см), +20 см по высоте
    // (для зебры высота сначала удваивается — полотно идёт в два слоя).
    const layers = fabricType === "zebra" ? 2 : 1;
    const allPieces: CuttingPiece[] = [];
    for (const piece of pieces) {
      for (let i = 0; i < piece.quantity; i++) {
        allPieces.push({
          sashIndex: piece.index,
          width: piece.width + SIDE_ALLOWANCE_CM * 2,
          height: piece.height * layers + HEIGHT_ALLOWANCE_CM,
          sashWidth: piece.width,
          sashHeight: piece.height,
          sideAllowance: SIDE_ALLOWANCE_CM,
          heightAllowance: HEIGHT_ALLOWANCE_CM,
          layers,
          roomName: piece.roomName,
        });
      }
    }

    // Сортировка: сначала по высоте (убывание), потом по ширине (убывание)
    allPieces.sort((a, b) => b.height - a.height || b.width - a.width);

    const rows: Array<{
      rowIndex: number;
      cutLength: number;
      pieces: CuttingPiece[];
      usedWidth: number;
      wasteWidth: number;
    }> = [];

    const placed = new Set<number>();

    for (let i = 0; i < allPieces.length; i++) {
      if (placed.has(i)) continue;

      const piece = allPieces[i];
      const row: typeof rows[0] = {
        rowIndex: rows.length + 1,
        cutLength: piece.height,
        pieces: [{ ...piece }],
        usedWidth: piece.width,
        wasteWidth: rollWidth - piece.width,
      };
      placed.add(i);

      // Пытаемся добавить ещё куски в этот ряд
      for (let j = i + 1; j < allPieces.length; j++) {
        if (placed.has(j)) continue;
        const candidate = allPieces[j];

        // Кусок помещается по ширине и его высота <= высоте ряда (отрез идёт по максимальной)
        if (row.usedWidth + candidate.width <= rollWidth && candidate.height <= row.cutLength) {
          row.pieces.push({ ...candidate });
          row.usedWidth += candidate.width;
          row.wasteWidth = rollWidth - row.usedWidth;
          placed.add(j);
        }
      }

      rows.push(row);
    }

    const totalLength = rows.reduce((sum, r) => sum + r.cutLength, 0);
    const totalArea = rollWidth * totalLength;
    const usedArea = rows.reduce(
      (sum, r) => sum + r.pieces.reduce((s, p) => s + p.width * p.height, 0),
      0
    );
    const wastePercent = totalArea > 0 ? ((totalArea - usedArea) / totalArea) * 100 : 0;

    return { rows, totalLength, wastePercent };
  }

  type SkippedSash = {
    sashIndex: number;
    roomName: string | null;
    width: number;
    height: number;
    reason: "no_fabric" | "no_roll_width";
    fabricName?: string;
  };

  // Створки заказа, разложенные по тканям, плюс список того, что в раскрой не попадёт.
  async function collectCuttingInput(orderId: string, userId: string) {
    // Нумерация створок должна быть одинаковой при расчёте (POST) и при
    // чтении (GET), иначе номера на чертеже разойдутся с предупреждениями.
    // Запрос без ORDER BY порядок не гарантирует, поэтому сортируем сами.
    const sashes = (await storage.getOrderSashes(orderId)).sort(
      (a, b) => (a.room ?? 0) - (b.room ?? 0) || a.id.localeCompare(b.id)
    );
    const allFabrics = await storage.getFabrics(userId);
    const fabricGroups = new Map<string, CuttingInputPiece[]>();
    const skipped: SkippedSash[] = [];

    sashes.forEach((sash, i) => {
      const width = parseFloat(sash.width?.toString() || "0");
      const height = parseFloat(sash.height?.toString() || "0");
      const base = { sashIndex: i + 1, roomName: sash.roomName ?? null, width, height };
      if (!sash.fabricId) {
        skipped.push({ ...base, reason: "no_fabric" });
        return;
      }
      const fabric = allFabrics.find((f) => f.id === sash.fabricId);
      const rollWidth = parseFloat(fabric?.width?.toString() || "0");
      if (rollWidth <= 0) {
        skipped.push({ ...base, reason: "no_roll_width", fabricName: fabric?.name ?? sash.fabricName ?? undefined });
        return;
      }
      const group = fabricGroups.get(sash.fabricId) || [];
      group.push({
        index: i + 1,
        width,
        height,
        quantity: parseFloat((sash as any).quantity?.toString() || "1"),
        roomName: sash.roomName ?? null,
      });
      fabricGroups.set(sash.fabricId, group);
    });

    return { sashes, allFabrics, fabricGroups, skipped };
  }

  // Ответ для GET/POST: сохранённые раскрои + предупреждения + признак устаревания.
  async function buildCuttingResponse(orderId: string, userId: string) {
    const { allFabrics, fabricGroups, skipped } = await collectCuttingInput(orderId, userId);
    const layouts = await storage.getCuttingLayoutsByOrder(orderId);

    const results = await Promise.all(
      layouts.map(async (layout) => {
        const rows = await storage.getCuttingLayoutRows(layout.id);
        const fabric = allFabrics.find((f) => f.id === layout.fabricId);
        return {
          ...layout,
          fabricName: fabric?.name,
          fabricType: fabric?.fabricType ?? "roll",
          rows: rows.map((r) => ({
            ...r,
            pieces: JSON.parse(r.pieces) as Partial<CuttingPiece>[],
          })),
        };
      })
    );

    // Раскрой устарел, если набор створок (ткань + чистый размер) не совпадает
    // с тем, что было посчитано. Старый формат кусков (без sashWidth) считаем устаревшим.
    let isStale = false;
    if (results.length > 0) {
      const expected: string[] = [];
      for (const [fabricId, pieces] of Array.from(fabricGroups.entries())) {
        for (const p of pieces) {
          for (let i = 0; i < p.quantity; i++) expected.push(`${fabricId}|${p.width}|${p.height}`);
        }
      }
      const actual: string[] = [];
      for (const layout of results) {
        for (const row of layout.rows) {
          for (const p of row.pieces) {
            if (typeof p.sashWidth !== "number" || typeof p.sashHeight !== "number") {
              isStale = true;
            }
            actual.push(`${layout.fabricId}|${p.sashWidth}|${p.sashHeight}`);
          }
        }
      }
      if (!isStale) {
        isStale = expected.sort().join(",") !== actual.sort().join(",");
      }
    }

    const calculatedAt = results.reduce<Date | null>((min, l) => {
      const d = l.createdAt ? new Date(l.createdAt) : null;
      return d && (!min || d < min) ? d : min;
    }, null);

    return { layouts: results, skipped, isStale, calculatedAt };
  }

  // POST /api/orders/:orderId/cutting - рассчитать и сохранить раскрой
  router.post(
    "/orders/:orderId/cutting",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const orderId = req.params.orderId;
        const order = await storage.getOrder(orderId);
        if (!order || order.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }

        const { sashes, allFabrics, fabricGroups } = await collectCuttingInput(orderId, req.userId!);
        if (sashes.length === 0) {
          return res.status(400).json({ message: "В заказе нет створок" });
        }

        // Рулон должен вмещать самую широкую створку с припусками
        for (const [fabricId, pieces] of Array.from(fabricGroups.entries())) {
          const fabric = allFabrics.find((f) => f.id === fabricId);
          const rollWidth = parseFloat(fabric?.width?.toString() || "0");
          const widest = Math.max(...pieces.map((p) => p.width + SIDE_ALLOWANCE_CM * 2));
          if (widest > rollWidth) {
            return res.status(400).json({
              message: `Ткань «${fabric?.name ?? "?"}»: рулон ${rollWidth} см уже створки с припуском (${widest} см)`,
            });
          }
        }

        // Удаляем старый раскрой для этого заказа
        await storage.deleteCuttingLayoutsByOrder(orderId);

        for (const [fabricId, pieces] of Array.from(fabricGroups.entries())) {
          const fabric = allFabrics.find((f) => f.id === fabricId);
          const rollWidth = parseFloat(fabric?.width?.toString() || "0");

          const { rows, totalLength, wastePercent } = calculateOptimalCutting(pieces, rollWidth, fabric?.fabricType || "roll");

          const layout = await storage.createCuttingLayout({
            orderId,
            fabricId,
            rollWidth: rollWidth.toFixed(2),
            totalLength: totalLength.toFixed(2),
            wastePercent: wastePercent.toFixed(2),
            userId: req.userId!,
          });

          await storage.createCuttingLayoutRows(
            rows.map((r) => ({
              layoutId: layout.id,
              rowIndex: r.rowIndex,
              cutLength: r.cutLength.toFixed(2),
              pieces: JSON.stringify(r.pieces),
              usedWidth: r.usedWidth.toFixed(2),
              wasteWidth: r.wasteWidth.toFixed(2),
            }))
          );
        }

        res.json(await buildCuttingResponse(orderId, req.userId!));
      } catch (error) {
        console.error("Cutting layout error:", error);
        res.status(500).json({ message: "Ошибка расчёта раскроя" });
      }
    }
  );

  // GET /api/orders/:orderId/cutting - получить сохранённый раскрой
  router.get(
    "/orders/:orderId/cutting",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const order = await storage.getOrder(req.params.orderId);
        if (!order || order.userId !== req.userId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }
        res.json(await buildCuttingResponse(req.params.orderId, req.userId!));
      } catch (error) {
        console.error("Get cutting layout error:", error);
        res.status(500).json({ message: "Ошибка загрузки раскроя" });
      }
    }
  );

  // DELETE /api/orders/:orderId/cutting - удалить раскрой
  router.delete(
    "/orders/:orderId/cutting",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteCuttingLayoutsByOrder(req.params.orderId);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка удаления раскроя" });
      }
    }
  );

  // ---------- Производство как в УЭС: передача, готовность по створкам ----------

  const PRIORITIES = ["Обычно", "К утру", "Срочно"];

  async function ownedOrder(userId: string, orderId: string) {
    const order = await storage.getOrder(orderId);
    return order && order.userId === userId && !order.deletedAt ? order : null;
  }

  /** Очередь производства: все переданные створки неотгруженных заказов. */
  router.get("/production", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const r = await db.execute(sql`
        select s.id, s.order_id as "orderId", s.width, s.height, s.control_side as "controlSide",
          s.room, s.room_name as "roomName", s.production_status as "productionStatus",
          to_char(s.production_sent_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "sentAt", to_char(s.production_ready_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "readyAt",
          coalesce(sy.name, s.system_name) as "systemName",
          coalesce(f.name, s.fabric_name) as "fabricName",
          f.fabric_type as "fabricType",
          coalesce(fc.name, '') as "fabricColor",
          coalesce(sc.name, '') as "systemColor",
          o.order_number as "orderNumber", to_char(o.date, 'YYYY-MM-DD') as "orderDate", o.status as "orderStatus",
          coalesce(o.production_priority, 'Обычно') as priority, o.comment,
          d.full_name as "dealerName"
        from order_sashes s
        join orders o on o.id = s.order_id
        left join systems sy on sy.id = s.system_id
        left join fabrics f on f.id = s.fabric_id
        left join colors fc on fc.id = coalesce(s.fabric_color_id, f.color_id)
        left join colors sc on sc.id = coalesce(s.system_color_id, sy.color_id)
        left join dealers d on d.id = o.dealer_id
        where o.user_id = ${req.userId!} and o.deleted_at is null
          and s.production_status is not null and o.status <> 'Отгружен'
        order by o.order_number, s.room, s.production_sent_at, s.id
      `);
      res.json(r.rows);
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /** «Передать в производство»: все ещё не переданные изделия заказа. */
  router.post("/orders/:id/production/send", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const order = await ownedOrder(req.userId!, req.params.id);
      if (!order) return res.status(404).json({ message: "Заказ не найден" });
      if (order.status === "Отгружен") {
        return res.status(400).json({ message: "Заказ уже отгружен" });
      }
      const prod = (await storage.getOrderSashes(order.id)).filter(isProductionSash);
      if (!prod.length) {
        return res.status(400).json({ message: "В заказе нет изделий для производства" });
      }
      const unsent = prod.filter((s) => !s.productionStatus);
      if (!unsent.length) {
        return res.status(400).json({ message: "Все изделия уже переданы в производство" });
      }
      const priority = req.body?.priority;
      if (typeof priority === "string" && PRIORITIES.includes(priority)) {
        await db.update(ordersTable).set({ productionPriority: priority }).where(eq(ordersTable.id, order.id));
      }

      if ((order.status || "Новый") === "Новый") {
        const r = await applyOrderStatus(req.userId!, order.id, "В производстве");
        if (r.code !== 200) return res.status(r.code).json(r.body);
      } else {
        await db
          .update(orderSashesTable)
          .set({ productionStatus: "in_work", productionSentAt: new Date(), productionReadyAt: null })
          .where(and(eq(orderSashesTable.orderId, order.id), inArray(orderSashesTable.id, unsent.map((s) => s.id))));
        if (order.status === "Готов") {
          // Дозаказ в готовый заказ: выпуск отменяется, материалы спишутся при новой готовности.
          await storage.updateOrder(order.id, { status: "В производстве" });
          await storage.deleteWarehouseWriteoffsByOrderId(order.id);
        }
      }

      logAudit({
        userId: req.userId!,
        action: "update",
        entityType: "order",
        entityId: order.id,
        before: { production: "not_sent" },
        after: { production: "sent", sashes: unsent.length },
        metadata: { orderNumber: order.orderNumber },
      });
      res.json({ sent: unsent.length });
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  router.post("/orders/:id/production/priority", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const order = await ownedOrder(req.userId!, req.params.id);
      if (!order) return res.status(404).json({ message: "Заказ не найден" });
      const priority = req.body?.priority;
      if (!PRIORITIES.includes(priority)) return res.status(400).json({ message: "Неизвестная срочность" });
      await db.update(ordersTable).set({ productionPriority: priority }).where(eq(ordersTable.id, order.id));
      res.json({ ok: true });
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /**
   * Отметить готовность створок. Когда готово всё переданное и непереданного нет —
   * заказ становится «Готов» и материалы списываются (как выпуск продукции в УЭС).
   */
  async function markReady(userId: string, orderId: string, sashIds: string[] | "all") {
    const order = await ownedOrder(userId, orderId);
    if (!order) return reply(404, { message: "Заказ не найден" });
    if (order.status === "Отгружен") return reply(400, { message: "Заказ уже отгружен" });

    const prod = (await storage.getOrderSashes(orderId)).filter(isProductionSash);
    const target = prod.filter(
      (s) => s.productionStatus === "in_work" && (sashIds === "all" || sashIds.includes(s.id))
    );
    if (!target.length) return reply(400, { message: "Нет изделий в работе для отметки" });
    const ids = target.map((s) => s.id);

    await db
      .update(orderSashesTable)
      .set({ productionStatus: "ready", productionReadyAt: new Date() })
      .where(and(eq(orderSashesTable.orderId, orderId), inArray(orderSashesTable.id, ids)));

    const readyCount = prod.filter((s) => s.productionStatus === "ready").length + ids.length;
    if (readyCount === prod.length && order.status !== "Готов") {
      const r = await applyOrderStatus(userId, orderId, "Готов");
      if (r.code !== 200) {
        // Материалов не хватило — готовность не фиксируем.
        await db
          .update(orderSashesTable)
          .set({ productionStatus: "in_work", productionReadyAt: null })
          .where(and(eq(orderSashesTable.orderId, orderId), inArray(orderSashesTable.id, ids)));
        return r;
      }
    }
    return reply(200, { ready: ids.length, orderReady: readyCount === prod.length });
  }

  router.post("/production/sashes/:sashId/ready", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [sash] = await db.select().from(orderSashesTable).where(eq(orderSashesTable.id, req.params.sashId));
      if (!sash) return res.status(404).json({ message: "Изделие не найдено" });
      const r = await markReady(req.userId!, sash.orderId, [sash.id]);
      res.status(r.code).json(r.body);
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  router.post("/orders/:id/production/ready", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const r = await markReady(req.userId!, req.params.id, "all");
      res.status(r.code).json(r.body);
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /** «Отменить готовность»: створка возвращается в работу, выпуск заказа отменяется. */
  router.post("/production/sashes/:sashId/undo", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const [sash] = await db.select().from(orderSashesTable).where(eq(orderSashesTable.id, req.params.sashId));
      const order = sash ? await ownedOrder(req.userId!, sash.orderId) : null;
      if (!sash || !order) return res.status(404).json({ message: "Изделие не найдено" });
      if (order.status === "Отгружен") {
        return res.status(400).json({ message: "Заказ отгружен — готовность отменить нельзя" });
      }
      if (sash.productionStatus !== "ready") {
        return res.status(400).json({ message: "Изделие не отмечено готовым" });
      }
      await db
        .update(orderSashesTable)
        .set({ productionStatus: "in_work", productionReadyAt: null })
        .where(eq(orderSashesTable.id, sash.id));
      if (order.status === "Готов") {
        await storage.updateOrder(order.id, { status: "В производстве" });
        await storage.deleteWarehouseWriteoffsByOrderId(order.id);
        logAudit({
          userId: req.userId!,
          action: "status_change",
          entityType: "order",
          entityId: order.id,
          before: { status: "Готов" },
          after: { status: "В производстве" },
          metadata: { orderNumber: order.orderNumber, reason: "Отмена готовности" },
        });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  /** Связанные документы заказа: оплаты, списание материалов, производство. */
  router.get("/orders/:id/related", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order || order.userId !== req.userId) return res.status(404).json({ message: "Заказ не найден" });
      const payments = await db.execute(sql`
        select id, to_char(date, 'YYYY-MM-DD') as date, amount, is_draft as "isDraft", deleted_at as "deletedAt", comment
        from finance_operations
        where user_id = ${req.userId!} and type = 'income'
          and comment ilike ${"%№%" + order.orderNumber + "%"}
        order by date, id
      `);
      const paymentsExact = (payments.rows as any[]).filter((p) =>
        new RegExp(`№\\s*${order.orderNumber}(?!\\d)`).test(p.comment || "")
      );
      const writeoffs = await db.execute(sql`
        select to_char(min(date), 'YYYY-MM-DD') as date, count(*)::int as lines, coalesce(sum(total), 0) as total
        from warehouse_writeoffs where order_id = ${order.id}
      `);
      const prod = await db.execute(sql`
        select count(*)::int as total,
          count(*) filter (where production_status is not null)::int as sent,
          count(*) filter (where production_status = 'ready')::int as ready,
          to_char(min(production_sent_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "sentAt", to_char(max(production_ready_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "readyAt"
        from order_sashes where order_id = ${order.id} and ${PRODUCTION_SASH}
      `);
      const w = writeoffs.rows[0] as any;
      res.json({
        payments: paymentsExact,
        writeoff: Number(w?.lines) > 0 ? w : null,
        production: prod.rows[0],
        shippedAt: order.shippedAt,
      });
    } catch (error) {
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  return router;
}
