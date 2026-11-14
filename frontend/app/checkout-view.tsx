"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Address, Cart, Customer, customerApi, getAccessToken, refreshCustomerSession } from "@/lib/customer-api";
import { AuthDialog } from "./customer-auth";
import { LocationMapPicker } from "./components/location-map-picker";
import { ThemedSelect } from "./components/themed-select";

const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const localInputValue = (date: Date) => { const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return adjusted.toISOString().slice(0, 16); };

export default function Checkout() {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [addressId, setAddressId] = useState("");
  const [newAddress, setNewAddress] = useState(false);
  const [fulfillment, setFulfillment] = useState<"asap" | "preorder">("asap");
  const [schedule, setSchedule] = useState("");
  const [minimumSchedule, setMinimumSchedule] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [orderId, setOrderId] = useState<number | null>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [user, savedAddresses, customerCart] = await Promise.all([customerApi<Customer>("auth/me/"), customerApi<Address[]>("auth/addresses/"), customerApi<Cart>("cart/")]);
      setCustomer(user); setAddresses(savedAddresses); setCart(customerCart);
      setAddressId(String(savedAddresses.find((item) => item.is_default)?.id ?? savedAddresses[0]?.id ?? ""));
      setNewAddress(savedAddresses.length === 0);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load checkout."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const now = new Date(Date.now() + 30 * 60 * 1000); setMinimumSchedule(localInputValue(now)); setSchedule(localInputValue(now)); void refreshCustomerSession().then((user) => { if (user) void load(); else setLoading(false); }).catch(() => setLoading(false)); }, [load]);
  function signedIn(user: Customer) { setCustomer(user); setAuthOpen(false); void load(); }

  async function locate() {
    if (!navigator.geolocation) { setError("This browser does not provide location access."); return; }
    navigator.geolocation.getCurrentPosition((position) => { setCoordinates({ latitude: Number(position.coords.latitude.toFixed(6)), longitude: Number(position.coords.longitude.toFixed(6)) }); setError(""); }, () => setError("Location was not available. You can enter the address manually."), { enableHighAccuracy: true, timeout: 10000 });
  }
  async function placeOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError("");
    try {
      let selectedAddressId = Number(addressId);
      if (newAddress) {
        const form = new FormData(event.currentTarget);
        const body = Object.fromEntries(["label", "recipient_name", "phone_number", "address_line1", "address_line2", "landmark", "city", "state", "postal_code"].map((key) => [key, String(form.get(key) || "")]));
        const saved = await customerApi<Address>("auth/addresses/", { method: "POST", body: JSON.stringify({ ...body, country_code: "IN", is_default: addresses.length === 0, ...(coordinates || {}) }) });
        selectedAddressId = saved.id;
      }
      const payload = { address_id: selectedAddressId, fulfillment_type: fulfillment, ...(fulfillment === "preorder" ? { scheduled_for: new Date(schedule).toISOString() } : {}), customer_note: note };
      const placed = await customerApi<{ id: number }>("orders/", { method: "POST", body: JSON.stringify(payload) });
      setOrderId(placed.id); setCart(null);
    } catch (err) { setError(err instanceof Error ? err.message : "We could not place your order."); }
    finally { setSubmitting(false); }
  }
  if (loading) return <main className="checkout-page"><div className="catalog-loading">Preparing your checkout…</div></main>;
  if (!customer) return <main className="checkout-page"><Link className="checkout-brand" href="/">← &nbsp; Chanda Fresh</Link><section className="checkout-auth"><span className="section-tag">YOUR ORDER</span><h1>Sign in to continue</h1><p>We need an account to save your delivery address and order details. Guest checkout is not available.</p><button className="plum-button" onClick={() => setAuthOpen(true)}>Sign in with phone <span>→</span></button></section>{authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSignedIn={signedIn} />}</main>;
  if (orderId) return <main className="checkout-page"><Link className="checkout-brand" href="/">Chanda Fresh</Link><section className="order-success"><span>✓</span><p className="section-tag">ORDER RECEIVED</p><h1>Thank you, {customer.username}.</h1><p>Your order <strong>#{orderId}</strong> is now with our team. {fulfillment === "preorder" ? "We’ll prepare for your selected future time." : "We’ll prepare your fresh catch as soon as possible."}</p><Link className="plum-button" href="/">Back to today’s catch →</Link></section></main>;
  return <main className="checkout-page"><header className="checkout-header"><Link className="checkout-brand" href="/">Chanda Fresh</Link><span>SECURE CHECKOUT</span></header><div className="checkout-layout"><form className="checkout-form" onSubmit={placeOrder}>
    <div className="checkout-heading"><span className="section-tag">ALMOST AT YOUR DOOR</span><h1>Checkout</h1><p>Review your delivery and timing preferences.</p></div>
    <section className="checkout-card"><div className="checkout-card-title"><span>01</span><div><h2>Delivery address</h2><p>Where should we bring your fresh catch?</p></div></div>
      {addresses.length > 0 && <div className="checkout-label"><span>SAVED ADDRESSES</span><ThemedSelect className="checkout-address-select" value={addressId} onValueChange={(value) => { setAddressId(value); setNewAddress(value === "new"); }} label="Choose a saved delivery address" options={[{ value: "new", label: "＋ Add a new address" }, ...addresses.map((address) => ({ value: String(address.id), label: `${address.label} · ${address.address_line1}, ${address.city}${address.is_default ? " · Default" : ""}` }))]} /></div>}
      {newAddress && <><div className="address-form-grid"><label>Label<input name="label" defaultValue="Home" required /></label><label>Recipient name<input name="recipient_name" defaultValue={customer.first_name || customer.username} required /></label><label>Phone number<input name="phone_number" type="tel" defaultValue={customer.phone_number} required pattern="\+[1-9]\d{7,14}" /></label><label>Address line 1<input name="address_line1" required placeholder="House / building, street" /></label><label>Address line 2<input name="address_line2" placeholder="Apartment, floor (optional)" /></label><label>Landmark<input name="landmark" placeholder="Nearby landmark (optional)" /></label><label>City<input name="city" required defaultValue="Kochi" /></label><label>State<input name="state" required defaultValue="Kerala" /></label><label>Postal code<input name="postal_code" required inputMode="numeric" /></label></div><div className="map-picker-heading"><strong>Pin your delivery location</strong><button className="geo-button" type="button" onClick={() => void locate()}>⌖ &nbsp; Use my current location</button></div><LocationMapPicker value={coordinates} onChange={setCoordinates} /><small className="form-help">Location access is optional. You can drag the map and tap to place a pin.</small></>}
      {!newAddress && <button className="text-button address-add" type="button" onClick={() => { setNewAddress(true); setAddressId("new"); }}>＋ Add a different address</button>}
    </section>
    <section className="checkout-card"><div className="checkout-card-title"><span>02</span><div><h2>When would you like it?</h2><p>Choose immediate delivery or plan ahead.</p></div></div><div className="fulfillment-options"><label className={fulfillment === "asap" ? "fulfillment-choice active" : "fulfillment-choice"}><input type="radio" name="fulfillment" checked={fulfillment === "asap"} onChange={() => setFulfillment("asap")} /><span><b>Order now</b><small>Prepare the available catch as soon as possible</small></span><strong>↗</strong></label><label className={fulfillment === "preorder" ? "fulfillment-choice active" : "fulfillment-choice"}><input type="radio" name="fulfillment" checked={fulfillment === "preorder"} onChange={() => setFulfillment("preorder")} /><span><b>Preorder</b><small>Pick a future date and time; stock is confirmed later</small></span><strong>◷</strong></label></div>{fulfillment === "preorder" && <label className="schedule-label">SELECT A FUTURE DATE &amp; TIME<input type="datetime-local" min={minimumSchedule} required value={schedule} onChange={(e) => setSchedule(e.target.value)} /><small>Choose a time at least 30 minutes from now. Preorders do not reserve current stock.</small></label>}</section>
    <section className="checkout-card"><div className="checkout-card-title"><span>03</span><div><h2>Anything we should know?</h2><p>Optional notes for your order.</p></div></div><label className="note-label"><textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Cleaning preference, delivery instructions…" /></label></section>
    {error && <div className="customer-error" role="alert">{error}</div>}<button className="plum-button wide-button place-order-button" disabled={submitting || !cart?.items.length || (!newAddress && !addressId)}>{submitting ? "Placing your order…" : fulfillment === "preorder" ? "Place preorder" : "Place order now"}<span>→</span></button>
  </form><aside className="order-summary checkout-card"><span className="section-tag">YOUR HARBOR PICKS</span><h2>Order summary</h2>{!cart?.items.length ? <><div className="catalog-empty compact-empty">Your cart is empty.</div><Link className="light-button" href="/">Browse today’s catch</Link></> : <><div className="summary-lines">{cart.items.map((item) => <article key={item.id}><div><strong>{item.product_name}</strong><small>{item.quantity} {item.unit}{item.selected_options.map((option) => ` · ${option.name}`).join("")}</small><small className="summary-price-hint">Product {money(item.product_subtotal)}{Number(item.processing_subtotal) ? ` · preparation ${money(item.processing_subtotal)}` : ""} · GST {money(item.gst_total)}</small></div><b>{money(item.total)}</b></article>)}</div><div className="price-breakdown checkout-breakdown"><div><span>Items and preparation</span><strong>{money(cart.subtotal)}</strong></div><div><span>GST (where applicable)</span><strong>{money(cart.gst_total)}</strong></div><div><span>Delivery</span><strong>{Number(cart.delivery_fee) ? money(cart.delivery_fee) : "Free"}</strong></div><div className="price-breakdown-total"><span>Amount due</span><strong>{money(cart.total)}</strong></div></div><details className="price-explanation"><summary>How this total is calculated</summary><p>The subtotal is your product price plus selected preparation. The GST line uses the active percentage for each category and service. Delivery is currently free. Your order record stores the rate applied at checkout.</p></details><p className="summary-disclaimer">Rates depend on the product and service classification; the active admin settings are shown above. {fulfillment === "preorder" ? "A preorder is subject to future availability." : "Stock is checked when your order is placed."}</p></>}</aside></div><footer className="checkout-footer"><Link href="/">← Continue shopping</Link><span>Questions? Our team is here to help.</span></footer></main>;
}
