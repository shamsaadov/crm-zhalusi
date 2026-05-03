// End-to-end integration test for the full push pipeline.
//
// Unlike notify-dealer.test.ts (which mocks `apns.ts` to a stub) and
// apns-http2.test.ts (which calls sendApns directly), THIS test wires up the
// real production chain:
//
//   notifyDealer → real notifications.ts (sets up cleanup hook on import)
//                → real apns.ts (sendApns + signed JWT + HTTP/2)
//                → local h2c mock server (instead of api.push.apple.com)
//                → cleanup hook on 410 → real storage.deleteDeviceToken
//
// We mock only `./storage` (no DB). Everything else is the same code path
// that ships to production.
//
// Run with: npx tsx --experimental-test-module-mocks --test \
//             server/__tests__/notify-dealer-e2e.test.ts

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost/test";

// ─── Storage mock (the only mocked layer) ────────────────────────────────────

interface DealerNotificationRow {
  dealerId: string | null;
  userId: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
}

interface DeviceTokenRow {
  token: string;
  platform: string;
}

const state = {
  inserted: [] as DealerNotificationRow[],
  tokensByDealer: new Map<string, DeviceTokenRow[]>(),
  deleted: [] as Array<{ token: string; platform: string }>,
};

mock.module("../storage", {
  namedExports: {
    storage: {
      createDealerNotification: async (data: DealerNotificationRow) => {
        state.inserted.push(data);
        return { id: "fake-id", ...data };
      },
      getDeviceTokensForDealer: async (dealerId: string) => {
        return state.tokensByDealer.get(dealerId) ?? [];
      },
      deleteDeviceToken: async (token: string, platform: string) => {
        state.deleted.push({ token, platform });
      },
    },
  },
});

function reset() {
  state.inserted.length = 0;
  state.tokensByDealer.clear();
  state.deleted.length = 0;
}

// ─── Test key + APNs config setup ────────────────────────────────────────────

