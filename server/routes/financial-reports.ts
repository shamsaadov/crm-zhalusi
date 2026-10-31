// API управленческих отчётов по образцу УЭС: ОПиУ, ДДС, Баланс, Взаиморасчёты.
//   GET /api/reports/pnl?from&to
//   GET /api/reports/cash-flow?from&to&cashboxId
//   GET /api/reports/balance?asOf
//   GET /api/reports/settlements?asOf

import { Router, Request, Response, NextFunction } from "express";
import {
  calculateBalance,
  calculateCashFlow,
  calculateProfitAndLoss,
  dealerSettlements,
  supplierSettlements,
  rub,
} from "../reports/financial";
import { loadFinData } from "../reports/load";

interface AuthRequest extends Request {
  userId?: string;
}

type AuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => void;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function parseDate(v: unknown): string | null | "invalid" {
  if (typeof v !== "string" || v === "") return null;
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return "invalid";
  return v;
}

/** Период отчёта: по умолчанию текущий месяц. */
function readPeriod(req: Request, res: Response): { from: string; to: string } | null {
  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (from === "invalid" || to === "invalid") {
    res.status(400).json({ message: "Дата должна быть в формате ГГГГ-ММ-ДД" });
    return null;
  }
  const today = todayKey();
  const period = { from: from ?? monthStart(to ?? today), to: to ?? today };
  if (period.from > period.to) {
    res.status(400).json({ message: "Дата начала периода позже даты окончания" });
    return null;
  }
  return period;
}

export function createFinancialReportsRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  router.get("/reports/pnl", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;
      const data = await loadFinData(req.userId!);
      const { _core, ...report } = calculateProfitAndLoss(data, period.from, period.to);
      res.json(report);
    } catch (error) {
      console.error("P&L report error:", error);
      res.status(500).json({ message: "Ошибка построения ОПиУ" });
    }
  });

  router.get("/reports/cash-flow", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const period = readPeriod(req, res);
      if (!period) return;
      const cashboxId =
        typeof req.query.cashboxId === "string" && req.query.cashboxId !== "all"
          ? req.query.cashboxId
          : null;
      const data = await loadFinData(req.userId!);
      if (cashboxId && !data.cashboxes.some((c) => c.id === cashboxId)) {
        return res.status(404).json({ message: "Касса не найдена" });
      }
      res.json(calculateCashFlow(data, period.from, period.to, { cashboxId }));
    } catch (error) {
      console.error("Cash flow report error:", error);
      res.status(500).json({ message: "Ошибка построения ДДС" });
    }
  });

  router.get("/reports/balance", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const asOf = parseDate(req.query.asOf);
      if (asOf === "invalid") {
        return res.status(400).json({ message: "Дата должна быть в формате ГГГГ-ММ-ДД" });
      }
      const data = await loadFinData(req.userId!);
      res.json(calculateBalance(data, asOf ?? todayKey()));
    } catch (error) {
      console.error("Balance report error:", error);
      res.status(500).json({ message: "Ошибка построения баланса" });
    }
  });

  router.get("/reports/settlements", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const asOf = parseDate(req.query.asOf);
      if (asOf === "invalid") {
        return res.status(400).json({ message: "Дата должна быть в формате ГГГГ-ММ-ДД" });
      }
      const date = asOf ?? todayKey();
      const data = await loadFinData(req.userId!);
      const map = (kind: "dealer" | "supplier") => (s: ReturnType<typeof dealerSettlements>[number]) => ({
        id: s.id,
        kind,
        name: s.name,
        charged: rub(s.charged),
        paid: rub(s.paid),
        balance: rub(s.balance),
      });
      res.json({
        asOf: date,
        dealers: dealerSettlements(data, date).map(map("dealer")),
        suppliers: supplierSettlements(data, date).map(map("supplier")),
      });
    } catch (error) {
      console.error("Settlements report error:", error);
      res.status(500).json({ message: "Ошибка построения взаиморасчётов" });
    }
  });

  return router;
}
