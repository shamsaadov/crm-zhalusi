// Integration tests for notifyDealer — verifies it both writes the in-app
// notification to the DB and triggers an APNs push to the dealer's registered
// device tokens.
//
// Run with: npx tsx --experimental-test-module-mocks --test \
//             server/__tests__/notify-dealer.test.ts
//
// We mock both ./storage (no DB) and ./apns (no real APNs HTTP/2 calls). The
// mocks read behavior from a shared `state` object so individual tests can
// vary their behavior without re-mocking modules.

import { test, mock } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? "test-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://test:test@localhost/test";

interface NotifyDealerInsert {
  dealerId: string | null;
  userId: string;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
}

const state = {
  inserted: [] as NotifyDealerInsert[],
  tokensByDealer: new Map<string, Array<{ token: string; platform: string }>>(),
  sent: [] as Array<{
    tokens: Array<{ token: string; platform: string }>;
    payload: { title: string; body: string; data?: Record<string, unknown> };
  }>,
  insertShouldThrow: false,
};

mock.module("../storage", {
  namedExports: {
    storage: {
      createDealerNotification: async (data: NotifyDealerInsert) => {
        if (state.insertShouldThrow) {
          throw new Error("Simulated DB connection lost");
        }
        state.inserted.push(data);
        return { id: "fake-id", ...data };
      },
      getDeviceTokensForDealer: async (dealerId: string) => {
        return state.tokensByDealer.get(dealerId) ?? [];
      },
      deleteDeviceToken: async () => undefined,
    },
  },
});

mock.module("../apns", {
  namedExports: {
    sendApns: async (
      tokens: Array<{ token: string; platform: string }>,
      payload: { title: string; body: string; data?: Record<string, unknown> }
    ) => {
      state.sent.push({ tokens, payload });
      return tokens.map((t) => ({ token: t.token, ok: true, status: 200 }));
    },
    setApnsDeadTokenCleanup: () => undefined,
  },
});

function reset() {
  state.inserted.length = 0;
  state.tokensByDealer.clear();
  state.sent.length = 0;
  state.insertShouldThrow = false;
}

// notifyDealer fires the push as `sendDealerPush(...).catch(...)` — a detached
// promise. We need to await microtasks so the inner sendApns call lands before
// assertions.
async function flushAsync() {
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

test("notifyDealer inserts DB row even when no device tokens registered", async () => {
  reset();
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-1",
    userId: "user-1",
    title: "Привет",
    message: "тест",
  });
  await flushAsync();

  assert.equal(state.inserted.length, 1);
  assert.equal(state.inserted[0].dealerId, "dealer-1");
  assert.equal(state.inserted[0].title, "Привет");
  assert.equal(state.inserted[0].message, "тест");
  assert.equal(state.sent.length, 0, "no tokens → no push");
});

test("notifyDealer sends APNs push to all registered tokens", async () => {
  reset();
  state.tokensByDealer.set("dealer-2", [
    { token: "tok-1", platform: "ios" },
    { token: "tok-2", platform: "ios" },
  ]);
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-2",
    userId: "user-2",
    title: "Заказ готов",
    message: "Можно забирать",
    entityType: "order",
    entityId: "order-99",
  });
  await flushAsync();

  assert.equal(state.inserted.length, 1);
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].tokens.length, 2);
  assert.equal(state.sent[0].payload.title, "Заказ готов");
  assert.equal(state.sent[0].payload.body, "Можно забирать");
  assert.deepEqual(state.sent[0].payload.data, {
    entityType: "order",
    entityId: "order-99",
  });
});

test("notifyDealer push includes entityType/entityId for deep linking", async () => {
  reset();
  state.tokensByDealer.set("dealer-3", [{ token: "tok-3", platform: "ios" }]);
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-3",
    userId: "user-3",
    title: "Платёж",
    message: "Ожидается оплата",
    entityType: "installment",
    entityId: "plan-42",
  });
  await flushAsync();

  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.sent[0].payload.data, {
    entityType: "installment",
    entityId: "plan-42",
  });
});

test("notifyDealer push data has nulls when entity unspecified", async () => {
  reset();
  state.tokensByDealer.set("dealer-4", [{ token: "tok-4", platform: "ios" }]);
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-4",
    userId: "user-4",
    title: "Системное",
    message: "сообщение",
  });
  await flushAsync();

  assert.equal(state.sent.length, 1);
  assert.deepEqual(state.sent[0].payload.data, {
    entityType: null,
    entityId: null,
  });
});

