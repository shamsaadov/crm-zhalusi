import { Router, Request, Response } from "express";
import fs from "fs/promises";
import path from "path";

// Relative to process.cwd(): production starts as `cd forsa-crm-zhalusi && npm run start`,
// so cwd is the repo root. Files are published by the app repo's tool/publish_android.sh.
const VERSION_FILE = path.join("uploads", "app", "version.json");
const APK_FILE = path.join("uploads", "app", "forsa-zhaluzi.apk");
const APK_FILENAME = "forsa-zhaluzi.apk";

export function createAppUpdatesRouter(): Router {
  const router = Router();

  // GET /version (mounted at /api/mobile/app, so full path = /api/mobile/app/version)
  // Public, no auth: the mobile app checks for updates before login and in guest mode.
  router.get("/version", async (req: Request, res: Response) => {
    const filePath = path.resolve(process.cwd(), VERSION_FILE);
    // Both 200 and 404 must be uncacheable: a cached 404 would hide a
    // freshly published version from every client behind the same proxy.
    res.setHeader("Cache-Control", "no-store");
    try {
      const raw = await fs.readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      res.json(parsed);
    } catch (error) {
      // Missing, unreadable or invalid version.json — the app treats 404 as
      // "no update available" and stays silent.
      console.error(`[${req.method} ${req.path}]`, error);
      res.status(404).json({ message: "Версия не опубликована" });
    }
  });

  // GET /download — public, no auth. Streams the APK with Content-Length
  // (the app needs it for the download progress bar).
  router.get("/download", async (req: Request, res: Response) => {
    const filePath = path.resolve(process.cwd(), APK_FILE);
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) {
        return res.status(404).json({ message: "Файл не найден" });
      }
    } catch {
      return res.status(404).json({ message: "Файл не найден" });
    }
    res.sendFile(
      filePath,
      {
        headers: {
          "Content-Type": "application/vnd.android.package-archive",
          "Content-Disposition": `attachment; filename="${APK_FILENAME}"`,
        },
      },
      (err) => {
        if (err && !res.headersSent) {
          console.error(`[${req.method} ${req.path}]`, err);
          res.status(404).json({ message: "Файл не найден" });
        }
      }
    );
  });

  return router;
}
