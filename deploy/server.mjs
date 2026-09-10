import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFileSync, statSync, appendFileSync, openSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";

const PORT = 3101;
const CIDR_FILE = "/etc/me2603-webhook/gh-actions-cidrs.json";
const AUDIT_LOG = "/var/log/me2603-webhook/audit.log";
const DEPLOY_SCRIPT = "/var/www/ME2603/scripts/deploy.sh";
const ENV_FILE = "/var/www/ME2603/.env";
const ALLOWED_REF = "refs/heads/main";
const MAX_BODY = 1024 * 1024;
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;

// --- Webhook secret --------------------------------------------------------

// pm2 launches server.mjs without loading /var/www/ME2603/.env, so pick up
// WEBHOOK_SECRET from there if it's not already in the process environment.
function loadSecretFromEnvFile() {
  try {
    const lines = readFileSync(ENV_FILE, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^\s*WEBHOOK_SECRET\s*=\s*(.+?)\s*$/);
      if (m) return m[1];
    }
  } catch {}
  return "";
}

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || loadSecretFromEnvFile();
if (WEBHOOK_SECRET) {
  console.log(`[start] WEBHOOK_SECRET loaded (${WEBHOOK_SECRET.length} chars)`);
} else {
  console.error("[start] WEBHOOK_SECRET not configured, refusing all webhook requests");
}

