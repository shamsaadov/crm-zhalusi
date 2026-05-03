// Direct APNs (Apple Push Notification service) client.
//
// We talk to Apple's HTTP/2 endpoint directly instead of going through Firebase
// because the CRM server is in Russia and Google APIs are unstable from there;
// APNs (api.push.apple.com) is reliable. Uses the .p8 Auth Key + ES256 JWT
// approach — single key works for all bundle IDs in the team.

import http2, { ClientHttp2Session } from "node:http2";
import fs from "node:fs";
import jwt from "jsonwebtoken";
import type { DevicePlatform } from "@shared/schema";

interface ApnsConfig {
  keyPath: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  production: boolean;
}

interface ApnsPayload {
  title: string;
  body: string;
  badge?: number;
  sound?: string;
  threadId?: string;
  // Custom data passed through to the app's notification handler
  data?: Record<string, unknown>;
}

interface ApnsSendResult {
  token: string;
  ok: boolean;
  status?: number;
  reason?: string; // Apple's error reason from response body, if any
}

// JWT cache: Apple requires a fresh token at least every 60 minutes; we
// regenerate at 50 to leave a margin and avoid 403 ExpiredProviderToken.
const JWT_REFRESH_MS = 50 * 60 * 1000;

let cachedJwt: string | null = null;
let cachedJwtAt = 0;
let cachedKeyPem: string | null = null;
let session: ClientHttp2Session | null = null;
let configCache: ApnsConfig | null = null;
let configChecked = false;

function loadConfig(): ApnsConfig | null {
  if (configChecked) return configCache;
  configChecked = true;

  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;

  if (!keyPath || !keyId || !teamId || !bundleId) {
    console.warn(
      "[apns] disabled — missing env. Need APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID"
    );
    return null;
  }

  if (!fs.existsSync(keyPath)) {
    console.warn(`[apns] disabled — key file not found at ${keyPath}`);
    return null;
  }

  configCache = {
    keyPath,
    keyId,
    teamId,
    bundleId,
    // Default to production; flip to sandbox via APNS_PRODUCTION=false for dev builds.
    production: process.env.APNS_PRODUCTION !== "false",
  };
  return configCache;
}

function getKeyPem(config: ApnsConfig): string {
  if (cachedKeyPem) return cachedKeyPem;
  cachedKeyPem = fs.readFileSync(config.keyPath, "utf8");
  return cachedKeyPem;
}

function signJwt(config: ApnsConfig): string {
  const now = Date.now();
  if (cachedJwt && now - cachedJwtAt < JWT_REFRESH_MS) return cachedJwt;

  const token = jwt.sign({ iss: config.teamId, iat: Math.floor(now / 1000) }, getKeyPem(config), {
    algorithm: "ES256",
    header: { alg: "ES256", kid: config.keyId },
  });
  cachedJwt = token;
  cachedJwtAt = now;
  return token;
}

// Test-only override — lets unit tests point sendApns at a local h2c mock
// server instead of Apple's real endpoint. NEVER set in production.
let hostOverride: string | null = null;

function getSession(config: ApnsConfig): ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;

  const host = hostOverride ??
    (config.production
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com");

  const next = http2.connect(host);
  // We don't crash the server on transient APNs errors; we just log and let
  // the next call reopen the connection.
  next.on("error", (err) => {
    console.error("[apns] session error:", err.message);
  });
  next.on("close", () => {
    if (session === next) session = null;
  });
  session = next;
  return next;
}

function buildBody(payload: ApnsPayload): Buffer {
  const body: Record<string, unknown> = {
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: payload.sound ?? "default",
      ...(payload.badge !== undefined ? { badge: payload.badge } : {}),
      ...(payload.threadId ? { "thread-id": payload.threadId } : {}),
    },
    ...(payload.data ?? {}),
  };
  return Buffer.from(JSON.stringify(body), "utf8");
}

