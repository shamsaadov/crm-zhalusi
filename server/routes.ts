import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
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

const JWT_SECRET = process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
const SALT_ROUNDS = 10;

interface AuthRequest extends Request {
  userId?: string;
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
  // Session configuration
  app.use(session({
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
      const systemList = await storage.getSystems(req.userId!);
      const fabricList = await storage.getFabrics(req.userId!);
      
      const enriched = orderList.map(order => ({
        ...order,
        dealer: dealerList.find(d => d.id === order.dealerId),
        system: systemList.find(s => s.id === order.systemId),
        fabric: fabricList.find(f => f.id === order.fabricId),
        dealerBalance: dealerList.find(d => d.id === order.dealerId)?.balance,
      }));
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/orders", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const orderNumber = await storage.getNextOrderNumber(req.userId!);
      const order = await storage.createOrder({
        ...req.body,
        orderNumber,
        userId: req.userId,
      });
      res.json(order);
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.patch("/api/orders/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const order = await storage.updateOrder(req.params.id, req.body);
      res.json(order);
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

  // ===== FINANCE OPERATIONS =====
  app.get("/api/finance", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const operations = await storage.getFinanceOperations(req.userId!);
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

  app.delete("/api/finance/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFinanceOperation(req.params.id);
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
      const fabricList = await storage.getFabrics(req.userId!);
      const componentList = await storage.getComponents(req.userId!);
      
      const enriched = receipts.map(r => ({
        ...r,
        supplier: supplierList.find(s => s.id === r.supplierId),
        fabric: fabricList.find(f => f.id === r.fabricId),
        component: componentList.find(c => c.id === r.componentId),
      }));
      
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  app.post("/api/warehouse", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const receipt = await storage.createWarehouseReceipt({
        ...req.body,
        userId: req.userId,
      });
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

  return httpServer;
}
