// Integration tests for GET /api/mobile/app/version and /api/mobile/app/download.
//
// Run with: npx tsx --test server/__tests__/app-updates.test.ts
//
// The router resolves uploads/app/* from process.cwd() at request time, so each
// test chdirs into its own temp directory and lays out (or omits) the files.

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";

const originalCwd = process.cwd();

async function makeTempCwd(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "app-updates-test-"));
  process.chdir(dir);
  return dir;
}

async function cleanupTempCwd(dir: string): Promise<void> {
  process.chdir(originalCwd);
  await fs.rm(dir, { recursive: true, force: true });
}

async function withServer<T>(fn: (baseUrl: string) => Promise<T>): Promise<T> {
  const { createAppUpdatesRouter } = await import("../routes/app-updates");
  const app = express();
  app.use("/api/mobile/app", createAppUpdatesRouter());

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const versionPayload = {
  versionName: "1.2.1",
  versionCode: 9,
  changelog: "Что нового в этой версии",
  minSupportedCode: 8,
};

test("GET /version returns 404 when version.json is missing", async () => {
  const dir = await makeTempCwd();
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/app/version`);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.ok(typeof body.message === "string");
    });
  } finally {
    await cleanupTempCwd(dir);
  }
});

test("GET /version returns parsed JSON with Cache-Control: no-store when present", async () => {
  const dir = await makeTempCwd();
  try {
    await fs.mkdir(path.join(dir, "uploads", "app"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "uploads", "app", "version.json"),
      JSON.stringify(versionPayload),
      "utf-8"
    );
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/app/version`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(res.headers.get("content-type") ?? "", /application\/json/);
      const body = await res.json();
      assert.deepEqual(body, versionPayload);
    });
  } finally {
    await cleanupTempCwd(dir);
  }
});

test("GET /version returns 404 when version.json contains invalid JSON", async () => {
  const dir = await makeTempCwd();
  try {
    await fs.mkdir(path.join(dir, "uploads", "app"), { recursive: true });
    await fs.writeFile(
      path.join(dir, "uploads", "app", "version.json"),
      "{ not valid json",
      "utf-8"
    );
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/app/version`);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.ok(typeof body.message === "string");
    });
  } finally {
    await cleanupTempCwd(dir);
  }
});

test("GET /download returns 404 when APK is missing", async () => {
  const dir = await makeTempCwd();
  try {
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/app/download`);
      assert.equal(res.status, 404);
      const body = await res.json();
      assert.ok(typeof body.message === "string");
    });
  } finally {
    await cleanupTempCwd(dir);
  }
});

test("GET /download serves APK with correct headers and body when present", async () => {
  const dir = await makeTempCwd();
  try {
    const apkBytes = Buffer.from("fake-apk-content-for-tests");
    await fs.mkdir(path.join(dir, "uploads", "app"), { recursive: true });
    await fs.writeFile(path.join(dir, "uploads", "app", "forsa-zhaluzi.apk"), apkBytes);
    await withServer(async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/mobile/app/download`);
      assert.equal(res.status, 200);
      assert.equal(
        res.headers.get("content-type"),
        "application/vnd.android.package-archive"
      );
      assert.equal(res.headers.get("content-length"), String(apkBytes.length));
      assert.equal(
        res.headers.get("content-disposition"),
        'attachment; filename="forsa-zhaluzi.apk"'
      );
      const body = Buffer.from(await res.arrayBuffer());
      assert.ok(body.equals(apkBytes));
    });
  } finally {
    await cleanupTempCwd(dir);
  }
});
