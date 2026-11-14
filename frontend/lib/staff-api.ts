export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export async function getCsrfCookie() {
  await fetch("/api/staff/csrf/", { credentials: "include", cache: "no-store" });
}

export function csrfToken() {
  const cookie = document.cookie.split("; ").find((item) => item.startsWith("csrftoken="));
  return cookie ? decodeURIComponent(cookie.slice("csrftoken=".length)) : "";
}

export async function staffApi<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.method && !["GET", "HEAD", "OPTIONS"].includes(options.method.toUpperCase())) {
    const token = csrfToken();
    if (token) headers.set("X-CSRFToken", token);
  }
  const response = await fetch(`/api/staff/${path.replace(/^\//, "")}`, {
    ...options,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.detail === "string" ? data.detail : Object.values(data).flat().join(" ") || `Request failed (${response.status})`;
    throw new Error(String(message));
  }
  return data as T;
}
