const tokenKey = "aioffer-token";

export function initializeAccessToken(): string {
  const fragment = new URLSearchParams(location.hash.slice(1));
  const supplied = fragment.get("token");
  if (supplied) {
    sessionStorage.setItem(tokenKey, supplied);
    history.replaceState(null, "", "/");
  }
  return sessionStorage.getItem(tokenKey) ?? "";
}

let accessToken = "";

export function setAccessToken(token: string): void {
  accessToken = token;
}

export async function api<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(signal ? { signal } : {}),
  });
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const record = data && typeof data === "object" ? data as Record<string, unknown> : {};
    const nested = record.error && typeof record.error === "object"
      ? record.error as Record<string, unknown>
      : {};
    throw new Error(
      typeof record.message === "string"
        ? record.message
        : typeof nested.message === "string"
          ? nested.message
          : `请求失败（${response.status}）`,
    );
  }
  return data as T;
}

export function safeHttpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export async function fileAsBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}
