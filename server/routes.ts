import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import https from "https";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import {
  loginSchema,
  registerSchema,
  colors,
  fabrics,
  dealers,
  cashboxes,
  systems,
  components,
  suppliers,
  orders,
  financeOperations,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql, desc, sum } from "drizzle-orm";
import pg from "pg";
import { logAudit } from "./audit";
import { generatePeriodicNotifications } from "./notifications";
import { createDealerMobileRouter } from "./routes/dealer-mobile";
import { createReferencesRouter } from "./routes/references";
import { createFinanceRouter } from "./routes/finance";
import { createWarehouseRouter } from "./routes/warehouse";
import { createOrdersRouter } from "./routes/orders";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required");
}
const JWT_SECRET = process.env.SESSION_SECRET;
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
    reportAccessGranted?: boolean;
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
  const isProduction = process.env.NODE_ENV === "production";
  app.use(
    session({
      store: new PgSession({
        pool: pgPool,
        tableName: "session",
        createTableIfMissing: true,
      }),
      secret: JWT_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction, // true in production (HTTPS)
        httpOnly: true,
        sameSite: "lax", // "lax" works for same-origin (frontend + API on same domain)
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // ===== AUTH ROUTES =====
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ message: parsed.error.errors[0].message });
      }

      const { email, password, name } = parsed.data;
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res
          .status(400)
          .json({ message: "Пользователь с таким email уже существует" });
      }

      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        name,
      });

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "7d",
      });
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
        return res
          .status(400)
          .json({ message: parsed.error.errors[0].message });
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

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "7d",
      });
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

  app.get(
    "/api/auth/me",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(401).json({ message: "Пользователь не найден" });
        }
        res.json({ user: { id: user.id, email: user.email, name: user.name } });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== DEALERS =====
  app.get(
    "/api/dealers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getDealers(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/dealers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = { ...req.body, userId: req.userId };
        if (data.password) {
          data.password = await bcrypt.hash(data.password, 10);
        } else {
          delete data.password;
        }
        const dealer = await storage.createDealer(data);
        res.json(dealer);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/dealers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = { ...req.body };
        if (data.password) {
          data.password = await bcrypt.hash(data.password, 10);
        } else {
          delete data.password;
        }
        const dealer = await storage.updateDealer(req.params.id, data);
        res.json(dealer);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/dealers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteDealer(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Dealer stats for quick view
  app.get(
    "/api/dealers/:id/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const orders = await storage.getOrders(req.userId!);
        const financeOps = await storage.getFinanceOperations(req.userId!, false);

        const dealerOrders = orders.filter((o) => o.dealerId === req.params.id);
        const dealerPayments = financeOps.filter(
          (op) => op.type === "income" && op.dealerId === req.params.id
        );

        const totalOrders = dealerOrders.length;
        const totalSales = dealerOrders.reduce(
          (sum, o) => sum + parseFloat(o.salePrice?.toString() || "0"),
          0
        );
        const totalPaid = dealerPayments.reduce(
          (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
          0
        );

        // Get dealer opening balance
        const dealer = await storage.getDealer(req.params.id);
        const openingBalance = parseFloat(dealer?.openingBalance?.toString() || "0");

        // Balance = payments - sales + opening balance (negative = owes us)
        const balance = totalPaid - totalSales + openingBalance;

        // Find last order date
        const lastOrderDate = dealerOrders.length > 0
          ? dealerOrders.sort((a, b) => b.date.localeCompare(a.date))[0].date
          : null;

        res.json({
          totalOrders,
          totalSales,
          balance,
          lastOrderDate,
        });
      } catch (error) {
        console.error("Dealer stats error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );


  // ===== REPORTS =====

  // DDS Report (Cash Flow)
  app.get(
    "/api/reports/dds",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const from =
          typeof req.query.from === "string" && req.query.from.length > 0
            ? req.query.from
            : undefined;
        const to =
          typeof req.query.to === "string" && req.query.to.length > 0
            ? req.query.to
            : undefined;
        const cashboxId =
          typeof req.query.cashboxId === "string" &&
          req.query.cashboxId !== "all"
            ? req.query.cashboxId
            : undefined;

        const operations = await storage.getFinanceOperations(
          req.userId!,
          false,
          { from, to, cashboxId }
        );
        const expenseTypeList = await storage.getExpenseTypes(req.userId!);

        const totalIncome = operations
          .filter((op) => op.type === "income")
          .reduce(
            (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
            0
          );

        const totalExpense = operations
          .filter((op) => op.type === "expense")
          .reduce(
            (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
            0
          );

        const totalSupplierPayments = operations
          .filter((op) => op.type === "supplier_payment")
          .reduce(
            (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
            0
          );

        const totalTransfers = operations
          .filter((op) => op.type === "transfer")
          .reduce(
            (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
            0
          );

        const netFlow = totalIncome - totalExpense - totalSupplierPayments;

        // Group expenses by expense type
        const expensesByType: Record<
          string,
          {
            expenseTypeId: string;
            expenseTypeName: string;
            total: number;
            count: number;
          }
        > = {};

        operations
          .filter((op) => op.type === "expense")
          .forEach((op) => {
            const typeId = op.expenseTypeId || "no_type";
            const expenseType = expenseTypeList.find(
              (e) => e.id === op.expenseTypeId
            );
            const typeName = expenseType?.name || "Без категории";

            if (!expensesByType[typeId]) {
              expensesByType[typeId] = {
                expenseTypeId: typeId,
                expenseTypeName: typeName,
                total: 0,
                count: 0,
              };
            }
            expensesByType[typeId].total += parseFloat(
              op.amount?.toString() || "0"
            );
            expensesByType[typeId].count += 1;
          });

        const expenseGroups = Object.values(expensesByType).sort(
          (a, b) => b.total - a.total
        );

        res.json({
          totalIncome,
          totalExpense,
          totalSupplierPayments,
          totalTransfers,
          netFlow,
          operations,
          expenseGroups,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Profit Report
  app.get(
    "/api/reports/profit",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
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

        const orderList = await storage.getOrders(req.userId!, {
          status: status || "Отгружен", // по умолчанию считаем только отгруженные
          dealerId,
          from,
          to,
          search,
        });
        const dealerList = await storage.getDealers(req.userId!);

        const enrichedOrders = orderList.map((order) => ({
          ...order,
          dealer: dealerList.find((d) => d.id === order.dealerId),
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
        const profitMargin =
          totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

        res.json({
          totalSales,
          totalCost,
          grossProfit,
          profitMargin,
          orders: enrichedOrders,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // AR/AP Report (Accounts Receivable / Payable)
  app.get(
    "/api/reports/ar-ap",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const dealerList = await storage.getDealers(req.userId!);
        const supplierList = await storage.getSuppliers(req.userId!);

        // Calculate shipped-only balance for each dealer
        const dealersWithShipped = await Promise.all(
          dealerList.map(async (dealer) => {
            const shippedTotals = await db
              .select({ total: sum(orders.salePrice) })
              .from(orders)
              .where(
                and(
                  eq(orders.dealerId, dealer.id),
                  eq(orders.userId, req.userId!),
                  eq(orders.status, "Отгружен")
                )
              );

            const paymentTotals = await db
              .select({ total: sum(financeOperations.amount) })
              .from(financeOperations)
              .where(
                and(
                  eq(financeOperations.dealerId, dealer.id),
                  eq(financeOperations.type, "income"),
                  eq(financeOperations.isDraft, false)
                )
              );

            const opening = parseFloat(dealer.openingBalance?.toString() || "0");
            const shippedTotal = parseFloat(shippedTotals[0]?.total?.toString() || "0");
            const paymentTotal = parseFloat(paymentTotals[0]?.total?.toString() || "0");
            const shippedBalance = -(opening + shippedTotal - paymentTotal);

            return { ...dealer, shippedBalance };
          })
        );

        // AR = dealers who owe us (negative balance = with all orders)
        const totalAR = dealerList
          .filter((d) => d.balance < 0)
          .reduce((sum, d) => sum + Math.abs(d.balance), 0);

        // AR shipped only
        const totalARShipped = dealersWithShipped
          .filter((d) => d.shippedBalance < 0)
          .reduce((sum, d) => sum + Math.abs(d.shippedBalance), 0);

        // AP = suppliers we owe (positive balance)
        const totalAP = supplierList
          .filter((s) => s.balance > 0)
          .reduce((sum, s) => sum + s.balance, 0);

        res.json({
          dealers: dealersWithShipped,
          suppliers: supplierList,
          totalAR,
          totalARShipped,
          totalAP,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Cash Total Report
  app.get(
    "/api/reports/cash-total",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const cashboxList = await storage.getCashboxes(req.userId!);
        const totalBalance = cashboxList.reduce((sum, c) => sum + c.balance, 0);

        res.json({
          cashboxes: cashboxList,
          totalBalance,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== PROFILE =====
  app.get(
    "/api/profile",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
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
          createdAt: user.createdAt,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/profile",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { email, name, currentPassword, newPassword } = req.body;
        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(404).json({ message: "Пользователь не найден" });
        }

        const updateData: any = {};
        
        // Проверка пароля при смене email
        if (email && email !== user.email) {
          if (!currentPassword) {
            return res.status(400).json({ message: "Введите текущий пароль для смены email" });
          }
          const valid = await bcrypt.compare(currentPassword, user.password);
          if (!valid) {
            return res.status(400).json({ message: "Неверный текущий пароль" });
          }
          updateData.email = email;
        }
        
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
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/profile/report-password",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { reportPassword, currentPassword } = req.body;
        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(404).json({ message: "Пользователь не найден" });
        }
        
        // Требуем пароль аккаунта для установки/изменения пароля отчётов
        if (!currentPassword) {
          return res.status(400).json({ message: "Введите текущий пароль" });
        }
        const valid = await bcrypt.compare(currentPassword, user.password);
        if (!valid) {
          return res.status(400).json({ message: "Неверный текущий пароль" });
        }
        
        const hashedPassword = reportPassword
          ? await bcrypt.hash(reportPassword, SALT_ROUNDS)
          : null;
        await storage.updateUser(req.userId!, {
          reportPassword: hashedPassword,
        });
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/verify-report-password",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { password } = req.body;
        const user = await storage.getUser(req.userId!);
        if (!user) {
          return res.status(404).json({ message: "Пользователь не найден" });
        }
        if (!user.reportPassword) {
          req.session.reportAccessGranted = true;
          return res.json({ valid: true });
        }
        const valid = await bcrypt.compare(password, user.reportPassword);
        if (valid) {
          req.session.reportAccessGranted = true;
        }
        res.json({ valid });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== GLOBAL SEARCH =====
  app.get(
    "/api/search",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const query = (req.query.q as string || "").trim().toLowerCase();

        if (!query || query.length < 2) {
          return res.json({ orders: [], dealers: [], suppliers: [] });
        }

        const [orders, dealers, suppliers] = await Promise.all([
          storage.getOrders(req.userId!),
          storage.getDealers(req.userId!),
          storage.getSuppliers(req.userId!),
        ]);

        // Поиск по заказам (по номеру)
        const filteredOrders = orders
          .filter((o) =>
            o.orderNumber?.toString().includes(query) ||
            dealers.find(d => d.id === o.dealerId)?.fullName.toLowerCase().includes(query)
          )
          .slice(0, 10)
          .map((o) => ({
            ...o,
            dealer: dealers.find((d) => d.id === o.dealerId),
          }));

        // Поиск по дилерам
        const filteredDealers = dealers
          .filter((d) =>
            d.fullName.toLowerCase().includes(query) ||
            d.city?.toLowerCase().includes(query) ||
            d.phone?.includes(query)
          )
          .slice(0, 10);

        // Поиск по поставщикам
        const filteredSuppliers = suppliers
          .filter((s) =>
            s.name.toLowerCase().includes(query) ||
            s.phone?.includes(query)
          )
          .slice(0, 10);

        res.json({
          orders: filteredOrders,
          dealers: filteredDealers,
          suppliers: filteredSuppliers,
        });
      } catch (error) {
        console.error("Search error:", error);
        res.status(500).json({ message: "Ошибка поиска" });
      }
    }
  );

  // ===== DASHBOARD =====
  app.get(
    "/api/dashboard",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const year =
          parseInt(req.query.year as string) || new Date().getFullYear();
        const month =
          parseInt(req.query.month as string) || new Date().getMonth() + 1;

        // Calculate date range for the month
        const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const endDate = `${year}-${String(month).padStart(2, "0")}-${String(
          lastDay
        ).padStart(2, "0")}`;

        const today = new Date().toISOString().split("T")[0];

        // Get all necessary data
        const [
          allOrders,
          allDealers,
          allFabrics,
          allComponents,
          receipts,
          writeoffs,
        ] = await Promise.all([
          storage.getOrders(req.userId!),
          storage.getDealers(req.userId!),
          storage.getFabrics(req.userId!),
          storage.getComponents(req.userId!),
          storage.getWarehouseReceipts(req.userId!),
          storage.getWarehouseWriteoffs(req.userId!),
        ]);

        // Filter orders for the selected month
        const monthOrders = allOrders.filter((order) => {
          const orderDate = order.date;
          return orderDate >= startDate && orderDate <= endDate;
        });

        // Get today's orders
        const todayOrders = allOrders.filter((order) => order.date === today);

        // Get orders in progress (Новый, В производстве)
        const inProgressOrders = allOrders.filter(
          (order) =>
            order.status === "Новый" || order.status === "В производстве"
        );

        // Get overdue orders (status not Отгружен and older than 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const overdueDate = sevenDaysAgo.toISOString().split("T")[0];

        const overdueOrders = allOrders.filter(
          (order) => order.status !== "Отгружен" && order.date < overdueDate
        );

        // Calculate monthly sales
        const monthlySales = monthOrders.reduce(
          (sum, order) => sum + parseFloat(order.salePrice?.toString() || "0"),
          0
        );

        // Calculate sashes count for the month
        let totalSashesCount = 0;
        for (const order of monthOrders) {
          const sashes = await storage.getOrderSashes(order.id);
          // Count only sashes that have systemId (actual sash orders, not product orders)
          const sashCount = sashes.filter((s) => s.systemId).length;
          totalSashesCount += sashCount;
        }

        // Get shipped orders for the month (sold products)
        const shippedMonthOrders = monthOrders.filter(
          (order) => order.status === "Отгружен"
        );
        let soldSashesCount = 0;
        for (const order of shippedMonthOrders) {
          const sashes = await storage.getOrderSashes(order.id);
          const sashCount = sashes.filter((s) => s.systemId).length;
          soldSashesCount += sashCount;
        }

        // Calculate overdue payments (dealers with negative balance)
        const overduePayments = allDealers.filter((d) => d.balance < 0);
        const totalOverduePayments = overduePayments.reduce(
          (sum, d) => sum + Math.abs(d.balance),
          0
        );

        // Calculate stock levels and find low stock items
        const receiptItems: {
          fabricId?: string | null;
          componentId?: string | null;
          quantity: string;
          price: string;
        }[] = [];
        for (const receipt of receipts) {
          const items = await storage.getWarehouseReceiptItems(receipt.id);
          receiptItems.push(
            ...items.map((item) => ({
              fabricId: item.fabricId,
              componentId: item.componentId,
              quantity: item.quantity?.toString() || "0",
              price: item.price?.toString() || "0",
            }))
          );
        }

        // Calculate fabric stock
        const fabricStock: Record<
          string,
          { quantity: number; lastPrice: number }
        > = {};
        for (const item of receiptItems.filter((i) => i.fabricId)) {
          const fabricId = item.fabricId!;
          if (!fabricStock[fabricId]) {
            fabricStock[fabricId] = { quantity: 0, lastPrice: 0 };
          }
          fabricStock[fabricId].quantity += parseFloat(item.quantity);
          fabricStock[fabricId].lastPrice = parseFloat(item.price);
        }
        // Subtract writeoffs
        for (const wo of writeoffs.filter((w) => w.fabricId)) {
          if (fabricStock[wo.fabricId!]) {
            fabricStock[wo.fabricId!].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }

        // Calculate component stock
        const componentStock: Record<
          string,
          { quantity: number; lastPrice: number }
        > = {};
        for (const item of receiptItems.filter((i) => i.componentId)) {
          const componentId = item.componentId!;
          if (!componentStock[componentId]) {
            componentStock[componentId] = { quantity: 0, lastPrice: 0 };
          }
          componentStock[componentId].quantity += parseFloat(item.quantity);
          componentStock[componentId].lastPrice = parseFloat(item.price);
        }
        // Subtract writeoffs
        for (const wo of writeoffs.filter((w) => w.componentId)) {
          if (componentStock[wo.componentId!]) {
            componentStock[wo.componentId!].quantity -= parseFloat(
              wo.quantity?.toString() || "0"
            );
          }
        }

        // Find low stock items (below minimum threshold of 5 for fabrics, 10 for components)
        const lowStockItems: {
          name: string;
          quantity: number;
          minQuantity: number;
          unit: string;
          lastPrice: number;
        }[] = [];

        for (const fabric of allFabrics) {
          const stock = fabricStock[fabric.id];
          const quantity = stock?.quantity || 0;
          const minQuantity = 5; // Default minimum for fabrics
          if (quantity < minQuantity) {
            lowStockItems.push({
              name: fabric.name,
              quantity: Math.round(quantity * 100) / 100,
              minQuantity,
              unit: "м²",
              lastPrice: stock?.lastPrice || 0,
            });
          }
        }

        for (const component of allComponents) {
          const stock = componentStock[component.id];
          const quantity = stock?.quantity || 0;
          const minQuantity = 10; // Default minimum for components
          if (quantity < minQuantity) {
            lowStockItems.push({
              name: component.name,
              quantity: Math.round(quantity * 100) / 100,
              minQuantity,
              unit: component.unit || "шт",
              lastPrice: stock?.lastPrice || 0,
            });
          }
        }

        // Format overdue orders for response
        const overdueOrdersList = overdueOrders.slice(0, 10).map((order) => {
          const dealer = allDealers.find((d) => d.id === order.dealerId);
          const dueDate = new Date(order.date);
          dueDate.setDate(dueDate.getDate() + 7);
          return {
            orderNumber: order.orderNumber,
            dealer: dealer?.fullName || "Без дилера",
            date: order.date,
            dueDate: dueDate.toISOString().split("T")[0],
            status: order.status || "Новый",
            amount: parseFloat(order.salePrice?.toString() || "0"),
          };
        });

        res.json({
          lowStock: lowStockItems.slice(0, 10),
          orders: {
            today: todayOrders.length,
            inProgress: inProgressOrders.length,
            overdue: overdueOrders.length,
          },
          salesMonth: {
            ordersCount: monthOrders.length,
            totalAmount: monthlySales,
          },
          sashes: {
            created: totalSashesCount,
            sold: soldSashesCount,
          },
          overduePayments: {
            totalAmount: totalOverduePayments,
            count: overduePayments.length,
          },
          overdueOrders: overdueOrdersList,
          period: {
            year,
            month,
            startDate,
            endDate,
          },
        });
      } catch (error) {
        console.error("Dashboard error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Dashboard Charts Data (last 6 months)
  app.get(
    "/api/dashboard/charts",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const allOrders = await storage.getOrders(req.userId!);
        const financeOperations = await storage.getFinanceOperations(req.userId!, false);

        const now = new Date();
        const months: {
          month: string;
          sales: number;
          profit: number;
          orders: number;
          income: number;
          expense: number;
        }[] = [];

        const monthNames = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];

        // Calculate stats for last 6 months
        for (let i = 5; i >= 0; i--) {
          const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
          const year = date.getFullYear();
          const month = date.getMonth();
          const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
          const lastDay = new Date(year, month + 1, 0).getDate();
          const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

          // Filter orders for this month
          const monthOrders = allOrders.filter((o) => o.date >= startDate && o.date <= endDate);

          // Sales and profit (only shipped orders)
          const shippedOrders = monthOrders.filter((o) => o.status === "Отгружен");
          const sales = shippedOrders.reduce((sum, o) => sum + parseFloat(o.salePrice?.toString() || "0"), 0);
          const cost = shippedOrders.reduce((sum, o) => sum + parseFloat(o.costPrice?.toString() || "0"), 0);
          const profit = sales - cost;

          // Finance operations for this month
          const monthOperations = financeOperations.filter((op) => op.date >= startDate && op.date <= endDate);
          const income = monthOperations
            .filter((op) => op.type === "income")
            .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);
          const expense = monthOperations
            .filter((op) => op.type === "expense" || op.type === "supplier_payment")
            .reduce((sum, op) => sum + parseFloat(op.amount?.toString() || "0"), 0);

          months.push({
            month: monthNames[month],
            sales: Math.round(sales),
            profit: Math.round(profit),
            orders: monthOrders.length,
            income: Math.round(income),
            expense: Math.round(expense),
          });
        }

        // Top dealers by sales (current month)
        const currentMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
        const currentMonthOrders = allOrders.filter((o) => o.date >= currentMonthStart);

        const dealerSales: Record<string, { name: string; sales: number; orders: number }> = {};
        const dealers = await storage.getDealers(req.userId!);

        for (const order of currentMonthOrders) {
          if (order.dealerId) {
            if (!dealerSales[order.dealerId]) {
              const dealer = dealers.find((d) => d.id === order.dealerId);
              dealerSales[order.dealerId] = {
                name: dealer?.fullName || "Неизвестный",
                sales: 0,
                orders: 0,
              };
            }
            dealerSales[order.dealerId].sales += parseFloat(order.salePrice?.toString() || "0");
            dealerSales[order.dealerId].orders += 1;
          }
        }

        const topDealers = Object.values(dealerSales)
          .sort((a, b) => b.sales - a.sales)
          .slice(0, 5)
          .map((d) => ({ ...d, sales: Math.round(d.sales) }));

        // Top fabrics by usage (current month)
        const fabricUsage: Record<string, { name: string; count: number; sales: number }> = {};
        const fabricList = await storage.getFabrics(req.userId!);

        for (const order of currentMonthOrders) {
          const sashes = await storage.getOrderSashes(order.id);
          for (const sash of sashes) {
            if (sash.fabricId) {
              if (!fabricUsage[sash.fabricId]) {
                const fabric = fabricList.find((f) => f.id === sash.fabricId);
                fabricUsage[sash.fabricId] = {
                  name: fabric?.name || "Неизвестная",
                  count: 0,
                  sales: 0,
                };
              }
              fabricUsage[sash.fabricId].count += 1;
              fabricUsage[sash.fabricId].sales += parseFloat(sash.sashPrice?.toString() || "0");
            }
          }
        }

        const topFabrics = Object.values(fabricUsage)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5)
          .map((f) => ({ ...f, sales: Math.round(f.sales) }));

        res.json({ months, topDealers, topFabrics });
      } catch (error) {
        console.error("Dashboard charts error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== GIGACHAT PROXY =====
  let gigaChatToken: string | null = null;
  let gigaChatTokenExpiresAt = 0;

  async function getGigaChatToken(): Promise<string> {
    if (gigaChatToken && Date.now() < gigaChatTokenExpiresAt) {
      return gigaChatToken;
    }

    const authKey = "MDE5Yzk4YjAtZTAxNi03MWJjLTgxYTctYTgyZGUzZTY2MTQ1OjU5OWRjNzEyLWQwZWMtNDBlYy1iYTE3LWNlZTZiZGM0YjdlMA==";

    const agent = new https.Agent({ rejectUnauthorized: false });

    const tokenData = await new Promise<{ access_token: string; expires_at: number }>((resolve, reject) => {
      const postData = "scope=GIGACHAT_API_PERS";
      const req = https.request(
        "https://ngw.devices.sberbank.ru:9443/api/v2/oauth",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            Authorization: `Basic ${authKey}`,
            RqUID: crypto.randomUUID(),
          },
          rejectAuthorized: false,
          agent,
        } as any,
        (res) => {
          let data = "";
          res.on("data", (chunk: string) => (data += chunk));
          res.on("end", () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse OAuth response: ${data}`));
            }
          });
        }
      );
      req.on("error", reject);
      req.write(postData);
      req.end();
    });

    gigaChatToken = tokenData.access_token;
    // expires_at is in milliseconds from GigaChat, subtract 60s buffer
    gigaChatTokenExpiresAt = tokenData.expires_at - 60_000;
    return gigaChatToken;
  }

  // Helper function to calculate current stock levels (used by AI context builder)
  async function getStockLevels(userId: string) {
    const [receipts, writeoffs] = await Promise.all([
      storage.getWarehouseReceipts(userId),
      storage.getWarehouseWriteoffs(userId),
    ]);

    const fabricStock: Record<string, number> = {};
    const componentStock: Record<string, number> = {};

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

  async function buildDbContext(userId: string): Promise<string> {
    const [
      userFabrics,
      userColors,
      userDealers,
      userOrders,
      userCashboxes,
      userSuppliers,
      userComponents,
      userSystems,
      userFinOps,
    ] = await Promise.all([
      db.select().from(fabrics).where(eq(fabrics.userId, userId)),
      db.select().from(colors).where(eq(colors.userId, userId)),
      db.select().from(dealers).where(eq(dealers.userId, userId)),
      db.select().from(orders).where(eq(orders.userId, userId)),
      db.select().from(cashboxes).where(eq(cashboxes.userId, userId)),
      db.select().from(suppliers).where(eq(suppliers.userId, userId)),
      db.select().from(components).where(eq(components.userId, userId)),
      db.select().from(systems).where(eq(systems.userId, userId)),
      db.select().from(financeOperations).where(
        and(eq(financeOperations.userId, userId), sql`${financeOperations.deletedAt} IS NULL`)
      ),
    ]);

    // Дополнительные данные: склад, балансы, створки
    const dealersWithBalance = await storage.getDealers(userId);
    const { fabricStock: fStock, componentStock: cStock } = await getStockLevels(userId);

    // Створки всех заказов для статистики по тканям/системам
    const allSashes: any[] = [];
    for (const o of userOrders.slice(-100)) {
      const sashes = await storage.getOrderSashes(o.id);
      sashes.forEach(s => allSashes.push({ ...s, orderId: o.id, dealerId: o.dealerId, date: o.date }));
    }

    const colorMap = Object.fromEntries(userColors.map(c => [c.id, c.name]));

    const lines: string[] = [];
    lines.push("=== ДАННЫЕ CRM ПОЛЬЗОВАТЕЛЯ ===");
    lines.push(`Сегодня: ${new Date().toISOString().slice(0, 10)}`);

    if (userFabrics.length) {
      lines.push("\n## Ткани (с остатками на складе):");
      for (const f of userFabrics) {
        const color = f.colorId ? colorMap[f.colorId] || "" : "";
        const stock = fStock[f.id] || 0;
        lines.push(`- ${f.name}${color ? ` (${color})` : ""}, тип: ${f.fabricType || "—"}, остаток: ${stock > 0 ? stock.toFixed(2) + " м²" : "нет"}`);
      }
    }

    // Агрегация заказов по дилерам
    const dealerStats = new Map<string, { count: number; totalSale: number; totalCost: number; statuses: Record<string, number> }>();
    for (const o of userOrders) {
      const did = o.dealerId || "__none__";
      const st = dealerStats.get(did) || { count: 0, totalSale: 0, totalCost: 0, statuses: {} };
      st.count++;
      st.totalSale += Number(o.salePrice || 0);
      st.totalCost += Number(o.costPrice || 0);
      st.statuses[o.status || "Новый"] = (st.statuses[o.status || "Новый"] || 0) + 1;
      dealerStats.set(did, st);
    }

    if (userDealers.length) {
      lines.push("\n## Дилеры (с аналитикой заказов):");
      // Сортируем по сумме продаж
      const sorted = [...userDealers].sort((a, b) => {
        const sa = dealerStats.get(a.id)?.totalSale || 0;
        const sb = dealerStats.get(b.id)?.totalSale || 0;
        return sb - sa;
      });
      for (const d of sorted) {
        const stats = dealerStats.get(d.id);
        const balanceInfo = dealersWithBalance.find(db => db.id === d.id);
        const balance = balanceInfo?.balance || 0;
        const debtStr = balance < 0 ? `долг: ${Math.abs(balance).toFixed(0)}` : balance > 0 ? `переплата: ${balance.toFixed(0)}` : "баланс: 0";
        const ordersInfo = stats
          ? `заказов: ${stats.count}, продажи: ${stats.totalSale.toFixed(0)}, прибыль: ${(stats.totalSale - stats.totalCost).toFixed(0)}`
          : "заказов: 0";
        lines.push(`- ${d.fullName}${d.city ? `, г.${d.city}` : ""} | ${ordersInfo}, ${debtStr}`);
      }
    }

    if (userOrders.length) {
      // Общая аналитика заказов
      const totalSale = userOrders.reduce((s, o) => s + Number(o.salePrice || 0), 0);
      const totalCost = userOrders.reduce((s, o) => s + Number(o.costPrice || 0), 0);
      const statusCounts: Record<string, number> = {};
      userOrders.forEach(o => { statusCounts[o.status || "Новый"] = (statusCounts[o.status || "Новый"] || 0) + 1; });

      lines.push(`\n## Заказы (всего: ${userOrders.length}, продажи: ${totalSale.toFixed(0)}, себестоимость: ${totalCost.toFixed(0)}, прибыль: ${(totalSale - totalCost).toFixed(0)}):`);
      lines.push(`Статусы: ${Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(", ")}`);

      // Последние 30 заказов
      const recent = [...userOrders].sort((a, b) => b.orderNumber - a.orderNumber).slice(0, 30);
      for (const o of recent) {
        const dealer = userDealers.find(d => d.id === o.dealerId);
        const profit = Number(o.salePrice || 0) - Number(o.costPrice || 0);
        lines.push(`- №${o.orderNumber} от ${o.date}, ${o.status}, продажа: ${o.salePrice || "0"}, прибыль: ${profit.toFixed(0)}, дилер: ${dealer?.fullName || "—"}`);
      }
      if (userOrders.length > 30) lines.push(`... и ещё ${userOrders.length - 30} заказов`);
    }

    if (userCashboxes.length) {
      lines.push("\n## Кассы:");
      for (const c of userCashboxes) {
        lines.push(`- ${c.name}, нач.баланс: ${c.openingBalance || "0"}`);
      }
    }

    if (userSuppliers.length) {
      lines.push("\n## Поставщики:");
      for (const s of userSuppliers) {
        lines.push(`- ${s.name}, нач.баланс: ${s.openingBalance || "0"}`);
      }
    }

    if (userComponents.length) {
      lines.push("\n## Комплектующие (с остатками):");
      for (const c of userComponents) {
        const color = c.colorId ? colorMap[c.colorId] || "" : "";
        const stock = cStock[c.id] || 0;
        lines.push(`- ${c.name}${color ? ` (${color})` : ""}, ед: ${c.unit || "—"}, остаток: ${stock > 0 ? stock.toFixed(2) : "нет"}`);
      }
    }

    if (userSystems.length) {
      lines.push("\n## Системы:");
      for (const s of userSystems) {
        const color = s.colorId ? colorMap[s.colorId] || "" : "";
        lines.push(`- ${s.name}${color ? ` (${color})` : ""}`);
      }
    }

    // Популярные ткани и системы (по кол-ву створок)
    if (allSashes.length > 0) {
      const fabricCount = new Map<string, number>();
      const systemCount = new Map<string, number>();
      for (const s of allSashes) {
        if (s.fabricId) fabricCount.set(s.fabricId, (fabricCount.get(s.fabricId) || 0) + 1);
        if (s.systemId) systemCount.set(s.systemId, (systemCount.get(s.systemId) || 0) + 1);
      }

      const topFabrics = Array.from(fabricCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, cnt]) => `${userFabrics.find(f => f.id === id)?.name || id}: ${cnt} створок`);
      const topSystems = Array.from(systemCount.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, cnt]) => `${userSystems.find(s => s.id === id)?.name || id}: ${cnt} створок`);

      if (topFabrics.length) {
        lines.push("\n## Топ тканей (по кол-ву створок):");
        topFabrics.forEach(t => lines.push(`- ${t}`));
      }
      if (topSystems.length) {
        lines.push("\n## Топ систем (по кол-ву створок):");
        topSystems.forEach(t => lines.push(`- ${t}`));
      }
    }

    // Помесячная аналитика заказов
    if (userOrders.length > 0) {
      const monthly = new Map<string, { count: number; sale: number; cost: number }>();
      for (const o of userOrders) {
        const month = (o.date || "").slice(0, 7); // "2026-03"
        if (!month) continue;
        const m = monthly.get(month) || { count: 0, sale: 0, cost: 0 };
        m.count++;
        m.sale += Number(o.salePrice || 0);
        m.cost += Number(o.costPrice || 0);
        monthly.set(month, m);
      }
      const sortedMonths = Array.from(monthly.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
      if (sortedMonths.length) {
        lines.push("\n## Аналитика по месяцам (последние 6):");
        for (const [month, m] of sortedMonths) {
          lines.push(`- ${month}: заказов ${m.count}, продажи ${m.sale.toFixed(0)}, прибыль ${(m.sale - m.cost).toFixed(0)}`);
        }
      }
    }

    if (userFinOps.length) {
      const totalIncome = userFinOps.filter(f => f.type === "income").reduce((s, f) => s + Number(f.amount), 0);
      const totalExpense = userFinOps.filter(f => f.type === "expense").reduce((s, f) => s + Number(f.amount), 0);
      lines.push(`\n## Финансы (операций: ${userFinOps.length}):`);
      lines.push(`- Общий приход: ${totalIncome.toFixed(0)}`);
      lines.push(`- Общий расход: ${totalExpense.toFixed(0)}`);
      lines.push(`- Баланс: ${(totalIncome - totalExpense).toFixed(0)}`);
    }

    return lines.join("\n");
  }

  app.post(
    "/api/chat",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { messages } = req.body;
        if (!messages || !Array.isArray(messages)) {
          return res.status(400).json({ message: "messages is required" });
        }

        const dbContext = await buildDbContext(req.userId!);

        const systemMessage = {
          role: "system",
          content: `Ты — ИИ-ассистент CRM-системы для производства жалюзи (рулонные шторы, зебра).
У тебя есть полные данные CRM пользователя. Отвечай на русском, кратко и по делу.

ВАЖНО:
- Дилеры отсортированы по сумме продаж (от большего к меньшему). Топ дилер = тот у кого больше всего продаж.
- Для аналитики используй РЕАЛЬНЫЕ цифры из данных ниже: количество заказов, суммы, прибыль.
- Прибыль = продажа − себестоимость.

${dbContext}`,
        };

        const token = await getGigaChatToken();
        const agent = new https.Agent({ rejectUnauthorized: false });

        const chatResponse = await new Promise<any>((resolve, reject) => {
          const postData = JSON.stringify({
            model: "GigaChat",
            messages: [systemMessage, ...messages],
          });

          const req = https.request(
            "https://gigachat.devices.sberbank.ru/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                Authorization: `Bearer ${token}`,
              },
              agent,
            },
            (response) => {
              let data = "";
              response.on("data", (chunk: string) => (data += chunk));
              response.on("end", () => {
                try {
                  resolve(JSON.parse(data));
                } catch (e) {
                  reject(new Error(`Failed to parse GigaChat response: ${data}`));
                }
              });
            }
          );
          req.on("error", reject);
          req.write(postData);
          req.end();
        });

        const reply =
          chatResponse.choices?.[0]?.message?.content || "Нет ответа";
        res.json({ reply });
      } catch (error: any) {
        console.error("GigaChat error:", error);
        res.status(500).json({ message: "Ошибка чата: " + error.message });
      }
    }
  );

  // ===== AUDIT LOGS =====
  app.get(
    "/api/audit-logs",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 20;
        const cursor = req.query.cursor as string | undefined;
        const entityType =
          typeof req.query.entityType === "string" &&
          req.query.entityType !== "all"
            ? req.query.entityType
            : undefined;
        const action =
          typeof req.query.action === "string" && req.query.action !== "all"
            ? req.query.action
            : undefined;
        const from =
          typeof req.query.from === "string" && req.query.from.length > 0
            ? req.query.from
            : undefined;
        const to =
          typeof req.query.to === "string" && req.query.to.length > 0
            ? req.query.to
            : undefined;

        const result = await storage.getAuditLogsPaginated(
          req.userId!,
          { limit, cursor },
          { entityType, action, from, to }
        );

        const enrichedData = await storage.enrichAuditLogsWithEntityNames(
          result.data
        );

        res.json({ ...result, data: enrichedData });
      } catch (error) {
        console.error("Audit logs error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== NOTIFICATIONS =====
  app.get(
    "/api/notifications",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const data = await storage.getNotifications(req.userId!, limit);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.get(
    "/api/notifications/unread-count",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const count = await storage.getUnreadNotificationCount(req.userId!);
        res.json({ count });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/notifications/read-all",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.markAllNotificationsRead(req.userId!);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/notifications/:id/read",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const notification = await storage.markNotificationRead(req.params.id);
        res.json(notification);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== APP MEASUREMENTS (CRM admin view) =====

  // Get all measurements from all dealers belonging to this admin
  app.get(
    "/api/app-measurements",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const dealerList = await storage.getDealers(req.userId!);
        const allMeasurements = [];

        for (const dealer of dealerList) {
          const dealerMeasurements = await storage.getMeasurements(dealer.id);
          for (const m of dealerMeasurements) {
            const sashes = await storage.getMeasurementSashes(m.id);
            allMeasurements.push({
              ...m,
              sashes,
              dealerName: dealer.fullName,
            });
          }
        }

        // Sort by createdAt desc
        allMeasurements.sort((a, b) => {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dbTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dbTime - da;
        });

        res.json(allMeasurements);
      } catch (error) {
        console.error("Get app measurements error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Approve a pending measurement: create workshop order + order sashes,
  // then link the measurement to the new order and mark it as "sent".
  app.post(
    "/api/app-measurements/:id/convert",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const measurement = await storage.getMeasurement(req.params.id);
        if (!measurement) {
          return res.status(404).json({ message: "Замер не найден" });
        }

        if (measurement.orderId) {
          return res.json({ success: true, alreadyConverted: true });
        }

        // Fetch dealer to build the order comment
        const dealer = measurement.dealerId
          ? await storage.getDealer(measurement.dealerId)
          : null;
        const dealerName = dealer?.fullName || "—";
        const clientInfo = [measurement.clientName, measurement.clientPhone]
          .filter(Boolean)
          .join(", ");
        const orderComment =
          `Дилер: ${dealerName} | ${clientInfo} | ${measurement.address || ""}`.trim();

        // Fetch sashes once and calculate actual sale price: coefficient × dealer's workshop rate
        const mSashes = await storage.getMeasurementSashes(measurement.id);
        const rateRulon = parseFloat(dealer?.workshopRateRulon?.toString() || "28");
        const rateZebra = parseFloat(dealer?.workshopRateZebra?.toString() || "28");
        let calculatedPrice = 0;
        for (const s of mSashes) {
          const coef = parseFloat(s.coefficient?.toString() || "0");
          const isZebra = (s.systemType || "").includes("zebra");
          calculatedPrice += coef * (isZebra ? rateZebra : rateRulon);
        }

        // Create the workshop order
        const orderNumber = await storage.getNextOrderNumber(req.userId!);
        const today = new Date().toISOString().split("T")[0];
        const order = await storage.createOrder({
          orderNumber,
          date: today,
          status: "Новый",
          comment: orderComment,
          userId: req.userId!,
          dealerId: measurement.dealerId,
          salePrice: calculatedPrice > 0 ? calculatedPrice.toFixed(2) : (measurement.totalCoefficient || "0"),
        });

        // Mirror measurement sashes into order sashes, matching system/fabric by name
        const allSystems = await storage.getSystems(req.userId!);
        const allFabrics = await storage.getFabrics(req.userId!);

        // App systemType → CRM systemKey mapping
        const typeToKey: Record<string, string> = {
          "mini-rulons": "mini_roll",
          "mini-zebra": "mini_zebra",
          "uni-1": "uni1_roll",
          "uni-1-zebra": "uni1_zebra",
          "uni-2": "uni2_roll",
          "uni-2-zebra": "uni2_zebra",
        };

        for (const s of mSashes) {
          // Match system: first by direct ID, then by systemType→systemKey
          let systemId: string | undefined;
          if (s.systemName) {
            const byId = allSystems.find((sys) => sys.id === s.systemName);
            if (byId) systemId = byId.id;
          }
          if (!systemId && s.systemType) {
            const crmKey = typeToKey[s.systemType] || s.systemType.replace(/-/g, "_");
            const byKey = allSystems.find((sys) => sys.systemKey === crmKey);
            if (byKey) systemId = byKey.id;
          }

          // Match fabric by name (strip "(colorName)" suffix from app's displayName)
          let fabricId: string | undefined;
          if (s.fabricName) {
            const exact = allFabrics.find((f) => f.name === s.fabricName);
            if (exact) {
              fabricId = exact.id;
            } else {
              const base = s.fabricName.replace(/\s*\(.*\)\s*$/, "").trim();
              const byBase = allFabrics.find((f) => f.name === base);
              if (byBase) fabricId = byBase.id;
            }
          }

          const sashCoef = parseFloat(s.coefficient?.toString() || "0");
          const sashIsZebra = (s.systemType || "").includes("zebra");
          const sashPrice = sashCoef * (sashIsZebra ? rateZebra : rateRulon);

          await storage.createOrderSash({
            orderId: order.id,
            width: parseFloat(s.width?.toString() || "0").toString(),
            height: parseFloat(s.height?.toString() || "0").toString(),
            controlSide: s.control === "Л" ? "ЛР" : s.control,
            coefficient: s.coefficient?.toString(),
            sashPrice: sashPrice > 0 ? sashPrice.toFixed(2) : undefined,
            room: s.room,
            roomName: s.roomName,
            systemId,
            fabricId,
            systemName: s.systemName,
            systemType: s.systemType,
            category: s.category,
            fabricName: s.fabricName,
          });
        }

        // Link measurement to the order
        await storage.updateMeasurement(measurement.id, {
          status: "sent",
          sentAt: new Date(),
          orderId: order.id,
        });

        // Audit
        try {
          await logAudit({
            userId: req.userId!,
            action: "create",
            entityType: "order",
            entityId: order.id,
            metadata: {
              source: "measurement_approve",
              measurementId: measurement.id,
              dealerName,
              orderNumber,
            },
          });
        } catch (_) {}

        res.json({
          success: true,
          orderId: order.id,
          orderNumber,
        });
      } catch (error) {
        console.error("Convert measurement error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Delete measurement (admin)
  app.delete(
    "/api/app-measurements/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteMeasurement(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== DEALER NOTIFICATIONS (CRM admin sends to dealers) =====

  // Send notification to dealers
  app.post(
    "/api/dealer-notifications/send",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { title, message, dealerIds, sendToAll } = req.body;
        if (!title || !message) {
          return res
            .status(400)
            .json({ message: "Заголовок и текст обязательны" });
        }

        const userId = req.userId!;

        if (sendToAll) {
          // Broadcast to all dealers with login
          const allDealers = await storage.getDealers(userId);
          const activeDealers = allDealers.filter((d) => d.isActive && d.login);
          for (const dealer of activeDealers) {
            await storage.createDealerNotification({
              dealerId: dealer.id,
              userId,
              title,
              message,
              isBroadcast: true,
              isRead: false,
            });
          }
          res.json({
            success: true,
            count: activeDealers.length,
          });
        } else {
          // Send to specific dealers
          const ids = Array.isArray(dealerIds)
            ? dealerIds
            : [dealerIds];
          for (const dealerId of ids) {
            await storage.createDealerNotification({
              dealerId,
              userId,
              title,
              message,
              isBroadcast: false,
              isRead: false,
            });
          }
          res.json({ success: true, count: ids.length });
        }
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Get sent dealer notifications history
  app.get(
    "/api/dealer-notifications/history",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { dealerNotifications } = await import("@shared/schema");
        const list = await db
          .select()
          .from(dealerNotifications)
          .where(eq(dealerNotifications.userId, req.userId!))
          .orderBy(desc(dealerNotifications.createdAt))
          .limit(100);
        res.json(list);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== MOBILE API (dealer sub-router) =====
  app.use("/api/mobile/dealer", createDealerMobileRouter());

  // ===== REFERENCE CRUD ROUTES (mounted as sub-router) =====
  app.use("/api", createReferencesRouter(authMiddleware));

  // ===== FINANCE ROUTES (mounted as sub-router) =====
  app.use("/api", createFinanceRouter(authMiddleware));

  // ===== WAREHOUSE & STOCK ROUTES (mounted as sub-router) =====
  app.use("/api", createWarehouseRouter(authMiddleware));

  // ===== ORDER ROUTES (mounted as sub-router) =====
  app.use("/api", createOrdersRouter(authMiddleware));

  // Periodic notification generation (every 30 minutes)
  setInterval(() => {
    generatePeriodicNotifications().catch((err) =>
      console.error("Periodic notifications error:", err)
    );
  }, 30 * 60 * 1000);

  return httpServer;
}