function makeTestKey(): { keyPath: string; cleanup: () => void } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const dir = mkdtempSync(path.join(tmpdir(), "apns-e2e-"));
  const keyPath = path.join(dir, "AuthKey_TEST.p8");
  writeFileSync(keyPath, pem);
  return { keyPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

// ─── h2c mock APNs server ────────────────────────────────────────────────────

interface MockApnsRequest {
  path: string;
  authorization: string;
  apnsTopic: string;
  apnsPushType: string;
  body: Record<string, unknown>;
}

async function startMockApns(
  responder: (req: MockApnsRequest) => { status: number; reason?: string }
): Promise<{ url: string; captured: MockApnsRequest[]; close: () => Promise<void> }> {
  const captured: MockApnsRequest[] = [];
  const server = http2.createServer();

  server.on("stream", (stream, headers) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      const req: MockApnsRequest = {
        path: String(headers[":path"] ?? ""),
        authorization: String(headers["authorization"] ?? ""),
        apnsTopic: String(headers["apns-topic"] ?? ""),
        apnsPushType: String(headers["apns-push-type"] ?? ""),
        body: bodyText ? JSON.parse(bodyText) : {},
      };
      captured.push(req);

      const reply = responder(req);
      stream.respond({ ":status": reply.status, "content-type": "application/json" });
      if (reply.status === 200) {
        stream.end();
      } else {
        stream.end(JSON.stringify({ reason: reply.reason ?? "Unknown" }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    captured,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

// Wait for fire-and-forget push + cleanup to land. Real HTTP/2 round-trips
// take real time (loopback, but still a few ms each) — pure microtask flush
// is not enough. Poll until the predicate is true or timeout fires.
async function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  // Don't throw — let the caller's assertion produce a clearer failure msg.
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("E2E: notifyDealer → DB insert + APNs request hits Apple endpoint with correct shape", async () => {
  reset();
  const { keyPath, cleanup } = makeTestKey();
  const mockServer = await startMockApns(() => ({ status: 200 }));

  try {
    // notifications.ts wires setApnsDeadTokenCleanup at module load — import
    // it AFTER setting up state so the cleanup fn references our mock storage.
    const { notifyDealer } = await import("../notifications");
    const { __setApnsConfigForTests, __setApnsHostForTests, __resetApnsForTests } =
      await import("../apns");

    __resetApnsForTests();
    __setApnsConfigForTests({
      keyPath,
      keyId: "TEST00KEYID",
      teamId: "TEST00TEAM",
      bundleId: "com.forsa.forsaZhaluzi",
      production: true,
    });
    __setApnsHostForTests(mockServer.url);

    state.tokensByDealer.set("dealer-7", [
      { token: "device-aaa", platform: "ios" },
      { token: "device-bbb", platform: "ios" },
    ]);

    await notifyDealer({
      dealerId: "dealer-7",
      userId: "user-7",
      title: "Заказ #42 готов",
      message: "Можно забирать",
      entityType: "order",
      entityId: "order-42",
    });
    await waitFor(() => mockServer.captured.length === 2);

    // DB layer
    assert.equal(state.inserted.length, 1);
    assert.equal(state.inserted[0].dealerId, "dealer-7");
    assert.equal(state.inserted[0].title, "Заказ #42 готов");
    assert.equal(state.inserted[0].entityId, "order-42");

    // Network layer — both tokens received pushes
    assert.equal(mockServer.captured.length, 2);
    const paths = mockServer.captured.map((r) => r.path).sort();
    assert.deepEqual(paths, ["/3/device/device-aaa", "/3/device/device-bbb"]);

    for (const req of mockServer.captured) {
      assert.equal(req.apnsTopic, "com.forsa.forsaZhaluzi");
      assert.equal(req.apnsPushType, "alert");
      assert.ok(req.authorization.startsWith("bearer "));
      const aps = (req.body as { aps: { alert: { title: string; body: string } } }).aps;
      assert.equal(aps.alert.title, "Заказ #42 готов");
      assert.equal(aps.alert.body, "Можно забирать");
      const data = req.body as { entityType: string; entityId: string };
      assert.equal(data.entityType, "order");
      assert.equal(data.entityId, "order-42");
    }

    // No cleanup expected for 200 OK
    assert.equal(state.deleted.length, 0);

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
    cleanup();
  }
});

test("E2E: 410 Unregistered triggers real cleanup all the way to storage.deleteDeviceToken", async () => {
  reset();
  const { keyPath, cleanup } = makeTestKey();

  // Server returns 410 for one specific token, 200 for others
  const mockServer = await startMockApns((req) => {
    if (req.path.endsWith("/zombie-tok")) {
      return { status: 410, reason: "Unregistered" };
    }
    return { status: 200 };
  });

  try {
    const { notifyDealer } = await import("../notifications");
    const { __setApnsConfigForTests, __setApnsHostForTests, __resetApnsForTests } =
      await import("../apns");

    __resetApnsForTests();
    __setApnsConfigForTests({
      keyPath,
      keyId: "TEST00KEYID",
      teamId: "TEST00TEAM",
      bundleId: "com.forsa.forsaZhaluzi",
      production: true,
    });
    __setApnsHostForTests(mockServer.url);

    state.tokensByDealer.set("dealer-zombie", [
      { token: "alive-tok", platform: "ios" },
      { token: "zombie-tok", platform: "ios" },
    ]);

    await notifyDealer({
      dealerId: "dealer-zombie",
      userId: "user-z",
      title: "t",
      message: "m",
    });
    await waitFor(() => mockServer.captured.length === 2 && state.deleted.length >= 1);

    // 2 pushes attempted
    assert.equal(mockServer.captured.length, 2);
    // Cleanup hook fired EXACTLY for the zombie token via real storage mock
    assert.equal(state.deleted.length, 1);
    assert.equal(state.deleted[0].token, "zombie-tok");
    assert.equal(state.deleted[0].platform, "ios");

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
    cleanup();
  }
});

test("E2E: 403 ExpiredProviderToken does NOT delete tokens (defensive)", async () => {
  reset();
  const { keyPath, cleanup } = makeTestKey();
  const mockServer = await startMockApns(() => ({ status: 403, reason: "ExpiredProviderToken" }));

  try {
    const { notifyDealer } = await import("../notifications");
    const { __setApnsConfigForTests, __setApnsHostForTests, __resetApnsForTests } =
      await import("../apns");

    __resetApnsForTests();
    __setApnsConfigForTests({
      keyPath,
      keyId: "TEST00KEYID",
      teamId: "TEST00TEAM",
      bundleId: "com.forsa.forsaZhaluzi",
      production: true,
    });
    __setApnsHostForTests(mockServer.url);

    state.tokensByDealer.set("dealer-403", [
      { token: "token-1", platform: "ios" },
      { token: "token-2", platform: "ios" },
      { token: "token-3", platform: "ios" },
    ]);

    await notifyDealer({
      dealerId: "dealer-403",
      userId: "u",
      title: "t",
      message: "m",
    });
    await waitFor(() => mockServer.captured.length === 3);

    // All 3 attempted
    assert.equal(mockServer.captured.length, 3);
    // None deleted — the JWT being expired is OUR problem, not the device's
    assert.equal(state.deleted.length, 0,
      "ExpiredProviderToken means signing key is stale — must NOT delete user tokens");

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
    cleanup();
  }
});

test("E2E: APNs disabled (no env config) — DB still writes, no network call", async () => {
  reset();
  // Don't set up keys/host — leaves apns module disabled
  const mockServer = await startMockApns(() => ({ status: 200 }));

  try {
    const { notifyDealer } = await import("../notifications");
    const { __resetApnsForTests, __setApnsConfigForTests, __setApnsHostForTests } =
      await import("../apns");

    __resetApnsForTests();
    // Explicitly disable via null config — what happens when env is missing
    __setApnsConfigForTests(null);

    state.tokensByDealer.set("dealer-disabled", [
      { token: "any-tok", platform: "ios" },
    ]);

    await notifyDealer({
      dealerId: "dealer-disabled",
      userId: "u",
      title: "t",
      message: "m",
    });
    // No HTTP traffic expected; just give the fire-and-forget promise a moment
    // to resolve to its noop-result before asserting.
    await waitFor(() => state.inserted.length === 1);
    await new Promise((r) => setTimeout(r, 50));

    // DB layer still works
    assert.equal(state.inserted.length, 1);
    // No HTTP call — apns is disabled
    assert.equal(mockServer.captured.length, 0);
    // No cleanup either (no responses to process)
    assert.equal(state.deleted.length, 0);

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
  }
});

test("E2E: Android tokens silently skipped (current iOS-only direct APNs path)", async () => {
  reset();
  const { keyPath, cleanup } = makeTestKey();
  const mockServer = await startMockApns(() => ({ status: 200 }));

  try {
    const { notifyDealer } = await import("../notifications");
    const { __setApnsConfigForTests, __setApnsHostForTests, __resetApnsForTests } =
      await import("../apns");

    __resetApnsForTests();
    __setApnsConfigForTests({
      keyPath,
      keyId: "TEST00KEYID",
      teamId: "TEST00TEAM",
      bundleId: "com.forsa.forsaZhaluzi",
      production: true,
    });
    __setApnsHostForTests(mockServer.url);

    state.tokensByDealer.set("dealer-mixed", [
      { token: "ios-real", platform: "ios" },
      { token: "android-skipped", platform: "android" },
    ]);

    await notifyDealer({
      dealerId: "dealer-mixed",
      userId: "u",
      title: "t",
      message: "m",
    });
    await waitFor(() => mockServer.captured.length === 1);

    // DB inserted regardless of platform
    assert.equal(state.inserted.length, 1);
    // Only iOS hits APNs
    assert.equal(mockServer.captured.length, 1);
    assert.equal(mockServer.captured[0].path, "/3/device/ios-real");

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
    cleanup();
  }
});

test("E2E: 10 concurrent notifyDealer calls — all pushes land, no race in JWT cache", async () => {
  reset();
  const { keyPath, cleanup } = makeTestKey();
  const mockServer = await startMockApns(() => ({ status: 200 }));

  try {
    const { notifyDealer } = await import("../notifications");
    const { __setApnsConfigForTests, __setApnsHostForTests, __resetApnsForTests } =
      await import("../apns");

    __resetApnsForTests();
    __setApnsConfigForTests({
      keyPath,
      keyId: "TEST00KEYID",
      teamId: "TEST00TEAM",
      bundleId: "com.forsa.forsaZhaluzi",
      production: true,
    });
    __setApnsHostForTests(mockServer.url);

    state.tokensByDealer.set("dealer-burst", [{ token: "burst-tok", platform: "ios" }]);

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        notifyDealer({
          dealerId: "dealer-burst",
          userId: "u",
          title: `Burst ${i}`,
          message: `Body ${i}`,
        })
      )
    );
    await waitFor(() => mockServer.captured.length === 10 && state.inserted.length === 10);

    assert.equal(state.inserted.length, 10);
    assert.equal(mockServer.captured.length, 10);

    // Every push must have a valid bearer JWT — verify all 10 pass JWT shape
    for (const req of mockServer.captured) {
      assert.match(req.authorization, /^bearer ey/);
    }
    // All 10 pushes likely share the SAME cached JWT (signed once)
    const uniqueJwts = new Set(mockServer.captured.map((r) => r.authorization));
    assert.equal(uniqueJwts.size, 1,
      "JWT cache should produce identical signature for concurrent calls within window");

    __setApnsHostForTests(null);
    __resetApnsForTests();
  } finally {
    await mockServer.close();
    cleanup();
  }
});
