import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { db } from "../db";
import { eq, inArray } from "drizzle-orm";
import { installmentPlans as installmentPlansTable, measurements, systems, fabrics } from "@shared/schema";
import { notify } from "../notifications";
import { logAudit } from "../audit";

const JWT_SECRET = process.env.SESSION_SECRET!;

interface DealerMobileAuthRequest extends Request {
  dealerId?: string;
}

function dealerMobileAuthMiddleware(
  req: DealerMobileAuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Не авторизован" });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { dealerId: string; role: string };
    if (decoded.role !== "dealer") {
      return res.status(401).json({ message: "Неверный токен" });
    }
    req.dealerId = decoded.dealerId;
    next();
  } catch {
    return res.status(401).json({ message: "Неверный токен" });
  }
}

export function createDealerMobileRouter(): Router {
  const router = Router();

  // POST /auth/login (mounted at /api/mobile/dealer, so full path = /api/mobile/dealer/auth/login)
  router.post("/auth/login", async (req: Request, res: Response) => {
    try {
      const { login, password } = req.body;
      if (!login || !password) {
        return res.status(400).json({ message: "Логин и пароль обязательны" });
      }

      const dealer = await storage.getDealerByLogin(login);
      if (!dealer || !dealer.isActive || !dealer.password) {
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      const valid = await bcrypt.compare(password, dealer.password);
      if (!valid) {
        return res.status(401).json({ message: "Неверный логин или пароль" });
      }

      const token = jwt.sign(
        { dealerId: dealer.id, role: "dealer" },
        JWT_SECRET,
        { expiresIn: "30d" }
      );
      const { password: _, ...safe } = dealer;
      res.json({ token, dealer: safe });
    } catch (error) {
      console.error("Dealer mobile login error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  // GET /auth/me
  router.get(
    "/auth/me",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const dealer = await storage.getDealer(req.dealerId!);
        if (!dealer || !dealer.isActive) {
          return res.status(401).json({ message: "Аккаунт не найден" });
        }
        const { password: _, ...safe } = dealer;
        res.json(safe);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // PATCH /profile
  router.patch(
    "/profile",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const dealer = await storage.getDealer(req.dealerId!);
        if (!dealer || !dealer.isActive) {
          return res.status(401).json({ message: "Аккаунт не найден" });
        }

        const { fullName, city, phone, currentPassword, newPassword } = req.body;
        const updateData: Record<string, any> = {};

        if (fullName !== undefined) updateData.fullName = fullName;
        if (city !== undefined) updateData.city = city;
        if (phone !== undefined) updateData.phone = phone;

        if (newPassword) {
          if (!currentPassword) {
            return res.status(400).json({ message: "Введите текущий пароль" });
          }
          if (!dealer.password) {
            return res.status(400).json({ message: "Пароль не установлен" });
          }
          const valid = await bcrypt.compare(currentPassword, dealer.password);
          if (!valid) {
            return res.status(400).json({ message: "Неверный текущий пароль" });
          }
          updateData.password = await bcrypt.hash(newPassword, 10);
        }

        if (Object.keys(updateData).length === 0) {
          return res.status(400).json({ message: "Нет данных для обновления" });
        }

        const updated = await storage.updateDealer(req.dealerId!, updateData);
        if (updated) {
          const { password: _, ...safe } = updated;
          res.json(safe);
        } else {
          res.status(404).json({ message: "Дилер не найден" });
        }
      } catch (error) {
        console.error("Update dealer profile error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /orders
  router.get(
    "/orders",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const status = typeof req.query.status === "string" ? req.query.status : undefined;
        const from = typeof req.query.from === "string" ? req.query.from : undefined;
        const to = typeof req.query.to === "string" ? req.query.to : undefined;
        const search = typeof req.query.search === "string" ? req.query.search : undefined;
        // Fetch orders without search filter — we'll filter after enriching with clientName
        const orderList = await storage.getDealerOrders(req.dealerId!, { status, from, to });

        // Enrich orders with clientName from linked measurements
        const orderIds = orderList.map((o) => o.id);
        let clientMap = new Map<string, string>();
        if (orderIds.length > 0) {
          const linked = await db
            .select({ orderId: measurements.orderId, clientName: measurements.clientName })
            .from(measurements)
            .where(inArray(measurements.orderId, orderIds));
          for (const m of linked) {
            if (m.orderId && m.clientName) clientMap.set(m.orderId, m.clientName);
          }
        }

        let enriched = orderList.map((o) => ({ ...o, clientName: clientMap.get(o.id) || null }));

        // Filter by order number or client name
        if (search) {
          const q = search.toLowerCase();
          enriched = enriched.filter(
            (o) => String(o.orderNumber).includes(q) || (o.clientName && o.clientName.toLowerCase().includes(q))
          );
        }

        res.json(enriched);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /orders/:id
  router.get(
    "/orders/:id",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const order = await storage.getOrder(req.params.id);
        if (!order || order.dealerId !== req.dealerId) {
          return res.status(404).json({ message: "Заказ не найден" });
        }
        const rawSashes = await storage.getOrderSashes(order.id);

        // Enrich sashes with system/fabric names from FK joins
        const systemIds = rawSashes.map(s => s.systemId).filter(Boolean) as string[];
        const fabricIds = rawSashes.map(s => s.fabricId).filter(Boolean) as string[];
        const systemMap = new Map<string, string>();
        const fabricMap = new Map<string, string>();
        if (systemIds.length > 0) {
          const sysList = await db.select({ id: systems.id, name: systems.name }).from(systems).where(inArray(systems.id, systemIds));
          for (const s of sysList) systemMap.set(s.id, s.name);
        }
        if (fabricIds.length > 0) {
          const fabList = await db.select({ id: fabrics.id, name: fabrics.name }).from(fabrics).where(inArray(fabrics.id, fabricIds));
          for (const f of fabList) fabricMap.set(f.id, f.name);
        }
        const sashes = rawSashes.map(s => ({
          ...s,
          systemName: s.systemName || (s.systemId ? systemMap.get(s.systemId) : null) || null,
          fabricName: s.fabricName || (s.fabricId ? fabricMap.get(s.fabricId) : null) || null,
        }));

        // Enrich with clientName from linked measurement
        const [linked] = await db
          .select({ clientName: measurements.clientName })
          .from(measurements)
          .where(eq(measurements.orderId, order.id));
        res.json({ ...order, sashes, clientName: linked?.clientName || null });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /balance
  router.get(
    "/balance",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const balance = await storage.getDealerBalance(req.dealerId!);
        res.json(balance);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /payments
  router.get(
    "/payments",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const payments = await storage.getDealerPayments(req.dealerId!);
        res.json(payments);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /installments
  router.get(
    "/installments",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const plans = await storage.getDealerInstallmentPlans(req.dealerId!);
        res.json(plans);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /installments/:planId
  router.get(
    "/installments/:planId",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const [plan] = await db
          .select()
          .from(installmentPlansTable)
          .where(eq(installmentPlansTable.id, req.params.planId));
        if (!plan) return res.status(404).json({ message: "План не найден" });
        // Verify dealer owns the order
        const order = await storage.getOrder(plan.orderId);
        if (!order || order.dealerId !== req.dealerId) {
          return res.status(404).json({ message: "План не найден" });
        }
        const fullPlan = await storage.getInstallmentPlanByOrderId(plan.orderId);
        res.json(fullPlan);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /orders/:id/installment
  router.post(
    "/orders/:id/installment",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const order = await storage.getOrder(req.params.id);
        if (!order || order.dealerId !== req.dealerId) {
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
          months, paymentDay, monthlyPayment: monthlyRaw.toString(), userId: order.userId,
        });

        const today = new Date();
        if (dp > 0) {
          await storage.createInstallmentPayment({
            planId: plan.id, paymentNumber: 0, dueDate: today.toISOString().split("T")[0],
            amount: dp.toString(), userId: order.userId,
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
            amount: amount.toFixed(2), userId: order.userId,
          });
        }
        const result = await storage.getInstallmentPlanByOrderId(order.id);
        res.json(result);
      } catch (error) {
        console.error("Dealer installment create error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /stats
  router.get(
    "/stats",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const balance = await storage.getDealerBalance(req.dealerId!);
        const allOrders = await storage.getDealerOrders(req.dealerId!);
        const statusCounts: Record<string, number> = {};
        for (const o of allOrders) {
          const st = o.status || "Новый";
          statusCounts[st] = (statusCounts[st] || 0) + 1;
        }
        const plans = await storage.getDealerInstallmentPlans(req.dealerId!);
        let overdueCount = 0;
        const today = new Date().toISOString().split("T")[0];
        for (const p of plans) {
          for (const pay of p.payments) {
            if (!pay.isPaid && pay.dueDate < today) overdueCount++;
          }
        }

        const measurementList = await storage.getMeasurements(req.dealerId!);
        const measurementStats = {
          total: measurementList.length,
          drafts: measurementList.filter((m) => m.status === "draft").length,
          sent: measurementList.filter((m) => m.status === "sent").length,
          inProduction: measurementList.filter((m) => m.status === "in_production").length,
          ready: measurementList.filter((m) => m.status === "ready").length,
          installed: measurementList.filter((m) => m.status === "installed").length,
        };

        res.json({
          balance: balance.balance,
          totalOrders: allOrders.length,
          ordersByStatus: statusCounts,
          overdueInstallments: overdueCount,
          measurements: measurementStats,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /notifications
  router.get(
    "/notifications",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const notifs = await storage.getDealerNotifications(req.dealerId!);
        res.json(notifs);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /notifications/unread-count
  router.get(
    "/notifications/unread-count",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const count = await storage.getDealerUnreadCount(req.dealerId!);
        res.json({ count });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // PATCH /notifications/read-all
  router.patch(
    "/notifications/read-all",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        await storage.markAllDealerNotificationsRead(req.dealerId!);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // PATCH /notifications/:id/read
  router.patch(
    "/notifications/:id/read",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        await storage.markDealerNotificationRead(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== MEASUREMENTS =====

  // GET /measurements
  router.get(
    "/measurements",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const list = await storage.getMeasurements(req.dealerId!);
        // Include sashes for each measurement
        const result = await Promise.all(
          list.map(async (m) => {
            const sashes = await storage.getMeasurementSashes(m.id);
            return { ...m, sashes };
          })
        );
        res.json(result);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /measurements/:id
  router.get(
    "/measurements/:id",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const measurement = await storage.getMeasurement(req.params.id);
        if (!measurement || measurement.dealerId !== req.dealerId) {
          return res.status(404).json({ message: "Замер не найден" });
        }
        const sashes = await storage.getMeasurementSashes(measurement.id);
        const photos = await storage.getMeasurementPhotos(measurement.id);
        res.json({ ...measurement, sashes, photos });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /measurements — atomic "send to workshop".
  //
  // The mobile app no longer pushes drafts to the server: drafts live in the
  // device's SQLite, and a single POST creates the measurement, its sashes,
  // the order and its sashes in one request. There is no draft state on the
  // server anymore — everything that arrives here is final.
  router.post(
    "/measurements",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const {
          clientName,
          clientPhone,
          address,
          latitude,
          longitude,
          comment,
          totalCoefficient,
          signatureUrl,
          sashes,
        } = req.body;

        if (!Array.isArray(sashes) || sashes.length === 0) {
          return res
            .status(400)
            .json({ message: "Замер должен содержать хотя бы одну створку" });
        }

        const dealer = await storage.getDealer(req.dealerId!);
        if (!dealer) {
          return res.status(401).json({ message: "Дилер не найден" });
        }

        // 1) Create the measurement with status "pending" — it stays on
        //    review until the admin approves it in the CRM, at which point
        //    the convert endpoint creates the workshop order.
        const measurement = await storage.createMeasurement({
          dealerId: req.dealerId!,
          clientName,
          clientPhone,
          address,
          latitude,
          longitude,
          comment,
          totalCoefficient,
          signatureUrl,
          status: "pending",
        });

        // 2) Persist sashes attached to the measurement.
        for (const s of sashes) {
          await storage.createMeasurementSash({
            measurementId: measurement.id,
            width: s.width,
            height: s.height,
            systemName: s.systemName,
            systemType: s.systemType,
            category: s.category,
            control: s.control,
            coefficient: s.coefficient,
            room: s.room,
            roomName: s.roomName,
            photoUrl: s.photoUrl,
            fabricName: s.fabricName,
          });
        }

        // 3) Notify the admin (best-effort).
        const clientInfo = [clientName, clientPhone].filter(Boolean).join(", ");
        try {
          await notify({
            userId: dealer.userId,
            type: "measurement_sent",
            title: "Новый замер на рассмотрение",
            message: `${dealer.fullName} отправил замер: ${clientInfo || "без имени"}, ${address || "без адреса"}`,
            entityType: "measurement",
            entityId: measurement.id,
          });
        } catch (notifyError) {
          console.error("notify failed for measurement send:", notifyError);
        }

        try {
          await logAudit({
            userId: dealer.userId,
            action: "create",
            entityType: "measurement",
            entityId: measurement.id,
            metadata: {
              source: "mobile",
              dealerName: dealer.fullName,
            },
          });
        } catch (auditError) {
          console.error("logAudit failed for measurement send:", auditError);
        }

        res.json({
          measurementId: measurement.id,
          status: "pending",
        });
      } catch (error) {
        console.error("Save measurement error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /coefficients/calculate (public, no auth)
  router.post(
    "/coefficients/calculate",
    async (req: Request, res: Response) => {
      try {
        const { systemKey, category, width, height } = req.body;
        if (!systemKey || !category || !width || !height) {
          return res.status(400).json({ message: "Все параметры обязательны" });
        }

        const { getCoefficientDetailed } = await import("../coefficients");
        const result = getCoefficientDetailed(
          systemKey,
          category,
          parseFloat(width),
          parseFloat(height)
        );
        res.json(result);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== FABRICS & SYSTEMS =====

  // GET /fabrics — list fabrics for dealer's user
  router.get(
    "/fabrics",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const dealer = await storage.getDealer(req.dealerId!);
        if (!dealer) return res.status(401).json({ message: "Дилер не найден" });

        const allFabrics = await storage.getFabrics(dealer.userId);
        const colors = await storage.getColors(dealer.userId);
        const colorMap = new Map(colors.map((c) => [c.id, c.name]));

        const result = allFabrics.map((f) => ({
          ...f,
          colorName: f.colorId ? colorMap.get(f.colorId) || null : null,
        }));
        res.json(result);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /systems — list systems for dealer's user
  router.get(
    "/systems",
    dealerMobileAuthMiddleware,
    async (req: DealerMobileAuthRequest, res: Response) => {
      try {
        const dealer = await storage.getDealer(req.dealerId!);
        if (!dealer) return res.status(401).json({ message: "Дилер не найден" });

        const allSystems = await storage.getSystems(dealer.userId);
        const multipliers = await storage.getMultipliers(dealer.userId);
        const multMap = new Map(multipliers.map((m) => [m.id, parseFloat(m.value?.toString() || "0")]));

        const result = allSystems.map((s) => ({
          id: s.id,
          name: s.name,
          systemKey: s.systemKey,
          multiplierValue: s.multiplierId ? multMap.get(s.multiplierId) || null : null,
        }));
        res.json(result);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  return router;
}
