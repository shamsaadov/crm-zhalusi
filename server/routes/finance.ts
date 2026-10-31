import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { storage } from "../storage";
import { logAudit } from "../audit";
import {
  EXPENSE_OPERATION_TYPES,
  FINANCE_TYPES,
  INCOME_OPERATION_TYPES,
} from "@shared/schema";

interface AuthRequest extends Request {
  userId?: string;
}

type AuthMiddleware = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => void;


// Поля, которые клиент может задавать у финансовой операции. Остальное (id, userId,
// deletedAt) игнорируется — иначе правкой можно было переписать владельца операции.
const EDITABLE_FIELDS = [
  "type",
  "amount",
  "date",
  "cashboxId",
  "fromCashboxId",
  "toCashboxId",
  "dealerId",
  "supplierId",
  "expenseTypeId",
  "operationType",
  "comment",
  "isDraft",
] as const;

function pickEditable(body: unknown): Record<string, unknown> {
  const src = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of EDITABLE_FIELDS) {
    if (key in src) out[key] = src[key] === "" ? null : src[key];
  }
  return out;
}

/** Вид операции должен соответствовать типу (ПКО — виды поступлений, РКО — выплат). */
function validateOperationType(type: unknown, operationType: unknown): string | null {
  if (operationType === undefined || operationType === null) return null;
  if (typeof operationType !== "string") return "Неверный вид операции";
  if (type === "income" && !(INCOME_OPERATION_TYPES as readonly string[]).includes(operationType)) {
    return `«${operationType}» не подходит для поступления`;
  }
  if (type === "expense" && !(EXPENSE_OPERATION_TYPES as readonly string[]).includes(operationType)) {
    return `«${operationType}» не подходит для выплаты`;
  }
  if (type === "supplier_payment" && operationType !== "Оплата поставщику") {
    return "Оплата поставщику не может иметь другой вид операции";
  }
  if (type === "transfer") return "У перемещения нет вида операции";
  return null;
}

function validateOperation(data: Record<string, unknown>, partial: boolean): string | null {
  if (!partial || "type" in data) {
    if (!(FINANCE_TYPES as readonly string[]).includes(String(data.type))) return "Неверный тип операции";
  }
  if (!partial || "amount" in data) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return "Сумма должна быть больше нуля";
  }
  if (!partial || "date" in data) {
    if (typeof data.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return "Неверная дата";
  }
  return null;
}

export function createFinanceRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  // ===== FINANCE OPERATIONS =====
  router.get(
    "/finance",
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
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.get(
    "/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const operation = await storage.getFinanceOperation(req.params.id);
        if (!operation || operation.userId !== req.userId) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        const [dealerList, supplierList, cashboxList, expenseTypeList] = await Promise.all([
          storage.getDealers(req.userId!),
          storage.getSuppliers(req.userId!),
          storage.getCashboxes(req.userId!),
          storage.getExpenseTypes(req.userId!),
        ]);
        res.json({
          ...operation,
          dealer: dealerList.find((d) => d.id === operation.dealerId),
          supplier: supplierList.find((s) => s.id === operation.supplierId),
          cashbox: cashboxList.find((c) => c.id === operation.cashboxId),
          fromCashbox: cashboxList.find((c) => c.id === operation.fromCashboxId),
          toCashbox: cashboxList.find((c) => c.id === operation.toCashboxId),
          expenseType: expenseTypeList.find((e) => e.id === operation.expenseTypeId),
        });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/finance",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const data = pickEditable(req.body);
        const error =
          validateOperation(data, false) ?? validateOperationType(data.type, data.operationType);
        if (error) return res.status(400).json({ message: error });

        const operation = await storage.createFinanceOperation({
          ...(data as any),
          userId: req.userId!,
        });

        logAudit({
          userId: req.userId!,
          action: "create",
          entityType: "finance",
          entityId: operation.id,
          after: operation,
        });

        res.json(operation);
      } catch (error) {
        console.error("Create finance error:", error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.patch(
    "/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const before = await storage.getFinanceOperation(req.params.id);
        if (!before || before.userId !== req.userId) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        const data = pickEditable(req.body);
        const error =
          validateOperation(data, true) ??
          validateOperationType(data.type ?? before.type, "operationType" in data ? data.operationType : before.operationType);
        if (error) return res.status(400).json({ message: error });

        const operation = await storage.updateFinanceOperation(req.params.id, data as any);

        logAudit({
          userId: req.userId!,
          action: "update",
          entityType: "finance",
          entityId: req.params.id,
          before,
          after: operation,
        });

        res.json(operation);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/finance/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const before = await storage.getFinanceOperation(req.params.id);
        if (!before || before.userId !== req.userId) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        await storage.softDeleteFinanceOperation(req.params.id);

        logAudit({
          userId: req.userId!,
          action: "delete",
          entityType: "finance",
          entityId: req.params.id,
          before,
        });

        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.post(
    "/finance/:id/restore",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      try {
        const existing = await storage.getFinanceOperation(req.params.id);
        if (!existing || existing.userId !== req.userId) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        const operation = await storage.restoreFinanceOperation(req.params.id);
        res.json(operation);
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  router.delete(
    "/finance/:id/hard",
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

        const existing = await storage.getFinanceOperation(req.params.id);
        if (!existing || existing.userId !== req.userId) {
          return res.status(404).json({ message: "Операция не найдена" });
        }
        await storage.hardDeleteFinanceOperation(req.params.id);
        res.json({ success: true });
      } catch (error) {
        console.error(`[${req.method} ${req.path}]`, error);
        res.status(500).json({ message: "Ошибка сервера" });
      }
    }
  );

  return router;
}
