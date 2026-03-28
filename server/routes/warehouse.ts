import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { logAudit } from "../audit";

interface AuthRequest extends Request {
  userId?: string;
}

type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => void;

export function createWarehouseRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // ===== WAREHOUSE =====
  router.get(
    "/warehouse",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const cursor = req.query.cursor as string | undefined;
        const paginated = req.query.paginated === "true";
        const supplierId =
          typeof req.query.supplierId === "string" &&
          req.query.supplierId !== "all"
            ? req.query.supplierId
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

        const supplierList = await storage.getSuppliers(req.userId!);

        const enrichReceipt = async (r: any) => {
          const items = await storage.getWarehouseReceiptItems(r.id);
          return {
            ...r,
            supplier: supplierList.find((s) => s.id === r.supplierId),
            supplierBalance: supplierList.find((s) => s.id === r.supplierId)
              ?.balance,
            itemsCount: items.length,
          };
        };

        if (paginated) {
          const result = await storage.getWarehouseReceiptsPaginated(
            req.userId!,
            { limit, cursor },
            { supplierId, from, to, search }
          );

          const enriched = await Promise.all(result.data.map(enrichReceipt));

          res.json({
            data: enriched,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          });
        } else {
          // Legacy non-paginated response for backward compatibility
          const receipts = await storage.getWarehouseReceipts(req.userId!, {
            supplierId,
            from,
            to,
            search,
          });
          const enriched = await Promise.all(receipts.map(enrichReceipt));
          res.json(enriched);
        }
      } catch (error) {
        console.error("Warehouse list error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.get(
    "/warehouse/previous-price",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { itemType, itemId } = req.query;
        if (!itemType || !itemId) {
          return res.json({ price: null });
        }
        const price = await storage.getPreviousPrice(
          itemType as string,
          itemId as string
        );
        res.json({ price });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.get(
    "/warehouse/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const receipt = await storage.getWarehouseReceipt(req.params.id);
        if (!receipt) {
          return res.status(404).json({ message: "Поступление не найдено" });
        }
        const items = await storage.getWarehouseReceiptItems(receipt.id);
        const supplierList = await storage.getSuppliers(req.userId!);
        const fabricList = await storage.getFabrics(req.userId!);
        const componentList = await storage.getComponents(req.userId!);

        const enrichedItems = items.map((item) => ({
          ...item,
          fabric: fabricList.find((f) => f.id === item.fabricId),
          component: componentList.find((c) => c.id === item.componentId),
        }));

        res.json({
          ...receipt,
          supplier: supplierList.find((s) => s.id === receipt.supplierId),
          items: enrichedItems,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/warehouse",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { items, ...receiptData } = req.body;

        let total = 0;
        if (items && Array.isArray(items)) {
          total = items.reduce(
            (sum: number, item: any) => sum + parseFloat(item.total || "0"),
            0
          );
        }

        const receipt = await storage.createWarehouseReceipt({
          ...receiptData,
          total: total.toString(),
          userId: req.userId,
        });

        if (items && Array.isArray(items)) {
          for (const item of items) {
            await storage.createWarehouseReceiptItem({
              ...item,
              receiptId: receipt.id,
            });
          }
        }

        logAudit({
          userId: req.userId!,
          action: "create",
          entityType: "warehouse_receipt",
          entityId: receipt.id,
          after: receipt,
        });

        res.json(receipt);
      } catch (error) {
        console.error("Create warehouse error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.put(
    "/warehouse/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { items, ...receiptData } = req.body;

        let total = 0;
        if (items && Array.isArray(items)) {
          total = items.reduce(
            (sum: number, item: any) => sum + parseFloat(item.total || "0"),
            0
          );
        }

        const receipt = await storage.updateWarehouseReceipt(req.params.id, {
          ...receiptData,
          total: total.toString(),
        });

        if (!receipt) {
          return res.status(404).json({ message: "Поступление не найдено" });
        }

        // Delete old items and create new ones
        await storage.deleteWarehouseReceiptItemsByReceiptId(receipt.id);
        if (items && Array.isArray(items)) {
          for (const item of items) {
            await storage.createWarehouseReceiptItem({
              ...item,
              receiptId: receipt.id,
            });
          }
        }

        res.json(receipt);
      } catch (error) {
        console.error("Update warehouse error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/warehouse/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const before = await storage.getWarehouseReceipt(req.params.id);
        await storage.deleteWarehouseReceipt(req.params.id);

        if (before) {
          logAudit({
            userId: req.userId!,
            action: "delete",
            entityType: "warehouse_receipt",
            entityId: req.params.id,
            before,
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Stock levels endpoint
  router.get(
    "/stock",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const [receipts, fabrics, components, writeoffs] = await Promise.all([
          storage.getWarehouseReceipts(req.userId!),
          storage.getFabrics(req.userId!),
          storage.getComponents(req.userId!),
          storage.getWarehouseWriteoffs(req.userId!),
        ]);

        // Get all receipt items in parallel
        const itemsArrays = await Promise.all(
          receipts.map((receipt) =>
            storage.getWarehouseReceiptItems(receipt.id)
          )
        );
        const allItems = itemsArrays.flat();

        // Calculate fabric stock (receipts)
        const fabricStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            lastPrice: number;
            avgPrice: number;
            totalValue: number;
          }
        > = {};
        for (const item of allItems.filter((i) => i.fabricId)) {
          const fabricId = item.fabricId!;
          if (!fabricStock[fabricId]) {
            fabricStock[fabricId] = {
              quantity: 0,
              totalReceived: 0,
              lastPrice: 0,
              avgPrice: 0,
              totalValue: 0,
            };
          }
          const qty = parseFloat(item.quantity?.toString() || "0");
          const price = parseFloat(item.price?.toString() || "0");
          fabricStock[fabricId].quantity += qty;
          fabricStock[fabricId].totalReceived += qty;
          fabricStock[fabricId].lastPrice = price;
          fabricStock[fabricId].totalValue += qty * price;
        }

        // Subtract fabric writeoffs
        for (const wo of writeoffs.filter((w) => w.fabricId)) {
          const fabricId = wo.fabricId!;
          if (fabricStock[fabricId]) {
            const qty = parseFloat(wo.quantity?.toString() || "0");
            fabricStock[fabricId].quantity -= qty;
          }
        }

        // Calculate component stock (receipts)
        const componentStock: Record<
          string,
          {
            quantity: number;
            totalReceived: number;
            lastPrice: number;
            avgPrice: number;
            totalValue: number;
          }
        > = {};
        for (const item of allItems.filter((i) => i.componentId)) {
          const componentId = item.componentId!;
          if (!componentStock[componentId]) {
            componentStock[componentId] = {
              quantity: 0,
              totalReceived: 0,
              lastPrice: 0,
              avgPrice: 0,
              totalValue: 0,
            };
          }
          const qty = parseFloat(item.quantity?.toString() || "0");
          const price = parseFloat(item.price?.toString() || "0");
          componentStock[componentId].quantity += qty;
          componentStock[componentId].totalReceived += qty;
          componentStock[componentId].lastPrice = price;
          componentStock[componentId].totalValue += qty * price;
        }

        // Subtract component writeoffs
        for (const wo of writeoffs.filter((w) => w.componentId)) {
          const componentId = wo.componentId!;
          if (componentStock[componentId]) {
            const qty = parseFloat(wo.quantity?.toString() || "0");
            componentStock[componentId].quantity -= qty;
          }
        }

        // Calculate average prices (based on total receipts value / total received quantity)
        for (const id of Object.keys(fabricStock)) {
          if (fabricStock[id].totalReceived > 0) {
            fabricStock[id].avgPrice =
              fabricStock[id].totalValue / fabricStock[id].totalReceived;
          }
        }
        for (const id of Object.keys(componentStock)) {
          if (componentStock[id].totalReceived > 0) {
            componentStock[id].avgPrice =
              componentStock[id].totalValue / componentStock[id].totalReceived;
          }
        }

        // Build response with fabric/component details
        const fabricStockList = fabrics.map((f) => ({
          ...f,
          stock: fabricStock[f.id] || {
            quantity: 0,
            lastPrice: 0,
            avgPrice: 0,
            totalValue: 0,
          },
        }));

        const componentStockList = components.map((c) => ({
          ...c,
          stock: componentStock[c.id] || {
            quantity: 0,
            lastPrice: 0,
            avgPrice: 0,
            totalValue: 0,
          },
        }));

        res.json({
          fabrics: fabricStockList,
          components: componentStockList,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Warehouse writeoffs endpoint
  router.get(
    "/warehouse/writeoffs",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const [writeoffs, orders, fabrics, components] = await Promise.all([
          storage.getWarehouseWriteoffs(req.userId!),
          storage.getOrders(req.userId!),
          storage.getFabrics(req.userId!),
          storage.getComponents(req.userId!),
        ]);

        const writeoffsWithRelations = writeoffs.map((wo) => ({
          ...wo,
          order: orders.find((o) => o.id === wo.orderId),
          fabric: fabrics.find((f) => f.id === wo.fabricId),
          component: components.find((c) => c.id === wo.componentId),
        }));

        // Sort by date descending
        writeoffsWithRelations.sort(
          (a, b) =>
            new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
        );

        res.json(writeoffsWithRelations);
      } catch (error) {
        console.error("Get writeoffs error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Get inventory adjustments history
  router.get(
    "/stock/adjustments",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const [writeoffs, receipts, allFabrics, allComponents] =
          await Promise.all([
            storage.getWarehouseWriteoffs(req.userId!),
            storage.getWarehouseReceipts(req.userId!),
            storage.getFabrics(req.userId!),
            storage.getComponents(req.userId!),
          ]);

        const adjustments: {
          id: string;
          type: "increase" | "decrease";
          itemType: string;
          itemName: string;
          quantity: string;
          date: string;
          comment: string | null;
        }[] = [];

        // Get writeoffs without orderId (inventory adjustments - decreases)
        for (const wo of writeoffs.filter((w) => !w.orderId)) {
          const itemName = wo.fabricId
            ? allFabrics.find((f) => f.id === wo.fabricId)?.name
            : allComponents.find((c) => c.id === wo.componentId)?.name;

          adjustments.push({
            id: wo.id,
            type: "decrease",
            itemType: wo.itemType,
            itemName: itemName || "Неизвестно",
            quantity: wo.quantity?.toString() || "0",
            date: wo.date || "",
            comment: (wo as any).comment || null,
          });
        }

        // Get receipts without supplierId (inventory adjustments - increases)
        for (const receipt of receipts.filter((r) => !r.supplierId)) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          for (const item of items) {
            const itemName = item.fabricId
              ? allFabrics.find((f) => f.id === item.fabricId)?.name
              : allComponents.find((c) => c.id === item.componentId)?.name;

            adjustments.push({
              id: item.id,
              type: "increase",
              itemType: item.itemType || "unknown",
              itemName: itemName || "Неизвестно",
              quantity: item.quantity?.toString() || "0",
              date: receipt.date || "",
              comment: receipt.comment || null,
            });
          }
        }

        // Sort by date descending
        adjustments.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        res.json(adjustments);
      } catch (error) {
        console.error("Get adjustments error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Stock adjustment (inventory) endpoint
  router.post(
    "/stock/adjustment",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const {
          itemType,
          itemId,
          newQuantity,
          currentQuantity,
          price,
          comment,
        } = req.body;

        const newQty = parseFloat(newQuantity);
        const currentQty = parseFloat(currentQuantity.toString());
        const difference = newQty - currentQty;
        const itemPrice = parseFloat(price || "0");

        if (difference === 0) {
          return res.json({ success: true, message: "Без изменений" });
        }

        const today = new Date().toISOString().split("T")[0];
        const total = (Math.abs(difference) * itemPrice).toFixed(2);

        if (difference > 0) {
          // Need to add stock - create a receipt without supplier (adjustment)
          // First get a default supplier or create adjustment receipt
          const receipt = await storage.createWarehouseReceipt({
            date: today,
            supplierId: null,
            total: total,
            comment:
              comment ||
              `Инвентаризация: корректировка +${difference.toFixed(2)}`,
            userId: req.userId!,
          });

          await storage.createWarehouseReceiptItem({
            receiptId: receipt.id,
            itemType,
            fabricId: itemType === "fabric" ? itemId : null,
            componentId: itemType === "component" ? itemId : null,
            quantity: difference.toFixed(4),
            price: itemPrice.toFixed(2),
            total: total,
          });
        } else {
          // Need to reduce stock - create a writeoff
          await storage.createWarehouseWriteoff({
            orderId: null,
            itemType,
            fabricId: itemType === "fabric" ? itemId : null,
            componentId: itemType === "component" ? itemId : null,
            quantity: Math.abs(difference).toFixed(4),
            price: itemPrice.toFixed(2),
            total: total,
            date: today,
            userId: req.userId!,
            comment:
              comment ||
              `Инвентаризация: корректировка ${difference.toFixed(2)}`,
          });
        }

        res.json({ success: true });
      } catch (error) {
        console.error("Stock adjustment error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  return router;
}
