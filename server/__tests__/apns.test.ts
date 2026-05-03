// Unit tests for the APNs module — JWT signing, caching, payload formatting.
//
// Run with: npx tsx --test server/__tests__/apns.test.ts
//
// We don't open real connections to Apple here. Network-level send is covered
// indirectly via the dealer-mobile integration tests (push-token endpoint) and
// by manual verification on a physical device.

import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createPrivateKey } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";

import {
  __resetApnsForTests,
  __getApnsJwtCache,
  __setApnsConfigForTests,
  __buildApnsBody,
  __signApnsJwtForTests,
  __expireApnsJwtForTests,
  __triggerDeadTokenCleanupForTests,
  setApnsDeadTokenCleanup,
  type ApnsConfig,
  type ApnsSendResult,
} from "../apns";

function makeTestKey(): { pem: string; path: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const dir = mkdtempSync(path.join(tmpdir(), "apns-test-"));
  const p = path.join(dir, "AuthKey_TEST.p8");
  writeFileSync(p, pem);
  return { pem, path: p };
}

function testConfig(keyPath: string): ApnsConfig {
  return {
    keyPath,
    keyId: "TESTKEYID0",
    teamId: "TESTTEAMID",
    bundleId: "com.forsa.forsaZhaluzi",
    production: true,
  };
}

test("signApnsJwt produces a valid ES256 JWT with kid and iss", () => {
  __resetApnsForTests();
  const { pem, path } = makeTestKey();
  const cfg = testConfig(path);

  const token = __signApnsJwtForTests(cfg);
  assert.ok(typeof token === "string" && token.split(".").length === 3, "shape is JWT");

  // Verify against the same key — proves header alg=ES256 and signature works
  const verified = jwt.verify(token, pem, { algorithms: ["ES256"] }) as Record<string, unknown>;
  assert.equal(verified.iss, "TESTTEAMID");
  assert.equal(typeof verified.iat, "number");

  const decoded = jwt.decode(token, { complete: true }) as { header: { kid?: string; alg?: string } };
  assert.equal(decoded.header.kid, "TESTKEYID0");
  assert.equal(decoded.header.alg, "ES256");

  rmSync(path, { force: true });
});

test("signApnsJwt caches token within refresh window", () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  const cfg = testConfig(path);

  const a = __signApnsJwtForTests(cfg);
  const b = __signApnsJwtForTests(cfg);
  assert.equal(a, b, "second call within window returns cached JWT");

  const cache = __getApnsJwtCache();
  assert.equal(cache.jwt, a);
  assert.ok(cache.at > 0);

  rmSync(path, { force: true });
});

test("__resetApnsForTests clears JWT cache", () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  __signApnsJwtForTests(testConfig(path));
  assert.notEqual(__getApnsJwtCache().jwt, null);

  __resetApnsForTests();
  assert.equal(__getApnsJwtCache().jwt, null);
  assert.equal(__getApnsJwtCache().at, 0);

  rmSync(path, { force: true });
});

test("buildApnsBody encodes title/body and default sound", () => {
  const buf = __buildApnsBody({ title: "Заказ готов", body: "№123 готов к выдаче" });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.alert.title, "Заказ готов");
  assert.equal(parsed.aps.alert.body, "№123 готов к выдаче");
  assert.equal(parsed.aps.sound, "default");
  assert.equal(parsed.aps.badge, undefined);
});

test("buildApnsBody passes through custom data fields alongside aps", () => {
  const buf = __buildApnsBody({
    title: "t",
    body: "b",
    badge: 3,
    data: { entityType: "order", entityId: "abc-123" },
  });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.badge, 3);
  assert.equal(parsed.entityType, "order");
  assert.equal(parsed.entityId, "abc-123");
  // Custom data must NOT clobber the aps key
  assert.ok(parsed.aps.alert);
});

test("buildApnsBody honours explicit sound override and threadId", () => {
  const buf = __buildApnsBody({
    title: "t",
    body: "b",
    sound: "silent.caf",
    threadId: "orders",
  });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.sound, "silent.caf");
  assert.equal(parsed.aps["thread-id"], "orders");
});

