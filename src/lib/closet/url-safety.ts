import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_URL_LENGTH = 2048;

/**
 * Reject URLs that would let the server fetch private/metadata endpoints.
 * Used by the closet URL scraper on (a) user-supplied product page URLs and
 * (b) the `og:image` URLs those pages return. Both are untrusted inputs to
 * server-side `fetch` and both can target 169.254.169.254, localhost, or
 * RFC1918 ranges without this guard.
 */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  if (raw.length > MAX_URL_LENGTH) {
    throw new UnsafeUrlError("url too long");
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new UnsafeUrlError("invalid url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UnsafeUrlError("only http/https allowed");
  }
  const host = parsed.hostname;
  if (!host) throw new UnsafeUrlError("missing host");

  // If the host is already a literal IP, check it directly; otherwise resolve.
  const addresses: string[] = [];
  if (isIP(host)) {
    addresses.push(host);
  } else {
    try {
      const results = await lookup(host, { all: true });
      for (const r of results) addresses.push(r.address);
    } catch {
      throw new UnsafeUrlError("host did not resolve");
    }
  }
  for (const addr of addresses) {
    if (isPrivateAddress(addr)) {
      throw new UnsafeUrlError("host resolves to a private range");
    }
  }
  return parsed;
}

export class UnsafeUrlError extends Error {
  constructor(reason: string) {
    super(`unsafe url: ${reason}`);
    this.name = "UnsafeUrlError";
  }
}

export function isPrivateAddress(addr: string): boolean {
  if (isIP(addr) === 4) return isPrivateIPv4(addr);
  if (isIP(addr) === 6) return isPrivateIPv6(addr);
  return true; // unknown — treat as unsafe
}

function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true;
  const [a, b] = parts;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 192 && b === 0 && parts[2] === 2) return true; // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
  if (a === 198 && b === 51 && parts[2] === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("ff")) return true; // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}
