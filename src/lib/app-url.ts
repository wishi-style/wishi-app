const DEFAULT_APP_URL = "http://localhost:3000";

interface HeaderReader {
  get(name: string): string | null;
}

interface ResolveAppUrlOptions {
  envAppUrl?: string | null;
  fallback?: string;
  headers?: HeaderReader | null;
}

export function resolveAppUrl({
  envAppUrl,
  fallback = DEFAULT_APP_URL,
  headers,
}: ResolveAppUrlOptions = {}) {
  const configuredUrl = normalizeAbsoluteUrl(envAppUrl);
  if (configuredUrl) return configuredUrl;

  const origin = normalizeAbsoluteUrl(headers?.get("origin"));
  if (origin) return origin;

  const host = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (host) {
    const forwardedProto = headers?.get("x-forwarded-proto");
    const protocol = forwardedProto
      ?? (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
    return `${protocol}://${host}`;
  }

  return normalizeAbsoluteUrl(fallback) ?? DEFAULT_APP_URL;
}

function normalizeAbsoluteUrl(value: string | null | undefined) {
  if (!value) return null;

  try {
    new URL(value);
    return value.replace(/\/+$/, "");
  } catch {
    return null;
  }
}
