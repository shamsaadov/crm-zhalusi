// API пометки на удаление (как «Помеченные на удаление» в настройках УЭС).
//   GET    /api/deletions                      — помеченные объекты и их связи
//   POST   /api/deletions/:kind/:id/mark       — пометить
//   POST   /api/deletions/:kind/:id/restore    — снять пометку
//   DELETE /api/deletions/:kind/:id            — удалить окончательно (только без связей)
//   DELETE /api/deletions                      — удалить все помеченные без связей

import { Router, Request, Response, NextFunction } from "express";
import {
  hardDelete,
  isDeletableKind,
  listMarked,
  markDeleted,
  restoreDeleted,
} from "../deletions";
import { logAudit } from "../audit";

interface AuthRequest extends Request {
  userId?: string;
}
type AuthMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => void;

export function createDeletionsRouter(authMiddleware: AuthMiddleware): Router {
  const router = Router();

  router.get("/deletions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      res.json(await listMarked(req.userId!));
    } catch (error) {
      console.error("List deletions error:", error);
      res.status(500).json({ message: "Не удалось получить помеченные объекты" });
    }
  });

  router.post("/deletions/:kind/:id/:action(mark|restore)", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { kind, id, action } = req.params;
      if (!isDeletableKind(kind)) return res.status(400).json({ message: "Неизвестный тип объекта" });
      const ok = action === "mark" ? await markDeleted(kind, id, req.userId!) : await restoreDeleted(kind, id, req.userId!);
      if (!ok) return res.status(404).json({ message: "Объект не найден" });
      logAudit({
        userId: req.userId!,
        action: action === "mark" ? "mark_deleted" : "restore",
        entityType: kind,
        entityId: id,
      });
      res.json({ success: true });
    } catch (error) {
      console.error("Mark/restore error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  router.delete("/deletions/:kind/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const { kind, id } = req.params;
      if (!isDeletableKind(kind)) return res.status(400).json({ message: "Неизвестный тип объекта" });
      const result = await hardDelete(kind, id, req.userId!);
      if (!result.ok) return res.status(result.status).json({ message: result.message });
      logAudit({ userId: req.userId!, action: "hard_delete", entityType: kind, entityId: id });
      res.json({ success: true });
    } catch (error) {
      console.error("Hard delete error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  router.delete("/deletions", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
      const items = await listMarked(req.userId!);
      let removed = 0;
      const failed: string[] = [];
      for (const item of items.filter((i) => i.dependencies.length === 0)) {
        const result = await hardDelete(item.kind, item.id, req.userId!);
        if (result.ok) {
          removed++;
          logAudit({ userId: req.userId!, action: "hard_delete", entityType: item.kind, entityId: item.id });
        } else {
          failed.push(item.title);
        }
      }
      res.json({ removed, failed });
    } catch (error) {
      console.error("Bulk hard delete error:", error);
      res.status(500).json({ message: "Ошибка сервера" });
    }
  });

  return router;
}