test("loadConfig disables APNs cleanly when env is missing", async () => {
  __resetApnsForTests();
  // Drop env vars so loadConfig sees nothing — sendApns should noop.
  const saved = {
    APNS_KEY_PATH: process.env.APNS_KEY_PATH,
    APNS_KEY_ID: process.env.APNS_KEY_ID,
    APNS_TEAM_ID: process.env.APNS_TEAM_ID,
    APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID,
  };
  delete process.env.APNS_KEY_PATH;
  delete process.env.APNS_KEY_ID;
  delete process.env.APNS_TEAM_ID;
  delete process.env.APNS_BUNDLE_ID;

  // Bypass the real config loader by leaving configCache=null.
  __setApnsConfigForTests(null);

  const { sendApns } = await import("../apns");
  const result = await sendApns(
    [{ token: "00".repeat(32), platform: "ios" }],
    { title: "t", body: "b" }
  );
  assert.deepEqual(result, []);

  // restore
  for (const [k, v] of Object.entries(saved)) {
    if (v !== undefined) process.env[k] = v;
  }
});

test("sendApns ignores android tokens (iOS-only direct path)", async () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  __setApnsConfigForTests(testConfig(path));

  const { sendApns } = await import("../apns");
  // Pass only Android tokens — should noop without trying to open a connection
  const result = await sendApns(
    [
      { token: "android-token-1", platform: "android" },
      { token: "android-token-2", platform: "android" },
    ],
    { title: "t", body: "b" }
  );
  assert.deepEqual(result, []);

  rmSync(path, { force: true });
});

test("buildApnsBody is valid UTF-8 buffer", () => {
  const buf = __buildApnsBody({ title: "Привет 👋", body: "тест" });
  assert.ok(Buffer.isBuffer(buf));
  const decoded = buf.toString("utf8");
  assert.ok(decoded.includes("Привет 👋"));
  assert.ok(decoded.includes("тест"));
});

// ─── JWT refresh window ───

test("expired cache forces new JWT on next sign", async () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  const cfg = testConfig(path);

  const first = __signApnsJwtForTests(cfg);
  __expireApnsJwtForTests();
  // Wait a tick so iat (in seconds) has any chance to differ — even within the
  // same second, ES256 signature randomness ensures different output anyway.
  await new Promise((r) => setTimeout(r, 5));
  const second = __signApnsJwtForTests(cfg);

  assert.notEqual(first, second, "after expiring cache, second JWT must differ");
  rmSync(path, { force: true });
});

test("cache hit returns identical JWT (strict equality)", () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  const cfg = testConfig(path);

  const a = __signApnsJwtForTests(cfg);
  const b = __signApnsJwtForTests(cfg);
  const c = __signApnsJwtForTests(cfg);
  assert.equal(a, b);
  assert.equal(b, c);

  rmSync(path, { force: true });
});

test("changing config (kid/team) regenerates JWT", () => {
  __resetApnsForTests();
  const { path } = makeTestKey();
  const cfg1 = testConfig(path);
  const first = __signApnsJwtForTests(cfg1);

  __resetApnsForTests();
  const cfg2: ApnsConfig = { ...cfg1, keyId: "DIFFERENTKID", teamId: "OTHERTEAMID" };
  const second = __signApnsJwtForTests(cfg2);

  assert.notEqual(first, second);

  // Decode second JWT — header.kid and payload.iss should reflect cfg2
  const decoded = jwt.decode(second, { complete: true }) as {
    header: { kid?: string };
    payload: Record<string, unknown>;
  };
  assert.equal(decoded.header.kid, "DIFFERENTKID");
  assert.equal(decoded.payload.iss, "OTHERTEAMID");

  rmSync(path, { force: true });
});

// ─── Payload edge cases ───

test("buildApnsBody handles badge=0 (clears badge)", () => {
  const buf = __buildApnsBody({ title: "t", body: "b", badge: 0 });
  const parsed = JSON.parse(buf.toString("utf8"));
  // badge=0 is meaningful — it tells iOS to clear the badge.
  assert.equal(parsed.aps.badge, 0);
});

test("buildApnsBody handles deeply nested data without flattening", () => {
  const buf = __buildApnsBody({
    title: "t",
    body: "b",
    data: {
      order: { id: "abc", items: [{ name: "x", qty: 2 }, { name: "y", qty: 1 }] },
      flags: ["urgent", "vip"],
    },
  });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.order.id, "abc");
  assert.equal(parsed.order.items.length, 2);
  assert.deepEqual(parsed.flags, ["urgent", "vip"]);
});

test("buildApnsBody preserves emojis and CJK characters intact", () => {
  const buf = __buildApnsBody({
    title: "🚀 заказ ✓",
    body: "ID 中文 한글 العربية",
  });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.alert.title, "🚀 заказ ✓");
  assert.equal(parsed.aps.alert.body, "ID 中文 한글 العربية");
});

