import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { storage } from "../storage";
import { notify } from "../notifications";
import { logAudit } from "../audit";

const JWT_SECRET = process.env.SESSION_SECRET!;

interface MobileAuthRequest extends Request {
  installerId?: string;
}

async function mobileAuthMiddleware(
  req: MobileAuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Не авторизован" });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, any>;

    // Standard installer token
    if (decoded.installerId) {
      req.installerId = decoded.installerId;
      return next();
    }

    // Dealer token — find or create linked installer
    if (decoded.dealerId && decoded.role === "dealer") {
      let installer = await storage.getInstallerByDealerId(decoded.dealerId);
      if (!installer) {
        const dealer = await storage.getDealer(decoded.dealerId);
        if (dealer) {
          installer = await storage.createInstaller({
            name: dealer.fullName,
            phone: dealer.phone || "",
            login: `d_${dealer.login || decoded.dealerId}`,
            password: dealer.password || "",
            userId: dealer.userId,
            dealerId: decoded.dealerId,
            isActive: true,
          });
        }
      }
      if (installer) {
        req.installerId = installer.id;
        return next();
      }
    }

    return res.status(401).json({ message: "Неверный токен" });
  } catch {
    return res.status(401).json({ message: "Неверный токен" });
  }
}

export function createMobileRouter(): Router {
  const router = Router();

  // POST /auth/login (mounted at /api/mobile, so full path = /api/mobile/auth/login)
  router.post(
    "/auth/login",
    async (req: Request, res: Response) => {
      try {
        const { login, password } = req.body;
        if (!login || !password) {
          return res
            .status(400)
            .json({ message: "Логин и пароль обязательны" });
        }

        const installer = await storage.getInstallerByLogin(login);
        if (!installer || !installer.isActive) {
          return res
            .status(401)
            .json({ message: "Неверный логин или пароль" });
        }

        const valid = await bcrypt.compare(password, installer.password);
        if (!valid) {
          return res
            .status(401)
            .json({ message: "Неверный логин или пароль" });
        }

        const token = jwt.sign(
          { installerId: installer.id },
          JWT_SECRET,
          { expiresIn: "30d" }
        );

        const { password: _, ...safe } = installer;
        res.json({ token, installer: safe });
      } catch (error) {
        console.error("Mobile login error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /auth/me
  router.get(
    "/auth/me",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const installer = await storage.getInstaller(req.installerId!);
        if (!installer || !installer.isActive) {
          return res
            .status(401)
            .json({ message: "Аккаунт не найден или деактивирован" });
        }
        const { password: _, ...safe } = installer;
        res.json(safe);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /measurements
  router.get(
    "/measurements",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const list = await storage.getMeasurements(req.installerId!);
        res.json(list);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /measurements/:id
  router.get(
    "/measurements/:id",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const measurement = await storage.getMeasurement(req.params.id);
        if (
          !measurement ||
          measurement.installerId !== req.installerId
        ) {
          return res
            .status(404)
            .json({ message: "Замер не найден" });
        }
        const sashes = await storage.getMeasurementSashes(
          measurement.id
        );
        const photos = await storage.getMeasurementPhotos(
          measurement.id
        );
        res.json({ ...measurement, sashes, photos });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /measurements (create/update measurement with sashes)
  router.post(
    "/measurements",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const {
          id,
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

        let measurement;

        if (id) {
          // Update existing
          const existing = await storage.getMeasurement(id);
          if (
            !existing ||
            existing.installerId !== req.installerId
          ) {
            return res
              .status(404)
              .json({ message: "Замер не найден" });
          }

          measurement = await storage.updateMeasurement(id, {
            clientName,
            clientPhone,
            address,
            latitude,
            longitude,
            comment,
            totalCoefficient,
            signatureUrl,
          });

          // Replace sashes
          if (sashes && Array.isArray(sashes)) {
            await storage.deleteMeasurementSashesByMeasurementId(id);
            for (const s of sashes) {
              await storage.createMeasurementSash({
                measurementId: id,
                width: s.width,
                height: s.height,
                systemName: s.systemName,
                category: s.category,
                control: s.control,
                coefficient: s.coefficient,
                room: s.room,
                roomName: s.roomName,
                photoUrl: s.photoUrl,
              });
            }
          }
        } else {
          // Create new
          measurement = await storage.createMeasurement({
            installerId: req.installerId!,
            clientName,
            clientPhone,
            address,
            latitude,
            longitude,
            comment,
            totalCoefficient,
            signatureUrl,
          });

          if (sashes && Array.isArray(sashes)) {
            for (const s of sashes) {
              await storage.createMeasurementSash({
                measurementId: measurement.id,
                width: s.width,
                height: s.height,
                systemName: s.systemName,
                category: s.category,
                control: s.control,
                coefficient: s.coefficient,
                room: s.room,
                roomName: s.roomName,
                photoUrl: s.photoUrl,
              });
            }
          }
        }

        // Return with sashes
        const savedSashes = await storage.getMeasurementSashes(
          measurement!.id
        );
        res.json({ ...measurement, sashes: savedSashes });
      } catch (error) {
        console.error("Save measurement error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // DELETE /measurements/:id (only draft)
  router.delete(
    "/measurements/:id",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const measurement = await storage.getMeasurement(req.params.id);
        if (
          !measurement ||
          measurement.installerId !== req.installerId
        ) {
          return res
            .status(404)
            .json({ message: "Замер не найден" });
        }
        if (measurement.status !== "draft") {
          return res.status(400).json({
            message: "Можно удалить только черновик",
          });
        }
        await storage.deleteMeasurement(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /measurements/:id/send (send measurement to CRM, creates order)
  router.post(
    "/measurements/:id/send",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const measurement = await storage.getMeasurement(req.params.id);
        if (
          !measurement ||
          measurement.installerId !== req.installerId
        ) {
          return res
            .status(404)
            .json({ message: "Замер не найден" });
        }
        if (measurement.status !== "draft") {
          return res.status(400).json({
            message: "Замер уже отправлен",
          });
        }

        const installer = await storage.getInstaller(
          req.installerId!
        );
        if (!installer) {
          return res
            .status(401)
            .json({ message: "Монтажник не найден" });
        }

        const sashes = await storage.getMeasurementSashes(
          measurement.id
        );

        // Create order under admin user
        const adminUserId = installer.userId;
        const orderNumber = await storage.getNextOrderNumber(
          adminUserId
        );
        const today = new Date().toISOString().split("T")[0];

        const clientInfo = [
          measurement.clientName,
          measurement.clientPhone,
        ]
          .filter(Boolean)
          .join(", ");
        const orderComment = `Монтажник: ${installer.name} | ${clientInfo} | ${measurement.address || ""}`.trim();

        const order = await storage.createOrder({
          orderNumber,
          date: today,
          status: "Новый",
          comment: orderComment,
          userId: adminUserId,
          salePrice: measurement.totalCoefficient || "0",
        });

        // Create orderSashes from measurementSashes
        for (const s of sashes) {
          await storage.createOrderSash({
            orderId: order.id,
            width: s.width || "0",
            height: s.height || "0",
            controlSide: s.control,
            room: s.room,
            roomName: s.roomName,
          });
        }

        // Update measurement status
        await storage.updateMeasurement(measurement.id, {
          status: "sent",
          sentAt: new Date(),
          orderId: order.id,
        });

        // Notify admin
        await notify({
          userId: adminUserId,
          type: "measurement_sent",
          title: "Новый замер от монтажника",
          message: `${installer.name} отправил замер: ${clientInfo || "без имени"}, ${measurement.address || "без адреса"}`,
          entityType: "order",
          entityId: order.id,
        });

        // Audit log
        await logAudit({
          userId: adminUserId,
          action: "create",
          entityType: "measurement",
          entityId: measurement.id,
          metadata: {
            source: "mobile",
            installerName: installer.name,
            orderId: order.id,
          },
        });

        res.json({
          success: true,
          orderId: order.id,
          orderNumber,
          status: "sent",
        });
      } catch (error) {
        console.error("Send measurement error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /stats
  router.get(
    "/stats",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const list = await storage.getMeasurements(req.installerId!);
        const total = list.length;
        const drafts = list.filter((m) => m.status === "draft").length;
        const sent = list.filter((m) => m.status === "sent").length;
        const inProduction = list.filter(
          (m) => m.status === "in_production"
        ).length;
        const ready = list.filter((m) => m.status === "ready").length;
        const installed = list.filter(
          (m) => m.status === "installed"
        ).length;

        res.json({
          total,
          drafts,
          sent,
          inProduction,
          ready,
          installed,
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // POST /coefficients/calculate
  router.post(
    "/coefficients/calculate",
    async (req: Request, res: Response) => {
      try {
        const { systemKey, category, width, height } = req.body;
        if (!systemKey || !category || !width || !height) {
          return res
            .status(400)
            .json({ message: "Все параметры обязательны" });
        }

        const { getCoefficientDetailed } = await import(
          "../coefficients"
        );
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

  // GET /notifications
  router.get(
    "/notifications",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const list = await storage.getInstallerNotifications(
          req.installerId!
        );
        res.json(
          list.map((n) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            is_read: n.isRead,
            is_broadcast: n.isBroadcast,
            created_at: n.createdAt,
          }))
        );
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // GET /notifications/unread-count
  router.get(
    "/notifications/unread-count",
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        const count = await storage.getInstallerUnreadCount(
          req.installerId!
        );
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
    mobileAuthMiddleware,
    async (req: MobileAuthRequest, res: Response) => {
      try {
        await storage.markAllInstallerNotificationsRead(req.installerId!);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  return router;
}
