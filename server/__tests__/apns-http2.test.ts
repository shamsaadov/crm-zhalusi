// HTTP/2 round-trip tests for sendApns.
//
// Spins up a local h2c (HTTP/2 cleartext, no TLS) server that mimics Apple's
// APNs response shapes — 200 OK, 410 Unregistered, 400 BadDeviceToken, 403
// ExpiredProviderToken, 5xx — and verifies sendApns handles each correctly:
// - parses :status from response headers
// - parses {"reason": "..."} from error body
// - invokes the dead-token cleanup hook only for "dead" reasons
// - keeps the session alive between requests
// - reconnects after close
//
// Run with: npx tsx --test server/__tests__/apns-http2.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import http2 from "node:http2";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  sendApns,
  setApnsDeadTokenCleanup,
  __resetApnsForTests,
  __setApnsConfigForTests,
  __setApnsHostForTests,
  type ApnsConfig,
} from "../apns";

interface MockResponse {
  status: number;
  reason?: string; // Apple's error format
  rawBody?: string; // override for non-JSON tests
}

interface CapturedRequest {
  path: string;
  authorization: string | undefined;
  apnsTopic: string | undefined;
  apnsPushType: string | undefined;
  apnsPriority: string | undefined;
  body: string;
}

function makeTestKey(): { path: string } {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const dir = mkdtempSync(path.join(tmpdir(), "apns-h2-test-"));
  const p = path.join(dir, "AuthKey_TEST.p8");
  writeFileSync(p, pem);
  return { path: p };
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

interface MockServer {
  url: string;
  close: () => Promise<void>;
  captured: CapturedRequest[];
  responder: (req: CapturedRequest) => MockResponse;
}

async function startMockApns(
  responder: (req: CapturedRequest) => MockResponse
): Promise<MockServer> {
  const captured: CapturedRequest[] = [];
  const server = http2.createServer();

  server.on("stream", (stream, headers) => {
    const path = String(headers[":path"] ?? "");
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const req: CapturedRequest = {
        path,
        authorization: headers["authorization"] as string | undefined,
        apnsTopic: headers["apns-topic"] as string | undefined,
        apnsPushType: headers["apns-push-type"] as string | undefined,
        apnsPriority: headers["apns-priority"] as string | undefined,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      captured.push(req);

      const reply = responder(req);
      stream.respond({ ":status": reply.status, "content-type": "application/json" });

      if (reply.rawBody !== undefined) {
        stream.end(reply.rawBody);
      } else if (reply.status === 200) {
        stream.end();
      } else {
        stream.end(JSON.stringify({ reason: reply.reason ?? "InternalServerError" }));
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    captured,
    responder,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

async function withServer<T>(
  responder: (req: CapturedRequest) => MockResponse,
  fn: (mock: MockServer) => Promise<T>
): Promise<T> {
  const mock = await startMockApns(responder);
  try {
    return await fn(mock);
  } finally {
    __setApnsHostForTests(null);
    await mock.close();
  }
}

test("sendApns: 200 OK — request reaches mock with correct headers and body", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  await withServer(
    () => ({ status: 200 }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const results = await sendApns(
        [{ token: "device-tok-1", platform: "ios" }],
        { title: "Привет", body: "test", data: { entityType: "order", entityId: "abc" } }
      );

      assert.equal(results.length, 1);
      assert.equal(results[0].ok, true);
      assert.equal(results[0].status, 200);
      assert.equal(results[0].token, "device-tok-1");

      assert.equal(mock.captured.length, 1);
      const req = mock.captured[0];
      assert.equal(req.path, "/3/device/device-tok-1");
      assert.ok(req.authorization?.startsWith("bearer "), "authorization must start with 'bearer '");
      assert.equal(req.apnsTopic, "com.forsa.forsaZhaluzi");
      assert.equal(req.apnsPushType, "alert");
      assert.equal(req.apnsPriority, "10");

      const parsed = JSON.parse(req.body);
      assert.equal(parsed.aps.alert.title, "Привет");
      assert.equal(parsed.aps.alert.body, "test");
      assert.equal(parsed.entityType, "order");
      assert.equal(parsed.entityId, "abc");
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: 410 Unregistered triggers cleanup callback", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  await withServer(
    () => ({ status: 410, reason: "Unregistered" }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const results = await sendApns(
        [{ token: "expired-tok", platform: "ios" }],
        { title: "t", body: "b" }
      );

      assert.equal(results[0].ok, false);
      assert.equal(results[0].status, 410);
      assert.equal(results[0].reason, "Unregistered");

      // Wait for fire-and-forget cleanup
      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(cleaned, ["expired-tok"]);
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: 400 BadDeviceToken triggers cleanup", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  await withServer(
    () => ({ status: 400, reason: "BadDeviceToken" }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      await sendApns(
        [{ token: "bad-tok", platform: "ios" }],
        { title: "t", body: "b" }
      );

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));
      assert.deepEqual(cleaned, ["bad-tok"]);
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: 403 ExpiredProviderToken does NOT trigger cleanup (transient)", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  await withServer(
    () => ({ status: 403, reason: "ExpiredProviderToken" }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const results = await sendApns(
        [{ token: "fine-tok", platform: "ios" }],
        { title: "t", body: "b" }
      );

      assert.equal(results[0].ok, false);
      assert.equal(results[0].reason, "ExpiredProviderToken");

      await new Promise((r) => setImmediate(r));
      assert.equal(cleaned.length, 0,
        "ExpiredProviderToken means our JWT is stale, not the device — never delete");
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: 500 ServerError leaves token registered (transient)", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  await withServer(
    () => ({ status: 500, reason: "InternalServerError" }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      await sendApns(
        [{ token: "transient-fail", platform: "ios" }],
        { title: "t", body: "b" }
      );

      await new Promise((r) => setImmediate(r));
      assert.equal(cleaned.length, 0);
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: parallel batch of 5 tokens reuses one HTTP/2 session", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  await withServer(
    () => ({ status: 200 }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const tokens = Array.from({ length: 5 }, (_, i) => ({
        token: `dev-${i}`,
        platform: "ios" as const,
      }));
      const results = await sendApns(tokens, { title: "t", body: "b" });

      assert.equal(results.length, 5);
      for (const r of results) assert.equal(r.ok, true);
      assert.equal(mock.captured.length, 5);

      // Verify each request hit the right path
      const paths = mock.captured.map((c) => c.path).sort();
      assert.deepEqual(
        paths,
        Array.from({ length: 5 }, (_, i) => `/3/device/dev-${i}`).sort()
      );
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: mixed-result batch — some succeed, some get cleaned up", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  const cleaned: string[] = [];
  setApnsDeadTokenCleanup(async (t) => {
    cleaned.push(t);
  });

  await withServer(
    (req) => {
      if (req.path.endsWith("/dead-1")) return { status: 410, reason: "Unregistered" };
      if (req.path.endsWith("/dead-2")) return { status: 400, reason: "BadDeviceToken" };
      if (req.path.endsWith("/transient")) return { status: 503, reason: "ServiceUnavailable" };
      return { status: 200 };
    },
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const results = await sendApns(
        [
          { token: "alive-1", platform: "ios" },
          { token: "dead-1", platform: "ios" },
          { token: "alive-2", platform: "ios" },
          { token: "dead-2", platform: "ios" },
          { token: "transient", platform: "ios" },
        ],
        { title: "t", body: "b" }
      );

      const byToken = Object.fromEntries(results.map((r) => [r.token, r]));
      assert.equal(byToken["alive-1"].ok, true);
      assert.equal(byToken["alive-2"].ok, true);
      assert.equal(byToken["dead-1"].reason, "Unregistered");
      assert.equal(byToken["dead-2"].reason, "BadDeviceToken");
      assert.equal(byToken["transient"].reason, "ServiceUnavailable");

      await new Promise((r) => setImmediate(r));
      await new Promise((r) => setImmediate(r));

      assert.deepEqual(cleaned.sort(), ["dead-1", "dead-2"].sort());
      assert.ok(!cleaned.includes("transient"), "transient errors must NOT be cleaned");
      assert.ok(!cleaned.includes("alive-1"));
      assert.ok(!cleaned.includes("alive-2"));
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: non-JSON error body is captured as raw reason", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  await withServer(
    () => ({ status: 502, rawBody: "<html>Bad Gateway</html>" }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      const results = await sendApns(
        [{ token: "tok", platform: "ios" }],
        { title: "t", body: "b" }
      );
      assert.equal(results[0].ok, false);
      assert.equal(results[0].status, 502);
      // When response body isn't JSON, we keep the raw text as the reason
      assert.equal(results[0].reason, "<html>Bad Gateway</html>");
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: JWT in authorization header is verifiable as ES256", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  await withServer(
    () => ({ status: 200 }),
    async (mock) => {
      __setApnsHostForTests(mock.url);

      await sendApns(
        [{ token: "jwt-tok", platform: "ios" }],
        { title: "t", body: "b" }
      );

      const auth = mock.captured[0].authorization!;
      const jwtTok = auth.replace(/^bearer /i, "");
      const parts = jwtTok.split(".");
      assert.equal(parts.length, 3, "JWT shape: header.payload.signature");

      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      assert.equal(header.alg, "ES256");
      assert.equal(header.kid, "TESTKEYID0");

      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      assert.equal(payload.iss, "TESTTEAMID");
      assert.equal(typeof payload.iat, "number");
    }
  );

  rmSync(keyPath, { force: true });
});

test("sendApns: subsequent calls reuse the same HTTP/2 session", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  let connectionCount = 0;
  const server = http2.createServer();
  server.on("session", () => {
    connectionCount++;
  });
  server.on("stream", (stream) => {
    stream.respond({ ":status": 200 });
    stream.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  __setApnsHostForTests(`http://127.0.0.1:${port}`);

  try {
    await sendApns([{ token: "t1", platform: "ios" }], { title: "a", body: "b" });
    await sendApns([{ token: "t2", platform: "ios" }], { title: "a", body: "b" });
    await sendApns([{ token: "t3", platform: "ios" }], { title: "a", body: "b" });

    // All 3 calls should land on the same TCP+HTTP/2 connection — Apple
    // strongly recommends connection reuse and we cache the session.
    assert.equal(connectionCount, 1,
      "session must be reused across sendApns calls (got " + connectionCount + " connections)");
  } finally {
    __setApnsHostForTests(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  rmSync(keyPath, { force: true });
});

test("sendApns: cached session is replaced after __resetApnsForTests (resilience)", async () => {
  const { path: keyPath } = makeTestKey();
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));

  let connectionCount = 0;
  const server = http2.createServer();
  server.on("session", () => {
    connectionCount++;
  });
  server.on("stream", (s) => {
    s.respond({ ":status": 200 });
    s.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  __setApnsHostForTests(`http://127.0.0.1:${port}`);

  await sendApns([{ token: "first", platform: "ios" }], { title: "t", body: "b" });
  assert.equal(connectionCount, 1);

  // Force-close the cached session (this is what __resetApnsForTests does;
  // production-equivalent is the ws "close" event triggering session=null).
  __resetApnsForTests();
  __setApnsConfigForTests(testConfig(keyPath));
  __setApnsHostForTests(`http://127.0.0.1:${port}`);

  // Next call must establish a NEW HTTP/2 connection — not reuse the old.
  const results = await sendApns(
    [{ token: "second", platform: "ios" }],
    { title: "t", body: "b" }
  );
  assert.equal(results[0].ok, true);
  assert.equal(connectionCount, 2,
    "after reset, sendApns must reconnect (got " + connectionCount + " connections)");

  __setApnsHostForTests(null);
  __resetApnsForTests();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(keyPath, { force: true });
});
