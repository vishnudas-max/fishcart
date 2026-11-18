export type Customer = { id: number; username: string; email: string; email_verified_at?: string | null; first_name?: string; last_name?: string; phone_number: string | null; phone_verified_at?: string | null; profile_photo?: string | null; default_address?: Address | null };
export type Address = { id: number; label: string; recipient_name: string; phone_number: string; address_line1: string; address_line2: string; landmark: string; city: string; state: string; postal_code: string; country_code: string; latitude: string | null; longitude: string | null; is_default: boolean };
export type Product = { id: number; name: string; slug: string; description: string; image: string | null; category: { id: number; name: string; slug: string; kind: string; parent: number | null; gst_rate: string; children?: { id: number; name: string; slug: string }[] }; price_per_unit: string; unit: "kg" | "each"; fish_type: "sea" | "freshwater" | "other"; available_quantity: string; minimum_quantity: string; quantity_step: string; is_fish: boolean; gst_rate: string; review_count: number; average_rating: string | null; processing_options: { id: number; name: string; slug: string; price_per_kg: string; gst_rate: string }[] };
export type ProductReview = { id: number; rating: number; comment: string; display_name: string; is_verified_purchase: boolean; is_mine: boolean; created_at: string; updated_at: string };
export type CartItem = { id: number; product: number; product_name: string; image: string | null; unit: string; quantity: string; unit_price: string; product_subtotal: string; gst_rate: string; product_gst: string; processing_subtotal: string; processing_gst: string; gst_total: string; total: string; selected_options: { id: number; name: string; price_per_kg: string; gst_rate: string; subtotal: string; gst_amount: string }[] };
export type Cart = { id: number; items: CartItem[]; subtotal: string; gst_total: string; delivery_fee: string; total: string };
export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
export function setAccessToken(token: string | null) { accessToken = token; }
export function getAccessToken() { return accessToken; }

export async function primeCsrf() {
  await fetch("/api/auth/csrf/", { credentials: "include", cache: "no-store" });
}
function csrfToken() {
  if (typeof document === "undefined") return "";
  const value = document.cookie.split("; ").find((part) => part.startsWith("csrftoken="));
  return value ? decodeURIComponent(value.slice("csrftoken=".length)) : "";
}
async function decode<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details = Object.entries(data as Record<string, unknown>).flatMap(([key, value]) => key === "detail" ? [String(value)] : Array.isArray(value) ? value.map(String) : [String(value)]);
    throw new Error(details.join(" ") || `Request failed (${response.status})`);
  }
  return data as T;
}
export async function customerApi<T>(path: string, options: RequestInit = {}): Promise<T> {
  const normalizedPath = path.replace(/^\//, "");
  const tokenUsed = accessToken;
  const send = (token: string | null) => {
    const headers = new Headers(options.headers);
    const method = (options.method || "GET").toUpperCase();
    if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const csrf = csrfToken();
      if (csrf) headers.set("X-CSRFToken", csrf);
    }
    return fetch(`/api/${normalizedPath}`, { ...options, headers, credentials: "include", cache: "no-store" });
  };
  let response = await send(tokenUsed);
  const shouldNotRefresh = normalizedPath.startsWith("auth/otp/") || normalizedPath.startsWith("staff/");
  if (response.status === 401 && !shouldNotRefresh) {
    // A parallel request may already have refreshed this token; reuse its replacement.
    const replacement = accessToken !== tokenUsed ? accessToken : await refreshAccessToken();
    if (!replacement) {
      setAccessToken(null);
      throw new Error("Your session has expired. Sign in again to continue.");
    }
    response = await send(replacement);
    if (response.status === 401 && accessToken === replacement) setAccessToken(null);
  }
  if (response.status === 204) return undefined as T;
  return decode<T>(response);
}
function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    await primeCsrf();
    const csrf = csrfToken();
    const response = await fetch("/api/auth/refresh/", { method: "POST", credentials: "include", cache: "no-store", headers: csrf ? { "X-CSRFToken": csrf } : {} });
    if (!response.ok) { setAccessToken(null); return null; }
    const data = await decode<{ access: string }>(response);
    setAccessToken(data.access);
    return data.access;
  })().catch(() => {
    setAccessToken(null);
    return null;
  }).finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

export async function refreshCustomerSession() {
  if (!await refreshAccessToken()) return null;
  return customerApi<Customer>("auth/me/");
}
