import { readFileSync, writeFileSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";

const META_URL = "https://api.github.com/meta";
const OUT_FILE = "/etc/me2603-webhook/gh-actions-cidrs.json";
const TMP_FILE = OUT_FILE + ".tmp";

const res = await fetch(META_URL, {
  headers: { "user-agent": "me2603-webhook-ip-refresh" },
});
if (!res.ok) throw new Error(`meta fetch failed: ${res.status}`);
const data = await res.json();

const cidrs = [...new Set([...(data.hooks ?? []), ...(data.web ?? [])])];
if (cidrs.length < 3) throw new Error(`too few CIDRs returned (${cidrs.length}), aborting`);

writeFileSync(TMP_FILE, JSON.stringify(cidrs, null, 2));
renameSync(TMP_FILE, OUT_FILE);

console.log(`[refresh-ips] wrote ${cidrs.length} CIDRs to ${OUT_FILE}`);