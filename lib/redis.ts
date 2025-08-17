import { Redis } from "@upstash/redis";

function isValidHttpsUrl(url?: string | null): url is string {
  if (!url) return false;
  // Treat obvious placeholders as invalid
  const lower = url.toLowerCase();
  if (
    lower === "your_redis_url_here" ||
    lower.includes("<") ||
    lower.startsWith("http://") ||
    lower.startsWith("redis://")
  ) {
    return false;
  }
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

const hasValidUrl = isValidHttpsUrl(process.env.REDIS_URL);
const hasToken = Boolean(process.env.REDIS_TOKEN && process.env.REDIS_TOKEN.trim().length > 0);

if (!hasValidUrl || !hasToken) {
  console.warn(
    "Upstash Redis is disabled: provide a valid https REDIS_URL and REDIS_TOKEN to enable background notifications and webhooks.",
  );
}

export const redis = hasValidUrl && hasToken
  ? new Redis({
      url: process.env.REDIS_URL as string,
      token: process.env.REDIS_TOKEN as string,
    })
  : null;
