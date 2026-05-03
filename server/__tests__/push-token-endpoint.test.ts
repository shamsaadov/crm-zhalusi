// Integration tests for POST/DELETE /api/mobile/dealer/push-token.
//
// Run with: npx tsx --test server/__tests__/push-token-endpoint.test.ts
//
// We mock the `./storage` module so the router can be loaded without a DB.
// SESSION_SECRET is set inline because the dealer auth middleware reads it.

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import jwt from "jsonwebtoken";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret-for-push-token-tests";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost:5432/test";

// Track upsert/delete calls so we can assert what hit the storage layer.
const calls = {
  upsert: [] as Array<{ token: string; platform: string; dealerId: string | null; userId: string | null }>,
  del: [] as Array<{ token: string; platform: string }>,
};

const fakeStorage = {
  upsertDeviceToken: async (data: { token: string; platform: string; dealerId?: string | null; userId?: string | null }) => {
    calls.upsert.push({
      token: data.token,
      platform: data.platform,
      dealerId: data.dealerId ?? null,
      userId: data.userId ?? null,
    });
    return { id: "fake-id", ...data };
  },
  deleteDeviceToken: async (token: string, platform: string) => {
    calls.del.push({ token, platform });
  },
  // Unused in these tests but referenced by other route handlers when the
  // router is constructed; provide noops.
  getDealer: async () => null,
  getDealerByLogin: async () => null,
  getDealerNotifications: async () => [],
  getDealerUnreadCount: async () => 0,
  markAllDealerNotificationsRead: async () => undefined,
  markDealerNotificationRead: async () => undefined,
  getMeasurements: async () => [],
  getMeasurement: async () => null,
  getMeasurementSashes: async () => [],
  getMeasurementPhotos: async () => [],
  getOrders: async () => [],
  getOrder: async () => null,
  getFabrics: async () => [],
  getColors: async () => [],
  getSystems: async () => [],
  getMultipliers: async () => [],
  getDealerInstallmentPlans: async () => [],
};

mock.module("../storage", {
  namedExports: { storage: fakeStorage },
});
// notifications.ts wires up apns dead-token cleanup which references storage —
// stub it to a noop so loading the router via routes graph doesn't blow up.
mock.module("../notifications", {
  namedExports: {
    notify: async () => undefined,
    notifyDealer: async () => undefined,
    generatePeriodicNotifications: async () => undefined,
  },
});
mock.module("../audit", {
  namedExports: { logAudit: async () => undefined },
});

function makeDealerToken(dealerId: string): string {
  return jwt.sign({ dealerId, role: "dealer" }, process.env.SESSION_SECRET!, { expiresIn: "1h" });
}

async function withServer<T>(
  fn: (baseUrl: string) => Promise<T>
): Promise<T> {
  const { createDealerMobileRouter } = await import("../routes/dealer-mobile");
  const app = express();
  app.use(express.json());
  app.use("/api/mobile/dealer", createDealerMobileRouter());

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

function reset() {
  calls.upsert.length = 0;
  calls.del.length = 0;
}

test("POST /push-token rejects unauthenticated request with 401", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token rejects bad bearer token", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not-a-jwt",
      },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token persists token bound to authenticated dealer", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    assert.equal(calls.upsert.length, 1);
    assert.equal(calls.upsert[0].dealerId, "dealer-123");
    assert.equal(calls.upsert[0].platform, "ios");
    assert.equal(calls.upsert[0].token, "a".repeat(64));
    // Dealer-mobile route must NOT bind the token to a CRM user.
    assert.equal(calls.upsert[0].userId, null);
  });
});

test("POST /push-token rejects token shorter than 16 chars", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "short", platform: "ios" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token rejects token longer than 512 chars", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "a".repeat(513), platform: "ios" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token rejects non-string token", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: 12345, platform: "ios" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token rejects unknown platform", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "a".repeat(64), platform: "huawei" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token accepts android platform too", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-android-1");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "fcm-token-" + "x".repeat(60), platform: "android" }),
    });
    assert.equal(res.status, 200);
    assert.equal(calls.upsert.length, 1);
    assert.equal(calls.upsert[0].platform, "android");
    assert.equal(calls.upsert[0].dealerId, "dealer-android-1");
  });
});

test("POST /push-token rejects empty body with 400 (not 500)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-123");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});