function verifySignature(rawBody, header) {
  if (!WEBHOOK_SECRET || !header) return false;
  const expected = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// --- IP allowlist ----------------------------------------------------------

let cidrs = loadCidrs();
let cidrsLoadedAt = Date.now();
let cidrsFileMtime = 0;

try { cidrsFileMtime = statSync(CIDR_FILE).mtimeMs; } catch {}

setInterval(() => {
  try {
    const m = statSync(CIDR_FILE).mtimeMs;
    if (m !== cidrsFileMtime) {
      cidrs = loadCidrs();
      cidrsFileMtime = m;
      cidrsLoadedAt = Date.now();
      console.log(`[reload] CIDR list refreshed (${cidrs.length} entries)`);
    }
  } catch (e) {
    console.warn(`[reload] CIDR file stat failed: ${e.message}`);
  }
}, 60 * 60 * 1000).unref();

function loadCidrs() {
  return JSON.parse(readFileSync(CIDR_FILE, "utf8"));
}

function ipv4ToInt(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const v = Number(p);
    if (!Number.isInteger(v) || v < 0 || v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

function ipv4InCidr(ip, cidr) {
  const slash = cidr.indexOf("/");
  if (slash === -1) return false;
  const networkStr = cidr.slice(0, slash);
  const prefix = Number(cidr.slice(slash + 1));
  if (prefix < 0 || prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const netInt = ipv4ToInt(networkStr);
  if (ipInt === null || netInt === null) return false;
  if (prefix === 0) return true;
  const mask = (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (netInt & mask);
}

function ipv6ToBigInt(ip) {
  const colon = ip.indexOf("/");
  if (colon !== -1) ip = ip.slice(0, colon);
  const doubleColon = ip.indexOf("::");
  let parts;
  if (doubleColon === -1) {
    parts = ip.split(":");
  } else {
    const left = ip.slice(0, doubleColon).split(":").filter(Boolean);
    const right = ip.slice(doubleColon + 2).split(":").filter(Boolean);
    const missing = 8 - left.length - right.length;
    parts = [...left, ...Array(missing).fill("0"), ...right];
  }
  if (parts.length !== 8) return null;
  let n = 0n;
  for (const p of parts) {
    const v = parseInt(p || "0", 16);
    if (!Number.isFinite(v) || v < 0 || v > 0xffff) return null;
    n = (n << 16n) | BigInt(v);
  }
  return n;
}

function ipv6InCidr(ip, cidr) {
  const slash = cidr.indexOf("/");
  if (slash === -1) return false;
  const networkStr = cidr.slice(0, slash);
  const prefix = Number(cidr.slice(slash + 1));
  if (prefix < 0 || prefix > 128) return false;
  const ipInt = ipv6ToBigInt(ip);
  const netInt = ipv6ToBigInt(networkStr);
  if (ipInt === null || netInt === null) return false;
  if (prefix === 0) return true;
  const mask = ((1n << 128n) - 1n) ^ ((1n << BigInt(128 - prefix)) - 1n);
  return (ipInt & mask) === (netInt & mask);
}

function ipAllowed(ip) {
  const isV4 = ip.includes(".");
  for (const cidr of cidrs) {
    if (isV4) {
      if (!cidr.includes(":")) {
        if (ipv4InCidr(ip, cidr)) return true;
      }
    } else {
      if (cidr.includes(":")) {
        if (ipv6InCidr(ip, cidr)) return true;
      }
    }
  }
  return false;
}

// Behind nginx, the TCP peer is 127.0.0.1 and X-Real-IP carries the real
// client. Trust the header only in that case so external callers can't
// forge it to bypass the GitHub CIDR allowlist.
function clientIp(req) {
  const socketIp = (req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  if (socketIp === "127.0.0.1" && req.headers["x-real-ip"]) {
    return req.headers["x-real-ip"];
  }
  return socketIp;
}

// --- Dedup ------------------------------------------------------------------

const recentDeliveries = new Map(); // deliveryId -> expiresAt
setInterval(() => {
  const now = Date.now();
  for (const [id, exp] of recentDeliveries) {
    if (exp < now) recentDeliveries.delete(id);
  }
}, 10 * 60 * 1000).unref();

// --- Audit logging ----------------------------------------------------------

const auditFd = openSync(AUDIT_LOG, "a");

function audit(level, fields) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, ...fields }) + "\n";
  appendFileSync(auditFd, line);
}

// --- Deploy trigger ---------------------------------------------------------

function triggerDeploy(deliveryId, commit, pusher) {
  const child = spawn("/bin/bash", [DEPLOY_SCRIPT], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", d => process.stdout.write(`[deploy:${deliveryId.slice(0,8)}] ${d}`));
  child.stderr.on("data", d => process.stderr.write(`[deploy:${deliveryId.slice(0,8)}] ${d}`));
  child.on("exit", code => {
    audit(code === 0 ? "deploy_ok" : "deploy_fail", { delivery_id: deliveryId, commit, pusher, exit_code: code });
  });
  child.unref();
}

// --- HTTP server ------------------------------------------------------------

const server = createServer((req, res) => {
  const remoteIp = clientIp(req);

  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
    return;
  }

  let size = 0;
  const chunks = [];
  let aborted = false;

  req.on("data", c => {
    if (aborted) return;
    size += c.length;
    if (size > MAX_BODY) {
      aborted = true;
      audit("reject_oversize", { remote_ip: remoteIp });
      req.destroy();
      res.writeHead(413).end();
      return;
    }
    chunks.push(c);
  });

  req.on("end", () => {
    if (aborted) return;

    if (!ipAllowed(remoteIp)) {
      audit("reject_ip", { remote_ip: remoteIp });
      res.writeHead(403, { "content-type": "application/json" }).end('{"error":"ip not allowed"}');
      return;
    }

    const rawBody = Buffer.concat(chunks);

    if (!verifySignature(rawBody, req.headers["x-hub-signature-256"])) {
      audit("reject_sig", { remote_ip: remoteIp, has_sig: Boolean(req.headers["x-hub-signature-256"]) });
      res.writeHead(401, { "content-type": "application/json" }).end('{"error":"bad signature"}');
      return;
    }

    const event = req.headers["x-github-event"];
    const deliveryId = req.headers["x-github-delivery"] || "";

    if (event === "ping") {
      audit("ping", { remote_ip: remoteIp, delivery_id: deliveryId });
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":"pong"}');
      return;
    }

    if (event !== "push") {
      audit("ignore_event", { remote_ip: remoteIp, event, delivery_id: deliveryId });
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":"ignored"}');
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch (e) {
      audit("reject_bad_json", { remote_ip: remoteIp, error: e.message });
      res.writeHead(400).end('{"error":"bad json"}');
      return;
    }

    if (payload.ref !== ALLOWED_REF) {
      audit("ignore_ref", { remote_ip: remoteIp, ref: payload.ref, delivery_id: deliveryId });
      res.writeHead(200, { "content-type": "application/json" }).end('{"ok":"ignored"}');
      return;
    }

    if (deliveryId) {
      const exp = recentDeliveries.get(deliveryId);
      if (exp && exp > Date.now()) {
        audit("ignore_dedup", { remote_ip: remoteIp, delivery_id: deliveryId });
        res.writeHead(200, { "content-type": "application/json" }).end('{"ok":"duplicate"}');
        return;
      }
      recentDeliveries.set(deliveryId, Date.now() + DEDUP_WINDOW_MS);
    }

    const commit = payload.head_commit?.id?.slice(0, 7) || "?";
    const pusher = payload.pusher?.name || "?";
    audit("deploy_trigger", {
      remote_ip: remoteIp, delivery_id: deliveryId, commit, pusher, ref: payload.ref,
    });
    triggerDeploy(deliveryId, commit, pusher);

    res.writeHead(202, { "content-type": "application/json" })
       .end(JSON.stringify({ ok: true, delivery_id: deliveryId, commit }));
  });

  req.on("error", e => {
    audit("request_error", { remote_ip: remoteIp, error: e.message });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[start] listening on :${PORT}, ${cidrs.length} CIDRs loaded`);
});