async function sendOne(
  config: ApnsConfig,
  token: string,
  payload: ApnsPayload
): Promise<ApnsSendResult> {
  const sess = getSession(config);
  const body = buildBody(payload);
  const jwtToken = signJwt(config);

  return new Promise<ApnsSendResult>((resolve) => {
    const req = sess.request({
      ":method": "POST",
      ":path": `/3/device/${token}`,
      "authorization": `bearer ${jwtToken}`,
      "apns-topic": config.bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": "0",
      "content-type": "application/json",
      "content-length": body.length,
    });

    let status = 0;
    const chunks: Buffer[] = [];

    req.on("response", (headers) => {
      status = Number(headers[":status"]);
    });
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      let reason: string | undefined;
      if (status !== 200 && text) {
        try {
          reason = JSON.parse(text).reason;
        } catch {
          reason = text;
        }
      }
      resolve({ token, ok: status === 200, status, reason });
    });
    req.on("error", (err) => {
      resolve({ token, ok: false, reason: err.message });
    });

    req.end(body);
  });
}

// Tokens that mean "this device-app pair is gone, drop it from our DB so we
// don't keep retrying forever."
const DEAD_REASONS = new Set(["BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic"]);

// Cleanup hook injected by notifications.ts so apns.ts has zero dependency on
// the storage layer (and therefore doesn't trigger DB initialization at import
// time — important for unit testing in isolation).
let deadTokenCleanup: ((token: string) => Promise<void>) | null = null;

export function setApnsDeadTokenCleanup(fn: (token: string) => Promise<void>): void {
  deadTokenCleanup = fn;
}

export async function sendApns(
  tokens: Array<{ token: string; platform: DevicePlatform }>,
  payload: ApnsPayload
): Promise<ApnsSendResult[]> {
  const config = loadConfig();
  if (!config) return [];

  // Only iOS goes through APNs. Android tokens (when we add them) take a
  // different path; silently skip them here.
  const iosTokens = tokens.filter((t) => t.platform === "ios");
  if (iosTokens.length === 0) return [];

  const results = await Promise.all(iosTokens.map((t) => sendOne(config, t.token, payload)));

  // Cleanup dead tokens. We do this fire-and-forget — caller doesn't wait.
  if (deadTokenCleanup) {
    for (const r of results) {
      if (!r.ok && r.reason && DEAD_REASONS.has(r.reason)) {
        deadTokenCleanup(r.token).catch((err) => {
          console.error("[apns] failed to cleanup dead token:", err);
        });
      }
    }
  }

  return results;
}

// Test-only — force the cached JWT to count as expired so the next signJwt
// call regenerates it. We don't expose Date.now mocking; this is enough to
// drive the refresh path.
export function __expireApnsJwtForTests(): void {
  cachedJwtAt = 0;
}

// Test-only — point sendApns at a custom HTTP/2 endpoint (e.g. localhost h2c
// mock). Pass null to restore Apple's host. Forces session reconnect on next
// send so the new host is used immediately.
export function __setApnsHostForTests(host: string | null): void {
  hostOverride = host;
  if (session && !session.closed) session.close();
  session = null;
}

// Test-only — let unit tests reset module state between runs.
export function __resetApnsForTests(): void {
  cachedJwt = null;
  cachedJwtAt = 0;
  cachedKeyPem = null;
  configCache = null;
  configChecked = false;
  hostOverride = null;
  if (session && !session.closed) session.close();
  session = null;
}

// Test-only — let unit tests inspect the JWT cache state.
export function __getApnsJwtCache(): { jwt: string | null; at: number } {
  return { jwt: cachedJwt, at: cachedJwtAt };
}

// Test-only — let unit tests bypass env loading.
export function __setApnsConfigForTests(cfg: ApnsConfig | null): void {
  configCache = cfg;
  configChecked = true;
}

// Test-only — let unit tests build the payload without sending.
export function __buildApnsBody(payload: ApnsPayload): Buffer {
  return buildBody(payload);
}

// Test-only — let unit tests build a JWT with a custom config.
export function __signApnsJwtForTests(cfg: ApnsConfig): string {
  configCache = cfg;
  configChecked = true;
  return signJwt(cfg);
}

// Test-only — drive the same dead-token cleanup pipeline that sendApns runs
// when Apple returns a BadDeviceToken/Unregistered response. We don't mock
// http2 in unit tests; this lets us verify cleanup is called for the right
// reasons without setting up a fake APNs server.
export async function __triggerDeadTokenCleanupForTests(
  results: ApnsSendResult[]
): Promise<void> {
  if (!deadTokenCleanup) return;
  for (const r of results) {
    if (!r.ok && r.reason && DEAD_REASONS.has(r.reason)) {
      await deadTokenCleanup(r.token);
    }
  }
}

export type { ApnsPayload, ApnsSendResult, ApnsConfig };
