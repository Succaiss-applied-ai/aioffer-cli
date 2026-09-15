export const allowedBridgeHosts = new Set([
  "127.0.0.1",
  "localhost"
]);

export const allowedProductBridgeHosts = new Set([
  "127.0.0.1",
  "localhost"
]);

function isAllowedUrl(value: unknown, hosts: ReadonlySet<string>): boolean {
  try {
    const parsed = new URL(String(value ?? ""));
    return parsed.protocol === "http:" && parsed.port === "19876" &&
      hosts.has(parsed.hostname);
  } catch {
    return false;
  }
}

export function isAllowedBridgeUrl(value: unknown): boolean {
  return isAllowedUrl(value, allowedBridgeHosts);
}

export function isAllowedProductBridgeUrl(value: unknown): boolean {
  return isAllowedUrl(value, allowedProductBridgeHosts);
}
