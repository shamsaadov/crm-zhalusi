import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import {
  loginSchema, registerSchema,
  colors, fabrics, dealers, cashboxes, systems,
  expenseTypes, components, multipliers, suppliers,
  orders, financeOperations, warehouseReceipts,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, sql, sum, desc } from "drizzle-orm";
import pg from "pg";

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
const SALT_ROUNDS = 10;

const PgSession = connectPgSimple(session);
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

interface AuthRequest extends Request {
  userId?: string;
}

declare module "express-session" {
  interface SessionData {
    token?: string;
  }
}

// Authentication middleware
function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.session?.token;
  if (!token) {
    return res.status(401).json({ message: "Не авторизован" });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: "Неверный токен" });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Session configuration with PostgreSQL store
  app.use(session({
    store: new PgSession({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: true,
    }),
    secret: JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }));

  // ===== AUTH ROUTES =====
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password, name } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ message: "Пользователь с таким email уже существует" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({ email, password: hashedPassword, name });
      
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      (req.session as any).token = token;
      
      res.json({ user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password } = parsed.data;
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(401).json({ message: "Неверный email или пароль" });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });
      (req.session as any).token = token;
      
      res.json({ user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {});
    res.json({ success: true });
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(401).json({ message: "Пользователь не найден" });
      }
      res.json({ user: { id: user.id, email: user.email, name: user.name } });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== COLORS =====
  app.get("/api/colors", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getColors(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/colors", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const color = await storage.createColor({ ...req.body, userId: req.userId });
      res.json(color);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/colors/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const color = await storage.updateColor(req.params.id, req.body);
      res.json(color);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/colors/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteColor(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== FABRICS =====
  app.get("/api/fabrics", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getFabrics(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/fabrics", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const fabric = await storage.createFabric({ ...req.body, userId: req.userId });
      res.json(fabric);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/fabrics/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const fabric = await storage.updateFabric(req.params.id, req.body);
      res.json(fabric);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/fabrics/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFabric(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== DEALERS =====
  app.get("/api/dealers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getDealers(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/dealers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const dealer = await storage.createDealer({ ...req.body, userId: req.userId });
      res.json(dealer);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/dealers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const dealer = await storage.updateDealer(req.params.id, req.body);
      res.json(dealer);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/dealers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteDealer(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== CASHBOXES =====
  app.get("/api/cashboxes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getCashboxes(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/cashboxes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const cashbox = await storage.createCashbox({ ...req.body, userId: req.userId });
      res.json(cashbox);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/cashboxes/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const cashbox = await storage.updateCashbox(req.params.id, req.body);
      res.json(cashbox);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/cashboxes/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteCashbox(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== SYSTEMS =====
  app.get("/api/systems", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getSystems(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/systems", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const system = await storage.createSystem({ ...req.body, userId: req.userId });
      res.json(system);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/systems/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const system = await storage.updateSystem(req.params.id, req.body);
      res.json(system);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/systems/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteSystem(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== EXPENSE TYPES =====
  app.get("/api/expense-types", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getExpenseTypes(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/expense-types", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const expenseType = await storage.createExpenseType({ ...req.body, userId: req.userId });
      res.json(expenseType);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/expense-types/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const expenseType = await storage.updateExpenseType(req.params.id, req.body);
      res.json(expenseType);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/expense-types/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteExpenseType(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== COMPONENTS =====
  app.get("/api/components", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getComponents(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/components", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const component = await storage.createComponent({ ...req.body, userId: req.userId });
      res.json(component);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/components/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const component = await storage.updateComponent(req.params.id, req.body);
      res.json(component);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/components/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteComponent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== MULTIPLIERS =====
  app.get("/api/multipliers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getMultipliers(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/multipliers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const multiplier = await storage.createMultiplier({ ...req.body, userId: req.userId });
      res.json(multiplier);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/multipliers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const multiplier = await storage.updateMultiplier(req.params.id, req.body);
      res.json(multiplier);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/multipliers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteMultiplier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== SUPPLIERS =====
  app.get("/api/suppliers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const data = await storage.getSuppliers(req.userId!);
      res.json(data);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/suppliers", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const supplier = await storage.createSupplier({ ...req.body, userId: req.userId });
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/suppliers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const supplier = await storage.updateSupplier(req.params.id, req.body);
      res.json(supplier);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/suppliers/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteSupplier(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== ORDERS =====
  app.get("/api/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const orderList = await storage.getOrders(req.userId!);
      const dealerList = await storage.getDealers(req.userId!);
      
      const enriched = await Promise.all(orderList.map(async order => {
        const sashes = await storage.getOrderSashes(order.id);
        return {
          ...order,
          dealer: dealerList.find(d => d.id === order.dealerId),
          dealerBalance: dealerList.find(d => d.id === order.dealerId)?.balance,
          sashesCount: sashes.length,
        };
      }));
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.get("/api/orders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      const sashes = await storage.getOrderSashes(order.id);
      const dealerList = await storage.getDealers(req.userId!);
      const systemList = await storage.getSystems(req.userId!);
      const fabricList = await storage.getFabrics(req.userId!);
      const colorList = await storage.getColors(req.userId!);
      
      const enrichedSashes = sashes.map(sash => ({
        ...sash,
        system: systemList.find(s => s.id === sash.systemId),
        systemColor: colorList.find(c => c.id === sash.systemColorId),
        fabric: fabricList.find(f => f.id === sash.fabricId),
        fabricColor: colorList.find(c => c.id === sash.fabricColorId),
      }));
      
      res.json({
        ...order,
        dealer: dealerList.find(d => d.id === order.dealerId),
        sashes: enrichedSashes,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { sashes, ...orderData } = req.body;
      const orderNumber = await storage.getNextOrderNumber(req.userId!);
      
      const order = await storage.createOrder({
        ...orderData,
        orderNumber,
        userId: req.userId,
      });
      
      if (sashes && Array.isArray(sashes)) {
        for (const sash of sashes) {
          await storage.createOrderSash({
            ...sash,
            orderId: order.id,
          });
        }
      }
      
      res.json(order);
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/orders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { sashes, ...orderData } = req.body;
      const order = await storage.updateOrder(req.params.id, orderData);
      
      if (sashes && Array.isArray(sashes)) {
        await storage.deleteOrderSashesByOrderId(req.params.id);
        for (const sash of sashes) {
          await storage.createOrderSash({
            ...sash,
            orderId: req.params.id,
          });
        }
      }
      
      res.json(order);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/orders/:id/status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body;
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: "Заказ не найден" });
      }
      
      const oldStatus = order.status;
      let dealerDebt = parseFloat(order.dealerDebt?.toString() || "0");
      
      if (status === "В производстве" && oldStatus === "Новый") {
        dealerDebt = parseFloat(order.salePrice?.toString() || "0");
      }
      
      const updated = await storage.updateOrder(req.params.id, { status, dealerDebt: dealerDebt.toString() });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/orders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteOrder(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== ORDER SASHES =====
  app.get("/api/orders/:orderId/sashes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sashes = await storage.getOrderSashes(req.params.orderId);
      res.json(sashes);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/orders/:orderId/sashes", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const sash = await storage.createOrderSash({
        ...req.body,
        orderId: req.params.orderId,
      });
      res.json(sash);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== FINANCE OPERATIONS =====
  app.get("/api/finance", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const includeDrafts = req.query.includeDrafts === "true";
      const operations = await storage.getFinanceOperations(req.userId!, includeDrafts);
      const dealerList = await storage.getDealers(req.userId!);
      const supplierList = await storage.getSuppliers(req.userId!);
      const cashboxList = await storage.getCashboxes(req.userId!);
      const expenseTypeList = await storage.getExpenseTypes(req.userId!);
      
      const enriched = operations.map(op => ({
        ...op,
        dealer: dealerList.find(d => d.id === op.dealerId),
        supplier: supplierList.find(s => s.id === op.supplierId),
        cashbox: cashboxList.find(c => c.id === op.cashboxId),
        fromCashbox: cashboxList.find(c => c.id === op.fromCashboxId),
        toCashbox: cashboxList.find(c => c.id === op.toCashboxId),
        expenseType: expenseTypeList.find(e => e.id === op.expenseTypeId),
      }));
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.get("/api/finance/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operation = await storage.getFinanceOperation(req.params.id);
      if (!operation) {
        return res.status(404).json({ message: "Операция не найдена" });
      }
      res.json(operation);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/finance", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operation = await storage.createFinanceOperation({
        ...req.body,
        userId: req.userId,
      });
      res.json(operation);
    } catch (error) {
      console.error("Create finance error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/finance/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operation = await storage.updateFinanceOperation(req.params.id, req.body);
      res.json(operation);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/finance/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.softDeleteFinanceOperation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/finance/:id/restore", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operation = await storage.restoreFinanceOperation(req.params.id);
      res.json(operation);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/finance/:id/hard", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.hardDeleteFinanceOperation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== WAREHOUSE =====
  app.get("/api/warehouse", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const receipts = await storage.getWarehouseReceipts(req.userId!);
      const supplierList = await storage.getSuppliers(req.userId!);
      
      const enriched = await Promise.all(receipts.map(async r => {
        const items = await storage.getWarehouseReceiptItems(r.id);
        return {
          ...r,
          supplier: supplierList.find(s => s.id === r.supplierId),
          supplierBalance: supplierList.find(s => s.id === r.supplierId)?.balance,
          itemsCount: items.length,
        };
      }));
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.get("/api/warehouse/previous-price", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { itemType, itemId } = req.query;
      if (!itemType || !itemId) {
        return res.json({ price: null });
      }
      const price = await storage.getPreviousPrice(itemType as string, itemId as string);
      res.json({ price });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.get("/api/warehouse/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const receipt = await storage.getWarehouseReceipt(req.params.id);
      if (!receipt) {
        return res.status(404).json({ message: "Поступление не найдено" });
      }
      const items = await storage.getWarehouseReceiptItems(receipt.id);
      const supplierList = await storage.getSuppliers(req.userId!);
      const fabricList = await storage.getFabrics(req.userId!);
      const componentList = await storage.getComponents(req.userId!);
      
      const enrichedItems = items.map(item => ({
        ...item,
        fabric: fabricList.find(f => f.id === item.fabricId),
        component: componentList.find(c => c.id === item.componentId),
      }));
      
      res.json({
        ...receipt,
        supplier: supplierList.find(s => s.id === receipt.supplierId),
        items: enrichedItems,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/warehouse", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { items, ...receiptData } = req.body;
      
      let total = 0;
      if (items && Array.isArray(items)) {
        total = items.reduce((sum: number, item: any) => sum + parseFloat(item.total || "0"), 0);
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
      
      res.json(receipt);
    } catch (error) {
      console.error("Create warehouse error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.delete("/api/warehouse/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteWarehouseReceipt(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== REPORTS =====
  
  // DDS Report (Cash Flow)
  app.get("/api/reports/dds", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operations = await storage.getFinanceOperations(req.userId!);
      
      const totalIncome = operations
        .filter(op => op.type === "income")
        .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);
      
      const totalExpense = operations
        .filter(op => op.type === "expense")
        .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);
      
      const totalSupplierPayments = operations
        .filter(op => op.type === "supplier_payment")
        .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);
      
      const totalTransfers = operations
        .filter(op => op.type === "transfer")
        .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);
      
      const netFlow = totalIncome - totalExpense - totalSupplierPayments;
      
      res.json({
        totalIncome,
        totalExpense,
        totalSupplierPayments,
        totalTransfers,
        netFlow,
        operations,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // Profit Report
  app.get("/api/reports/profit", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const orderList = await storage.getOrders(req.userId!);
      const dealerList = await storage.getDealers(req.userId!);
      
      const enrichedOrders = orderList.map(order => ({
        ...order,
        dealer: dealerList.find(d => d.id === order.dealerId),
      }));
      
      const totalSales = orderList.reduce(
        (sum, order) => sum + parseFloat(order.salePrice?.toString() || "0"),
        0
      );
      
      const totalCost = orderList.reduce(
        (sum, order) => sum + parseFloat(order.costPrice?.toString() || "0"),
        0
      );
      
      const grossProfit = totalSales - totalCost;
      const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;
      
      res.json({
        totalSales,
        totalCost,
        grossProfit,
        profitMargin,
        orders: enrichedOrders,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // AR/AP Report (Accounts Receivable / Payable)
  app.get("/api/reports/ar-ap", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const dealerList = await storage.getDealers(req.userId!);
      const supplierList = await storage.getSuppliers(req.userId!);
      
      // AR = dealers who owe us (negative balance)
      const totalAR = dealerList
        .filter(d => d.balance < 0)
        .reduce((sum, d) => sum + Math.abs(d.balance), 0);
      
      // AP = suppliers we owe (positive balance)
      const totalAP = supplierList
        .filter(s => s.balance > 0)
        .reduce((sum, s) => sum + s.balance, 0);
      
      res.json({
        dealers: dealerList,
        suppliers: supplierList,
        totalAR,
        totalAP,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // Cash Total Report
  app.get("/api/reports/cash-total", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const cashboxList = await storage.getCashboxes(req.userId!);
      const totalBalance = cashboxList.reduce((sum, c) => sum + c.balance, 0);
      
      res.json({
        cashboxes: cashboxList,
        totalBalance,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // ===== PROFILE =====
  app.get("/api/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        hasReportPassword: !!user.reportPassword,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/profile", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { email, name, currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      
      const updateData: any = {};
      if (email) updateData.email = email;
      if (name !== undefined) updateData.name = name;
      
      if (newPassword) {
        if (!currentPassword) {
          return res.status(400).json({ message: "Введите текущий пароль" });
        }
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
          return res.status(400).json({ message: "Неверный текущий пароль" });
        }
        updateData.password = await bcrypt.hash(newPassword, SALT_ROUNDS);
      }
      
      const updated = await storage.updateUser(req.userId!, updateData);
      res.json({
        id: updated?.id,
        email: updated?.email,
        name: updated?.name,
        hasReportPassword: !!updated?.reportPassword,
      });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/profile/report-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { reportPassword } = req.body;
      const hashedPassword = reportPassword ? await bcrypt.hash(reportPassword, SALT_ROUNDS) : null;
      await storage.updateUser(req.userId!, { reportPassword: hashedPassword });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/verify-report-password", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { password } = req.body;
      const user = await storage.getUser(req.userId!);
      if (!user) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (!user.reportPassword) {
        return res.json({ valid: true });
      }
      const valid = await bcrypt.compare(password, user.reportPassword);
      res.json({ valid });
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  return httpServer;
}