test("DELETE /push-token unregisters via storage.deleteDeviceToken", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-456");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "b".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 200);
    assert.equal(calls.del.length, 1);
    assert.equal(calls.del[0].token, "b".repeat(64));
    assert.equal(calls.del[0].platform, "ios");
  });
});

test("DELETE /push-token rejects unauthenticated request", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "b".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.del.length, 0);
  });
});

test("DELETE /push-token rejects bad platform", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-456");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "b".repeat(64), platform: "huawei" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.del.length, 0);
  });
});

// ─── Rebinding & concurrency ───

test("POST /push-token: same token registered by different dealer rebinds to new owner", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const sameToken = "shared-device-" + "a".repeat(50);

    // First: dealer-A registers the token
    let auth = makeDealerToken("dealer-A");
    let res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: sameToken, platform: "ios" }),
    });
    assert.equal(res.status, 200);

    // Then: dealer-B logs in on the same device, registers same token
    auth = makeDealerToken("dealer-B");
    res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: sameToken, platform: "ios" }),
    });
    assert.equal(res.status, 200);

    // Both calls reach storage; the storage layer's onConflictDoUpdate handles
    // the actual rebind. Endpoint just passes through the latest dealerId.
    assert.equal(calls.upsert.length, 2);
    assert.equal(calls.upsert[0].dealerId, "dealer-A");
    assert.equal(calls.upsert[1].dealerId, "dealer-B");
    assert.equal(calls.upsert[0].token, sameToken);
    assert.equal(calls.upsert[1].token, sameToken);
  });
});

test("POST /push-token: concurrent same-token registrations from same dealer all succeed", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-concurrent");
    const token = "c".repeat(64);

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
          body: JSON.stringify({ token, platform: "ios" }),
        })
      )
    );
    for (const r of responses) {
      assert.equal(r.status, 200);
    }
    assert.equal(calls.upsert.length, 5);
  });
});

test("DELETE /push-token: deleting a non-existent token still returns 200 (idempotent)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-idem");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "DELETE",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "never-registered-" + "z".repeat(50), platform: "ios" }),
    });
    assert.equal(res.status, 200);
    // Storage call still happens — the SQL DELETE is a no-op for missing rows
    assert.equal(calls.del.length, 1);
  });
});

test("POST /push-token: rejects expired JWT", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const expiredToken = jwt.sign(
      { dealerId: "dealer-x", role: "dealer" },
      process.env.SESSION_SECRET!,
      { expiresIn: "-1h" }
    );
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${expiredToken}`,
      },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: rejects JWT with wrong role (CRM user instead of dealer)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const userToken = jwt.sign(
      { dealerId: "user-123", role: "user" }, // wrong role
      process.env.SESSION_SECRET!,
      { expiresIn: "1h" }
    );
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: rejects JWT signed with wrong secret", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const forged = jwt.sign(
      { dealerId: "dealer-x", role: "dealer" },
      "different-secret-attacker-knows",
      { expiresIn: "1h" }
    );
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${forged}`,
      },
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: trims of token at boundary 16 chars (accepts exactly 16)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const exact16 = "a".repeat(16);
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: exact16, platform: "ios" }),
    });
    assert.equal(res.status, 200);
    assert.equal(calls.upsert.length, 1);
  });
});

test("POST /push-token: rejects exactly 15 chars (off-by-one)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const fifteen = "a".repeat(15);
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: fifteen, platform: "ios" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: accepts exactly 512 chars (upper boundary)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const max = "a".repeat(512);
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: max, platform: "ios" }),
    });
    assert.equal(res.status, 200);
  });
});

test("POST /push-token: malformed JSON body returns 400 (Express default)", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: "not-valid-json",
    });
    // Express's body-parser rejects malformed JSON before our handler runs.
    assert.ok(res.status >= 400 && res.status < 500);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: missing platform field returns 400", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ token: "a".repeat(64) }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: missing token field returns 400", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      body: JSON.stringify({ platform: "ios" }),
    });
    assert.equal(res.status, 400);
    assert.equal(calls.upsert.length, 0);
  });
});

test("POST /push-token: Authorization header without Bearer prefix is rejected", async () => {
  reset();
  await withServer(async (baseUrl) => {
    const auth = makeDealerToken("dealer-bdy");
    const res = await fetch(`${baseUrl}/api/mobile/dealer/push-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth }, // no "Bearer "
      body: JSON.stringify({ token: "a".repeat(64), platform: "ios" }),
    });
    assert.equal(res.status, 401);
    assert.equal(calls.upsert.length, 0);
  });
});