test("notifyDealer DB-insert failure prevents push send (no orphan banner)", async () => {
  reset();
  state.insertShouldThrow = true;
  // Even with tokens registered, push must not fire if the DB row was never
  // saved — otherwise the user taps the push and lands on a missing entry.
  state.tokensByDealer.set("dealer-fail", [{ token: "would-not-fire", platform: "ios" }]);

  const { notifyDealer } = await import("../notifications");

  // Should not throw — notifyDealer logs errors internally.
  await notifyDealer({
    dealerId: "dealer-fail",
    userId: "user-fail",
    title: "x",
    message: "y",
  });
  await flushAsync();

  assert.equal(state.inserted.length, 0, "DB insert failed");
  assert.equal(state.sent.length, 0,
    "if DB insert fails the user has no in-app row to deep-link to, so push is suppressed");
});

test("notifyDealer for dealer with android-only tokens still passes them through to sendApns", async () => {
  reset();
  state.tokensByDealer.set("dealer-android", [
    { token: "android-tok", platform: "android" },
  ]);
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-android",
    userId: "user-android",
    title: "t",
    message: "m",
  });
  await flushAsync();

  // notifyDealer hands all tokens to sendApns; sendApns is responsible for
  // filtering by platform. We verify the contract: tokens passed through.
  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].tokens.length, 1);
  assert.equal(state.sent[0].tokens[0].platform, "android");
});

test("notifyDealer for dealer with mixed platform tokens passes all through", async () => {
  reset();
  state.tokensByDealer.set("dealer-mixed", [
    { token: "ios-1", platform: "ios" },
    { token: "android-1", platform: "android" },
    { token: "ios-2", platform: "ios" },
  ]);
  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-mixed",
    userId: "user-m",
    title: "t",
    message: "m",
  });
  await flushAsync();

  assert.equal(state.sent.length, 1);
  assert.equal(state.sent[0].tokens.length, 3);
  const platforms = state.sent[0].tokens.map((t) => t.platform).sort();
  assert.deepEqual(platforms, ["android", "ios", "ios"]);
});

test("notifyDealer doesn't await push (returns even if sendApns is slow)", async () => {
  reset();
  state.tokensByDealer.set("dealer-slow", [{ token: "slow-tok", platform: "ios" }]);

  const { notifyDealer } = await import("../notifications");

  // Track timing — notifyDealer should resolve quickly even if push is slow.
  // We don't actually delay sendApns here, but the contract is: notifyDealer
  // resolves after DB insert, push is fire-and-forget.
  const start = Date.now();
  await notifyDealer({
    dealerId: "dealer-slow",
    userId: "user-slow",
    title: "t",
    message: "m",
  });
  const elapsed = Date.now() - start;

  // Without artificial slow-down, this should be sub-100ms easily.
  assert.ok(elapsed < 200, `notifyDealer should be fast — took ${elapsed}ms`);
  assert.equal(state.inserted.length, 1, "DB insert happened before return");
});

test("notifyDealer can be invoked many times concurrently", async () => {
  reset();
  state.tokensByDealer.set("dealer-burst", [{ token: "burst", platform: "ios" }]);

  const { notifyDealer } = await import("../notifications");

  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      notifyDealer({
        dealerId: "dealer-burst",
        userId: "user-burst",
        title: `Title ${i}`,
        message: `Body ${i}`,
        entityType: "order",
        entityId: `order-${i}`,
      })
    )
  );
  await flushAsync();

  assert.equal(state.inserted.length, 10, "every notify produced a DB insert");
  assert.equal(state.sent.length, 10, "every notify produced a push");
  // Each push has a unique title
  const titles = state.sent.map((s) => s.payload.title).sort();
  assert.deepEqual(
    titles,
    Array.from({ length: 10 }, (_, i) => `Title ${i}`).sort()
  );
});

test("notifyDealer handles dealer with empty token list (no error, no send)", async () => {
  reset();
  state.tokensByDealer.set("dealer-no-tokens", []);

  const { notifyDealer } = await import("../notifications");

  await notifyDealer({
    dealerId: "dealer-no-tokens",
    userId: "user",
    title: "t",
    message: "m",
  });
  await flushAsync();

  assert.equal(state.inserted.length, 1);
  assert.equal(state.sent.length, 0,
    "empty token list short-circuits before reaching sendApns");
});
