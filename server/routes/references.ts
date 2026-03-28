import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";

interface AuthRequest extends Request {
  userId?: string;
}

type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => void;

export function createReferencesRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // ===== COLORS =====
  router.get(
    "/colors",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getColors(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/colors",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const color = await storage.createColor({
          ...req.body,
          userId: req.userId,
        });
        res.json(color);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/colors/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const color = await storage.updateColor(req.params.id, req.body);
        res.json(color);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/colors/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteColor(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== FABRICS =====
  router.get(
    "/fabrics",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getFabrics(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/fabrics",
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

  router.patch(
    "/fabrics/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const fabric = await storage.updateFabric(req.params.id, req.body);
        res.json(fabric);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/fabrics/:id",
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

  // ===== CASHBOXES =====
  router.get(
    "/cashboxes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getCashboxes(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/cashboxes",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const cashbox = await storage.createCashbox({
          ...req.body,
          userId: req.userId,
        });
        res.json(cashbox);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/cashboxes/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const cashbox = await storage.updateCashbox(req.params.id, req.body);
        res.json(cashbox);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/cashboxes/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteCashbox(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== SYSTEMS =====
  router.get(
    "/systems",
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

  router.post(
    "/systems",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const system = await storage.createSystem({
          ...req.body,
          userId: req.userId,
        });
        res.json(system);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/systems/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const system = await storage.updateSystem(req.params.id, req.body);
        res.json(system);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/systems/:id",
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
  router.get(
    "/systems/:id/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const components = await storage.getSystemComponents(req.params.id);
        res.json(components);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/systems/:id/components",
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
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/systems/:id/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteSystemComponentsBySystemId(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== COEFFICIENTS =====
  router.get(
    "/coefficients/available-keys",
    async (req: Request, res: Response) => {
      try {
        const { getAvailableSystems } = await import("../coefficients.js");
        const systemKeys = getAvailableSystems();
        res.json({ systemKeys });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.get(
    "/coefficients/available-categories",
    async (req: Request, res: Response) => {
      try {
        const { systemKey } = req.query;

        if (!systemKey) {
          return res.status(400).json({
            message: "Необходим параметр: systemKey",
          });
        }

        const { getSystemCategories } = await import("../coefficients.js");
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

  router.post(
    "/coefficients/calculate",
    async (req: Request, res: Response) => {
      try {
        const { systemKey, category, width, height } = req.body;

        if (!systemKey || !category || !width || !height) {
          return res.status(400).json({
            message: "Необходимы параметры: systemKey, category, width, height",
          });
        }

        const { getCoefficientDetailed } = await import("../coefficients.js");
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
  router.get(
    "/expense-types",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getExpenseTypes(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/expense-types",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const expenseType = await storage.createExpenseType({
          ...req.body,
          userId: req.userId,
        });
        res.json(expenseType);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/expense-types/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const expenseType = await storage.updateExpenseType(
          req.params.id,
          req.body
        );
        res.json(expenseType);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/expense-types/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteExpenseType(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== COMPONENTS =====
  router.get(
    "/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getComponents(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/components",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const component = await storage.createComponent({
          ...req.body,
          userId: req.userId,
        });
        res.json(component);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/components/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const component = await storage.updateComponent(
          req.params.id,
          req.body
        );
        res.json(component);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/components/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteComponent(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== MULTIPLIERS =====
  router.get(
    "/multipliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getMultipliers(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/multipliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const multiplier = await storage.createMultiplier({
          ...req.body,
          userId: req.userId,
        });
        res.json(multiplier);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/multipliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const multiplier = await storage.updateMultiplier(
          req.params.id,
          req.body
        );
        res.json(multiplier);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/multipliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteMultiplier(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // ===== SUPPLIERS =====
  router.get(
    "/suppliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = await storage.getSuppliers(req.userId!);
        res.json(data);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/suppliers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const supplier = await storage.createSupplier({
          ...req.body,
          userId: req.userId,
        });
        res.json(supplier);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/suppliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const supplier = await storage.updateSupplier(req.params.id, req.body);
        res.json(supplier);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/suppliers/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        await storage.deleteSupplier(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  // Supplier stats for quick view
  router.get(
    "/suppliers/:id/stats",
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

  return router;
}