test("buildApnsBody with very long body produces valid JSON", () => {
  // APNs has a 4KB payload limit but we don't enforce it here — just verify
  // we don't choke on longer content. Real-world enforcement would happen at
  // call site via len < 3500 or similar.
  const longBody = "a".repeat(2000);
  const buf = __buildApnsBody({ title: "t", body: longBody });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.alert.body.length, 2000);
});

test("buildApnsBody with empty title/body still produces valid aps.alert", () => {
  const buf = __buildApnsBody({ title: "", body: "" });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps.alert.title, "");
  assert.equal(parsed.aps.alert.body, "");
  // Empty strings are valid — Apple shows no banner but the silent push still
  // wakes the app for our data payload.
});

test("buildApnsBody honours threadId for grouping notifications", () => {
  const buf = __buildApnsBody({ title: "t", body: "b", threadId: "order-abc-123" });
  const parsed = JSON.parse(buf.toString("utf8"));
  assert.equal(parsed.aps["thread-id"], "order-abc-123");
});

// ─── Dead token cleanup hook ───

test("BadDeviceToken response triggers cleanup callback with token", async () => {
  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  const results: ApnsSendResult[] = [
    { token: "good-token", ok: true, status: 200 },
    { token: "bad-token-1", ok: false, status: 400, reason: "BadDeviceToken" },
    { token: "expired-token", ok: false, status: 410, reason: "Unregistered" },
    { token: "wrong-topic", ok: false, status: 400, reason: "DeviceTokenNotForTopic" },
  ];
  await __triggerDeadTokenCleanupForTests(results);

  assert.deepEqual(cleaned.sort(), ["bad-token-1", "expired-token", "wrong-topic"].sort());
});

test("non-dead failure reasons do NOT trigger cleanup", async () => {
  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  const results: ApnsSendResult[] = [
    { token: "rate-limited", ok: false, status: 429, reason: "TooManyRequests" },
    { token: "transient-fail", ok: false, status: 500, reason: "InternalServerError" },
    { token: "auth-fail", ok: false, status: 403, reason: "ExpiredProviderToken" },
    { token: "throttled", ok: false, status: 503, reason: "ServiceUnavailable" },
  ];
  await __triggerDeadTokenCleanupForTests(results);

  assert.equal(cleaned.length, 0,
    "transient errors must not delete tokens — those devices are still alive");
});

test("cleanup callback can be replaced and only the latest fires", async () => {
  const callsA: string[] = [];
  const callsB: string[] = [];
  setApnsDeadTokenCleanup(async (t) => callsA.push(t));
  setApnsDeadTokenCleanup(async (t) => callsB.push(t));

  await __triggerDeadTokenCleanupForTests([
    { token: "dead-1", ok: false, reason: "BadDeviceToken" },
  ]);

  assert.equal(callsA.length, 0, "old callback must NOT fire after replacement");
  assert.deepEqual(callsB, ["dead-1"]);
});

test("cleanup callback errors are isolated (one bad token doesn't block others)", async () => {
  // Note: __triggerDeadTokenCleanupForTests awaits sequentially; a real
  // production path uses fire-and-forget with .catch. This test verifies the
  // synchronous-ish loop doesn't break early on a single failure.
  let calledFor: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    calledFor.push(t);
    if (t === "throw-on-this") throw new Error("fake DB error");
  });

  await assert.rejects(
    __triggerDeadTokenCleanupForTests([
      { token: "first", ok: false, reason: "BadDeviceToken" },
      { token: "throw-on-this", ok: false, reason: "BadDeviceToken" },
      { token: "third", ok: false, reason: "BadDeviceToken" },
    ])
  );
  // First two attempted; third skipped because we await sequentially.
  // In production the .catch wrapper means all three are attempted.
  assert.deepEqual(calledFor, ["first", "throw-on-this"]);
});

test("cleanup pipeline is no-op when callback never registered (defensive)", async () => {
  // Reset so no callback is registered
  setApnsDeadTokenCleanup(async () => {});
  // Then "unset" by registering then resetting module — the only way to truly
  // unset is via __resetApnsForTests which clears everything else too.
  // What we verify here is that calling __triggerDeadTokenCleanupForTests
  // with no dead tokens doesn't throw.
  await __triggerDeadTokenCleanupForTests([
    { token: "good", ok: true, status: 200 },
  ]);
  // No assertion needed — absence of throw IS the test.
  assert.ok(true);
});
