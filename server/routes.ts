import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
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
  expenseTypes,
  components,
  multipliers,
  suppliers,
  orders,
  financeOperations,
  warehouseReceipts,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, gte, lte, sql, sum, desc } from "drizzle-orm";
import pg from "pg";

const JWT_SECRET =
  process.env.SESSION_SECRET || "fallback-secret-key-change-in-production";
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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== COLORS =====
  app.get(
    "/api/colors",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getColors(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/colors",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const color = await storage.createColor({
          ...req.body,
          userId: req.userId,
        });
        res.json(color);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/colors/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const color = await storage.updateColor(req.params.id, req.body);
        res.json(color);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/colors/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteColor(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== FABRICS =====
  app.get(
    "/api/fabrics",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getFabrics(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/fabrics",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const fabric = await storage.createFabric({
          ...req.body,
          userId: req.userId,
        });
        res.json(fabric);
      } catch (error) {
        console.error("Create fabric error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/fabrics/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const fabric = await storage.updateFabric(req.params.id, req.body);
        res.json(fabric);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/fabrics/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteFabric(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete fabric error:", error);
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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/dealers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const dealer = await storage.createDealer({
          ...req.body,
          userId: req.userId,
        });
        res.json(dealer);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/dealers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const dealer = await storage.updateDealer(req.params.id, req.body);
        res.json(dealer);
      } catch (error) {
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

  // ===== CASHBOXES =====
  app.get(
    "/api/cashboxes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getCashboxes(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/cashboxes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const cashbox = await storage.createCashbox({
          ...req.body,
          userId: req.userId,
        });
        res.json(cashbox);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/cashboxes/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const cashbox = await storage.updateCashbox(req.params.id, req.body);
        res.json(cashbox);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/cashboxes/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteCashbox(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== SYSTEMS =====
  app.get(
    "/api/systems",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const systemsData = await storage.getSystems(req.userId!);
        const allMultipliers = await storage.getMultipliers(req.userId!);
        const allComponents = await storage.getComponents(req.userId!);

        // Для каждой системы загружаем связанные компоненты и множитель
        const systemsWithRelations = await Promise.all(
          systemsData.map(async (system) => {
            const systemComponentsData = await storage.getSystemComponents(
              system.id
            );
            // Получаем детали компонентов с данными из system_components
            const componentsWithDetails = systemComponentsData
              .map((sc) => {
                const component = allComponents.find(
                  (c) => c.id === sc.componentId
                );
                if (!component) return null;
                // Возвращаем компонент с данными о количестве и размерах
                return {
                  ...component,
                  quantity: sc.quantity,
                  sizeSource: sc.sizeSource,
                  sizeMultiplier: sc.sizeMultiplier,
                };
              })
              .filter(Boolean);

            // Загружаем множитель
            const multiplier = system.multiplierId
              ? allMultipliers.find((m) => m.id === system.multiplierId)
              : null;

            return {
              ...system,
              components: componentsWithDetails,
              multiplier,
            };
          })
        );

        res.json(systemsWithRelations);
      } catch (error) {
        console.error("Error loading systems:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/systems",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const system = await storage.createSystem({
          ...req.body,
          userId: req.userId,
        });
        res.json(system);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/systems/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const system = await storage.updateSystem(req.params.id, req.body);
        res.json(system);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/systems/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteSystem(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error("Delete system error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== SYSTEM COMPONENTS =====
  app.get(
    "/api/systems/:id/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const components = await storage.getSystemComponents(req.params.id);
        res.json(components);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/systems/:id/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { componentId, quantity, sizeSource, sizeMultiplier } = req.body;
        const systemComponent = await storage.createSystemComponent({
          systemId: req.params.id,
          componentId,
          quantity: quantity || "1",
          sizeSource: sizeSource || null,
          sizeMultiplier: sizeMultiplier || "1",
        });
        res.json(systemComponent);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/systems/:id/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteSystemComponentsBySystemId(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== COEFFICIENTS =====
  app.get(
    "/api/coefficients/available-keys",
    async (req: Request, res: Response) => {
      try {
        const { getAvailableSystems } = await import("./coefficients.js");
        const systemKeys = getAvailableSystems();
        res.json({ systemKeys });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.get(
    "/api/coefficients/available-categories",
    async (req: Request, res: Response) => {
      try {
        const { systemKey } = req.query;

        if (!systemKey) {
          return res.status(400).json({
            message: "Необходим параметр: systemKey",
          });
        }

        const { getSystemCategories } = await import("./coefficients.js");
        const categories = getSystemCategories(systemKey as string);

        res.json({
          systemKey,
          categories,
          count: categories.length,
        });
      } catch (error) {
        console.error("Ошибка при получении категорий:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/coefficients/calculate",
    async (req: Request, res: Response) => {
      try {
        const { systemKey, category, width, height } = req.body;

        if (!systemKey || !category || !width || !height) {
          return res.status(400).json({
            message: "Необходимы параметры: systemKey, category, width, height",
          });
        }

        const { getCoefficientDetailed } = await import("./coefficients.js");
        const result = getCoefficientDetailed(
          systemKey,
          category,
          width,
          height
        );

        if (result.coefficient === null) {
          return res.status(404).json({
            message: result.usedSystemKey
              ? `Категория "${category}" не найдена для системы "${result.usedSystemKey}"`
              : `Система "${systemKey}" не найдена в файле коэффициентов`,
            systemKey,
            category,
            usedSystemKey: result.usedSystemKey,
            usedCategory: result.usedCategory,
          });
        }

        res.json({
          coefficient: result.coefficient,
          systemKey,
          category,
          usedSystemKey: result.usedSystemKey,
          usedCategory: result.usedCategory,
          isFallbackCategory: result.isFallbackCategory,
          width,
          height,
          warning: result.isFallbackCategory
            ? `Категория "${category}" не найдена, использована "${result.usedCategory}"`
            : null,
        });
      } catch (error) {
        console.error("Ошибка при расчете коэффициента:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== EXPENSE TYPES =====
  app.get(
    "/api/expense-types",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getExpenseTypes(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/expense-types",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const expenseType = await storage.createExpenseType({
          ...req.body,
          userId: req.userId,
        });
        res.json(expenseType);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/expense-types/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const expenseType = await storage.updateExpenseType(
          req.params.id,
          req.body
        );
        res.json(expenseType);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/expense-types/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteExpenseType(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== COMPONENTS =====
  app.get(
    "/api/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getComponents(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const component = await storage.createComponent({
          ...req.body,
          userId: req.userId,
        });
        res.json(component);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/components/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const component = await storage.updateComponent(
          req.params.id,
          req.body
        );
        res.json(component);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/components/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteComponent(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== MULTIPLIERS =====
  app.get(
    "/api/multipliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getMultipliers(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/multipliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const multiplier = await storage.createMultiplier({
          ...req.body,
          userId: req.userId,
        });
        res.json(multiplier);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/multipliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const multiplier = await storage.updateMultiplier(
          req.params.id,
          req.body
        );
        res.json(multiplier);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/multipliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteMultiplier(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== SUPPLIERS =====
  app.get(
    "/api/suppliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getSuppliers(req.userId!);
        res.json(data);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/suppliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const supplier = await storage.createSupplier({
          ...req.body,
          userId: req.userId,
        });
        res.json(supplier);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/suppliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const supplier = await storage.updateSupplier(req.params.id, req.body);
        res.json(supplier);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/suppliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteSupplier(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Supplier stats for quick view
  app.get(
    "/api/suppliers/:id/stats",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const financeOps = await storage.getFinanceOperations(req.userId!, false);

        // Get payments to this supplier
        const supplierPayments = financeOps.filter(
          (op) => op.type === "supplier_payment" && op.supplierId === req.params.id
        );

        const totalPayments = supplierPayments.reduce(
          (sum, op) => sum + parseFloat(op.amount?.toString() || "0"),
          0
        );

        // Get supplier opening balance
        const supplier = await storage.getSupplier(req.params.id);
        const openingBalance = parseFloat(supplier?.openingBalance?.toString() || "0");

        // Balance = opening balance - payments (negative = we owe them)
        const balance = openingBalance - totalPayments;

        res.json({
          totalPayments,
          balance,
        });
      } catch (error) {
        console.error("Supplier stats error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== ORDERS =====
  app.get(
    "/api/orders",
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

        // Helper to determine order type based on sashes
        const getOrderType = (sashes: any[]) => {
          if (sashes.length === 0) return "product";
          // If any sash has componentId but no systemId/fabricId -> product order
          const hasProductSash = sashes.some(
            (s) => s.componentId && !s.systemId && !s.fabricId
          );
          return hasProductSash ? "product" : "sash";
        };

        const enrichOrders = async (ordersToEnrich: any[]) => {
          return Promise.all(
            ordersToEnrich.map(async (order) => {
              const sashes = await storage.getOrderSashes(order.id);
              return {
                ...order,
                dealer: dealerList.find((d) => d.id === order.dealerId),
                dealerBalance: dealerList.find((d) => d.id === order.dealerId)
                  ?.balance,
                sashesCount: sashes.length,
                orderType: getOrderType(sashes),
              };
            })
          );
        };

        const filters = { status, dealerId, from, to, search };

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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.get(
    "/api/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
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

        const enrichedSashes = sashes.map((sash) => ({
          ...sash,
          system: systemList.find((s) => s.id === sash.systemId),
          systemColor: colorList.find((c) => c.id === sash.systemColorId),
          fabric: fabricList.find((f) => f.id === sash.fabricId),
          fabricColor: colorList.find((c) => c.id === sash.fabricColorId),
        }));

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
        });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

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
      const widthM = width / 1000;
      const heightM = height / 1000;
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

  app.post(
    "/api/orders",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { sashes, skipStockValidation, isPaid, cashboxId, ...orderData } =
          req.body;

        // Проверка остатков убрана - теперь можно создавать заказ без материалов
        // Проверка будет только при смене статуса на "Готов"

        const orderNumber = await storage.getNextOrderNumber(req.userId!);

        const order = await storage.createOrder({
          ...orderData,
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
        console.error("Create order error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Создание заказа товара (только комплектующие, без створок)
  app.post(
    "/api/orders/product",
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

  app.patch(
    "/api/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { sashes, skipStockValidation, isPaid, cashboxId, ...orderData } =
          req.body;

        // Получаем существующий заказ
        const existingOrder = await storage.getOrder(req.params.id);

        // Проверка остатков убрана - теперь можно редактировать заказ без материалов
        // Проверка будет только при смене статуса на "Готов"

        const order = await storage.updateOrder(req.params.id, orderData);

        if (sashes && Array.isArray(sashes)) {
          await storage.deleteOrderSashesByOrderId(req.params.id);
          for (const sash of sashes) {
            await storage.createOrderSash({
              ...sanitizeSashData(sash),
              orderId: req.params.id,
            });
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

        res.json(order);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.patch(
    "/api/orders/:id/status",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { status } = req.body;
        const order = await storage.getOrder(req.params.id);
        if (!order) {
          return res.status(404).json({ message: "Заказ не найден" });
        }

        const oldStatus = order.status || "Новый";
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
            await storage.getWarehouseWriteoffsByOrderId(req.params.id);

          if (existingWriteoffs.length === 0) {
            // Получаем створки заказа
            const sashes = await storage.getOrderSashes(req.params.id);

            // ПРОВЕРКА ОСТАТКОВ перед изменением статуса на "Готов"
            const validation = await validateSashOrderStock(
              req.userId!,
              sashes
            );
            if (!validation.valid) {
              return res.status(400).json({
                message:
                  "Невозможно изменить статус на 'Готов'. Недостаточно материалов на складе",
                errors: validation.errors,
                stockError: true,
              });
            }

            const allFabrics = await storage.getFabrics(req.userId!);
            const allSystems = await storage.getSystems(req.userId!);
            const allComponents = await storage.getComponents(req.userId!);

            // Получаем текущие остатки и средние цены
            const receipts = await storage.getWarehouseReceipts(req.userId!);
            const writeoffs = await storage.getWarehouseWriteoffs(req.userId!);

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
              const widthM = width / 1000;
              const heightM = height / 1000;
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
                    orderId: req.params.id,
                    itemType: "fabric",
                    fabricId: sash.fabricId,
                    quantity: fabricQty.toFixed(4),
                    price: price.toFixed(2),
                    total: (fabricQty * price).toFixed(2),
                    date: today,
                    userId: req.userId!,
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
                        orderId: req.params.id,
                        itemType: "component",
                        componentId: sc.componentId,
                        quantity: componentQty.toFixed(4),
                        price: price.toFixed(2),
                        total: (componentQty * price).toFixed(2),
                        date: today,
                        userId: req.userId!,
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
                    orderId: req.params.id,
                    itemType: "component",
                    componentId: sash.componentId,
                    quantity: componentQty.toFixed(4),
                    price: price.toFixed(2),
                    total: (componentQty * price).toFixed(2),
                    date: today,
                    userId: req.userId!,
                  });
                  writeoffsCreated++;
                }
              }
            }
          }
        }

        // 4. Отгружен → валовая прибыль учитывается автоматически в отчётах
        // (salePrice - costPrice уже хранятся в заказе)
        if (status === "Отгружен") {
        }

        const updated = await storage.updateOrder(req.params.id, {
          status,
          dealerDebt: dealerDebt.toString(),
        });
        res.json(updated);
      } catch (error) {
        console.error("Update order status error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/orders/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteOrder(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== ORDER SASHES =====
  app.get(
    "/api/orders/:orderId/sashes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const sashes = await storage.getOrderSashes(req.params.orderId);
        res.json(sashes);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/orders/:orderId/sashes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const sash = await storage.createOrderSash({
          ...sanitizeSashData(req.body),
          orderId: req.params.orderId,
        });
        res.json(sash);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== FINANCE OPERATIONS =====
  app.get(
    "/api/finance",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const includeDrafts = req.query.includeDrafts === "true";
        const draftsOnly = req.query.draftsOnly === "true";
        const limit = parseInt(req.query.limit as string) || 20;
        const cursor = req.query.cursor as string | undefined;
        const paginated = req.query.paginated === "true";
        const type =
          typeof req.query.type === "string" && req.query.type !== "all"
            ? req.query.type
            : undefined;
        const cashboxId =
          typeof req.query.cashboxId === "string" &&
          req.query.cashboxId !== "all"
            ? req.query.cashboxId
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

        const dealerList = await storage.getDealers(req.userId!);
        const supplierList = await storage.getSuppliers(req.userId!);
        const cashboxList = await storage.getCashboxes(req.userId!);
        const expenseTypeList = await storage.getExpenseTypes(req.userId!);

        const enrichOperation = (op: any) => ({
          ...op,
          dealer: dealerList.find((d) => d.id === op.dealerId),
          supplier: supplierList.find((s) => s.id === op.supplierId),
          cashbox: cashboxList.find((c) => c.id === op.cashboxId),
          fromCashbox: cashboxList.find((c) => c.id === op.fromCashboxId),
          toCashbox: cashboxList.find((c) => c.id === op.toCashboxId),
          expenseType: expenseTypeList.find((e) => e.id === op.expenseTypeId),
        });

        if (paginated) {
          const result = await storage.getFinanceOperationsPaginated(
            req.userId!,
            includeDrafts || draftsOnly,
            { limit, cursor },
            { type, cashboxId, from, to, search, draftsOnly }
          );

          const enriched = result.data.map(enrichOperation);

          res.json({
            data: enriched,
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          });
        } else {
          // Legacy non-paginated response for backward compatibility
          const operations = await storage.getFinanceOperations(
            req.userId!,
            includeDrafts || draftsOnly,
            { type, cashboxId, from, to, search, draftsOnly }
          );
          const enriched = operations.map(enrichOperation);
          res.json(enriched);
        }
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.get(
    "/api/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const operation = await storage.getFinanceOperation(req.params.id);
        if (!operation) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        res.json(operation);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/finance",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
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
    }
  );

  app.patch(
    "/api/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const operation = await storage.updateFinanceOperation(
          req.params.id,
          req.body
        );
        res.json(operation);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.softDeleteFinanceOperation(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/finance/:id/restore",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const operation = await storage.restoreFinanceOperation(req.params.id);
        res.json(operation);
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.delete(
    "/api/finance/:id/hard",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const { password } = req.body;
        const user = await storage.getUser(req.userId!);

        if (!user) {
          return res.status(401).json({ message: "Пользователь не найден" });
        }

        // Проверяем пароль отчётов если он установлен
        if (user.reportPassword) {
          // Если доступ уже разблокирован в сессии — пропускаем проверку
          if (!req.session.reportAccessGranted) {
            // Если передан пароль — проверяем его
            if (password) {
              const isValid = await bcrypt.compare(password, user.reportPassword);
              if (!isValid) {
                return res.status(403).json({ message: "Неверный пароль" });
              }
              // Разблокируем доступ в сессии
              req.session.reportAccessGranted = true;
            } else {
              return res
                .status(403)
                .json({ message: "Требуется пароль", requiresPassword: true });
            }
          }
        }

        await storage.hardDeleteFinanceOperation(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== WAREHOUSE =====
  app.get(
    "/api/warehouse",
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

  app.get(
    "/api/warehouse/previous-price",
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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.get(
    "/api/warehouse/:id",
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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.post(
    "/api/warehouse",
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

        res.json(receipt);
      } catch (error) {
        console.error("Create warehouse error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  app.put(
    "/api/warehouse/:id",
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

  app.delete(
    "/api/warehouse/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteWarehouseReceipt(req.params.id);
        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Stock levels endpoint
  app.get(
    "/api/stock",
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
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Warehouse writeoffs endpoint
  app.get(
    "/api/warehouse/writeoffs",
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
  app.get(
    "/api/stock/adjustments",
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
  app.post(
    "/api/stock/adjustment",
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

        // AR = dealers who owe us (negative balance)
        const totalAR = dealerList
          .filter((d) => d.balance < 0)
          .reduce((sum, d) => sum + Math.abs(d.balance), 0);

        // AP = suppliers we owe (positive balance)
        const totalAP = supplierList
          .filter((s) => s.balance > 0)
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

  return httpServer;
}
