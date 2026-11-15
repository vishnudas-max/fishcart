"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Address, Customer, customerApi, refreshCustomerSession, setAccessToken } from "@/lib/customer-api";
import { AuthDialog } from "../customer-auth";
import { Coordinates, LocationMapPicker } from "../components/map-picker";

type OrderItem = { id: number; product_name: string; quantity: string; unit: string; unit_price: string; product_subtotal: string; processing_subtotal: string; gst_rate: string; gst_amount: string; processing_gst_amount: string; gst_total: string; total: string; options: { name: string; price_per_kg: string; subtotal: string; gst_rate: string; gst_amount: string }[] };
type Order = { id: number; status: string; cancellation_message: string; subtotal: string; gst_total: string; delivery_fee: string; total: string; fulfillment_type: string; scheduled_for: string | null; created_at: string; items: OrderItem[] };
type Section = "account" | "addresses" | "orders";
type AddressForm = Omit<Address, "id" | "is_default"> & { is_default: boolean };
const blankAddress = (customer: Customer): AddressForm => ({ label: "Home", recipient_name: customer.username, phone_number: customer.phone_number, address_line1: "", address_line2: "", landmark: "", city: "Kochi", state: "Kerala", postal_code: "", country_code: "IN", latitude: null, longitude: null, is_default: false });
const photoUrl = (url: string | null | undefined) => { if (!url) return ""; try { const path = new URL(url, "http://local").pathname; return path.startsWith("/media/") ? path : url; } catch { return ""; } };
const money = (value: string) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function AccountView() {
  const [section, setSection] = useState<Section>("account");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [username, setUsername] = useState("");
  const [addressForm, setAddressForm] = useState<AddressForm | null>(null);
  const [editingAddress, setEditingAddress] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [authOpen, setAuthOpen] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [user, savedAddresses, savedOrders] = await Promise.all([customerApi<Customer>("auth/me/"), customerApi<Address[]>("auth/addresses/"), customerApi<Order[]>("orders/")]);
      setCustomer(user); setUsername(user.username); setAddresses(savedAddresses); setOrders(savedOrders);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your account."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refreshCustomerSession().then((user) => { if (user) void loadAccount(); else setLoading(false); }).catch(() => setLoading(false)); }, [loadAccount]);
  useEffect(() => {
    if (!addressForm || editingAddress !== null || coordinates || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((position) => setCoordinates({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }), () => undefined, { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
  }, [addressForm, coordinates, editingAddress]);

  function signedIn(user: Customer) { setCustomer(user); setUsername(user.username); setAuthOpen(false); void loadAccount(); }
  function editAddress(address?: Address) {
    if (!customer) return;
    setEditingAddress(address?.id ?? null);
    const next = address ? { ...address } : blankAddress(customer);
    setAddressForm(next); setCoordinates(address?.latitude && address.longitude ? { latitude: Number(address.latitude), longitude: Number(address.longitude) } : null); setError(""); setNotice("");
  }
  function updateAddressField(key: keyof AddressForm, value: string | boolean) { setAddressForm((current) => current ? { ...current, [key]: value } : current); }
  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { const updated = await customerApi<Customer>("auth/me/", { method: "PATCH", body: JSON.stringify({ username: username.trim() }) }); setCustomer((current) => current ? { ...current, ...updated } : updated); setNotice("Your display name has been updated."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update your profile."); }
    finally { setBusy(false); }
  }
  async function savePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Profile photos must be 5 MB or smaller."); input.value = ""; return; }
    setPhotoBusy(true); setError("");
    try { const body = new FormData(); body.set("profile_photo", file); const updated = await customerApi<Customer>("auth/me/", { method: "PATCH", body }); setCustomer((current) => current ? { ...current, ...updated } : updated); setNotice("Your profile photo has been updated."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not upload your photo."); }
    finally { setPhotoBusy(false); input.value = ""; }
  }
  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!addressForm) return;
    setBusy(true); setError("");
    try {
      const payload = { ...addressForm, ...(coordinates || { latitude: null, longitude: null }) };
      const saved = await customerApi<Address>(editingAddress ? `auth/addresses/${editingAddress}/` : "auth/addresses/", { method: editingAddress ? "PATCH" : "POST", body: JSON.stringify(payload) });
      setAddresses((current) => editingAddress ? current.map((item) => saved.is_default ? { ...item, is_default: item.id === saved.id } : item.id === saved.id ? saved : item) : [saved, ...current]);
      setCustomer((current) => current && (saved.is_default || !current.default_address) ? { ...current, default_address: saved } : current);
      setAddressForm(null); setNotice("Your address has been saved.");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save this address."); }
    finally { setBusy(false); }
  }
  async function makeDefault(id: number) {
    setError(""); try { const saved = await customerApi<Address>(`auth/addresses/${id}/set-default/`, { method: "POST" }); setAddresses((current) => current.map((item) => ({ ...item, is_default: item.id === saved.id }))); setCustomer((current) => current ? { ...current, default_address: saved } : current); setNotice("Default delivery address updated."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update the default address."); }
  }
  async function deleteAddress(id: number) {
    if (!window.confirm("Delete this saved address?")) return;
    try { await customerApi(`auth/addresses/${id}/`, { method: "DELETE" }); const [remaining, user] = await Promise.all([customerApi<Address[]>("auth/addresses/"), customerApi<Customer>("auth/me/")]); setAddresses(remaining); setCustomer(user); setNotice("Address deleted."); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete this address."); }
  }
  async function signOut() { try { await customerApi("auth/logout/", { method: "POST" }); } catch { /* the session may already be expired */ } setAccessToken(null); setCustomer(null); setAddresses([]); setOrders([]); }

  return <main className="account-page"><header className="account-header"><Link className="checkout-brand" href="/">Chanda Fresh</Link><Link className="account-back-link" href="/">← Back to the catch</Link></header>
    {loading ? <div className="catalog-loading">Loading your account…</div> : !customer ? <section className="account-signin"><span className="section-tag">YOUR CHANDA FRESH ACCOUNT</span><h1>Your seafood, all in one place.</h1><p>Sign in to manage your profile, delivery addresses, and orders.</p><button className="plum-button" onClick={() => setAuthOpen(true)}>Sign in with phone <span>→</span></button></section> : <div className="account-layout">
      <aside className="account-sidebar"><div className="account-sidebar-user">{customer.profile_photo ? <img src={photoUrl(customer.profile_photo)} alt="" /> : <span>{customer.username.slice(0, 1).toUpperCase()}</span>}<div><strong>{customer.username}</strong><small>{customer.phone_number}</small></div></div><nav aria-label="Account sections">{([["account", "◉", "Account"], ["addresses", "⌖", "Addresses"], ["orders", "▤", "Orders"]] as [Section, string, string][]).map(([key, icon, title]) => <button key={key} className={section === key ? "account-nav-item active" : "account-nav-item"} onClick={() => { setSection(key); setAddressForm(null); setError(""); setNotice(""); }}><span>{icon}</span>{title}{key === "orders" && <small>{orders.length}</small>}</button>)}</nav><button className="account-signout" onClick={() => void signOut()}>↪ &nbsp; Sign out</button></aside>
      <section className="account-content"><div className="account-page-title"><div><span className="section-tag">YOUR CHANDA FRESH ACCOUNT</span><h1>{section === "account" ? "Account details" : section === "addresses" ? "Your addresses" : "Your orders"}</h1><p>{section === "account" ? "Keep your profile up to date." : section === "addresses" ? "Choose where your fresh catch should arrive." : "Follow your orders from harbor to home."}</p></div>{section === "addresses" && !addressForm && <button className="plum-button" onClick={() => editAddress()}>＋ Add address</button>}</div>
        {error && <div className="customer-error" role="alert">{error}</div>}{notice && <div className="account-notice" role="status">✓ {notice}</div>}
        {section === "account" && <div className="account-panel"><form onSubmit={saveProfile}><div className="account-profile-photo">{customer.profile_photo ? <img src={photoUrl(customer.profile_photo)} alt="Profile" /> : <span>{customer.username.slice(0, 1).toUpperCase()}</span>}<label className="photo-upload">{photoBusy ? "Uploading…" : "Change photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={savePhoto} disabled={photoBusy} /></label><small>JPG, PNG or WebP · up to 5 MB</small></div><label className="account-field">Display name<input value={username} onChange={(event) => setUsername(event.target.value)} minLength={2} maxLength={150} required /></label><label className="account-field">Phone number<input value={customer.phone_number} readOnly /><small>Your verified phone number is used to sign in.</small></label><div className="account-form-actions"><button className="plum-button" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form><div className="account-summary-card"><span>⌖</span><div><strong>Default delivery address</strong><p>{customer.default_address ? `${customer.default_address.address_line1}, ${customer.default_address.city}` : "Add an address to make checkout quicker."}</p></div><button className="text-button" onClick={() => setSection("addresses")}>Manage</button></div></div>}
        {section === "addresses" && !addressForm && <div className="address-list">{addresses.length ? addresses.map((address) => <article className="saved-address-card" key={address.id}><div className="saved-address-head"><span className="address-label-icon">⌖</span><div><strong>{address.label}</strong>{address.is_default && <span className="default-address-badge">DEFAULT</span>}<small>{address.recipient_name} · {address.phone_number}</small></div><button className="address-edit" onClick={() => editAddress(address)}>Edit</button></div><p>{address.address_line1}{address.address_line2 ? `, ${address.address_line2}` : ""}{address.landmark ? `, ${address.landmark}` : ""}<br />{address.city}, {address.state} {address.postal_code}</p>{address.latitude && address.longitude && <small className="address-coordinates">Pinned · {Number(address.latitude).toFixed(4)}, {Number(address.longitude).toFixed(4)}</small>}<div className="address-card-actions">{!address.is_default && <button className="text-button" onClick={() => void makeDefault(address.id)}>Make default</button>}<button className="address-delete" onClick={() => void deleteAddress(address.id)}>Delete</button></div></article>) : <div className="account-empty"><span>⌖</span><h2>No saved addresses yet</h2><p>Add your home or another delivery spot to make checkout faster.</p><button className="plum-button" onClick={() => editAddress()}>＋ Add your first address</button></div>}</div>}
        {section === "addresses" && addressForm && <form className="account-panel address-edit-form" onSubmit={saveAddress}><div className="account-form-top"><h2>{editingAddress ? "Edit address" : "Add a new address"}</h2><button type="button" className="customer-close" onClick={() => setAddressForm(null)} aria-label="Cancel editing">×</button></div><div className="address-form-grid">{([["label", "Label"], ["recipient_name", "Recipient name"], ["phone_number", "Phone number"], ["address_line1", "Address line 1"], ["address_line2", "Address line 2"], ["landmark", "Landmark"], ["city", "City"], ["state", "State"], ["postal_code", "Postal code"]] as [keyof AddressForm, string][]).map(([key, label]) => <label key={key}>{label}<input value={String(addressForm[key] ?? "")} onChange={(event) => updateAddressField(key, event.target.value)} required={!(["address_line2", "landmark"] as string[]).includes(key)} type={key === "phone_number" ? "tel" : "text"} /></label>)}</div><label className="default-address-toggle"><input type="checkbox" checked={addressForm.is_default} onChange={(event) => updateAddressField("is_default", event.target.checked)} /> Set as my default delivery address</label><div className="map-picker-heading"><strong>Pin delivery location</strong><button type="button" className="geo-button" onClick={() => { if (!navigator.geolocation) { setError("Location access is not available in this browser."); return; } navigator.geolocation.getCurrentPosition((position) => setCoordinates({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }), () => setError("Location permission was not granted. You can pin the map manually."), { enableHighAccuracy: true, timeout: 10000 }); }}>⌖ &nbsp; Use my location</button></div><LocationMapPicker value={coordinates} onChange={(value) => { setCoordinates(value); updateAddressField("latitude", String(value.latitude)); updateAddressField("longitude", String(value.longitude)); }} /><small className="form-help">Map pin is optional. You can drag the map and tap to choose a spot.</small><div className="account-form-actions"><button type="button" className="light-button" onClick={() => setAddressForm(null)}>Cancel</button><button className="plum-button" disabled={busy}>{busy ? "Saving…" : "Save address"}</button></div></form>}
        {section === "orders" && <div className="account-orders">{orders.length ? orders.map((order) => <article className="account-order-card" key={order.id}><div className="account-order-heading"><div><span className="section-tag">ORDER #{order.id}</span><strong>{new Date(order.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}</strong></div><span className={`order-status status-${order.status}`}>{order.status.replaceAll("_", " ")}</span></div>{order.cancellation_message && <p className="customer-error">{order.cancellation_message}</p>}{order.items.map((item) => <div className="account-order-item-wrap" key={item.id}><div className="account-order-item"><span>{item.product_name} · {item.quantity} {item.unit}</span><strong>{money(item.total)}</strong></div><div className="account-order-item-detail"><span>Product {money(item.product_subtotal)}</span>{item.options.map((option, index) => <span key={`${item.id}-option-${index}`}>{option.name} {money(option.subtotal)} · GST {Number(option.gst_rate)}% {money(option.gst_amount)}</span>)}<span>Product GST ({Number(item.gst_rate)}%) {money(item.gst_amount)}</span></div></div>)}<div className="order-price-totals"><div><span>Items and preparation</span><strong>{money(order.subtotal)}</strong></div><div><span>GST</span><strong>{money(order.gst_total)}</strong></div><div><span>Delivery</span><strong>{Number(order.delivery_fee) ? money(order.delivery_fee) : "Free"}</strong></div><div className="price-breakdown-total"><span>{order.fulfillment_type === "preorder" ? `Preorder · ${order.scheduled_for ? new Date(order.scheduled_for).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "Scheduled"}` : "Order total"}</span><strong>{money(order.total)}</strong></div></div></article>) : <div className="account-empty"><span>▤</span><h2>No orders yet</h2><p>Your orders will appear here after your first checkout.</p><Link className="plum-button" href="/#catalog">Explore fresh catches →</Link></div>}</div>}
      </section></div>}
    <footer className="account-footer"><Link href="/">Chanda Fresh</Link><span>Fresh from our harbor to your home.</span></footer>{authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSignedIn={signedIn} />}
  </main>;
}
