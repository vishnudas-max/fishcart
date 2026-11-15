"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Page, staffApi } from "@/lib/staff-api";
import { Pager } from "./products";
import { ThemedSelect } from "@/app/components/themed-select";

type OrderItem = { id: number; product_name: string; unit: string; quantity: string; unit_price: string; product_subtotal: string; processing_subtotal: string; gst_rate: string; gst_amount: string; processing_gst_amount: string; gst_total: string; total: string; options: { name: string; price_per_kg: string; subtotal: string; gst_rate: string; gst_amount: string }[] };
type Order = { id: number; username: string; phone_number: string; address_snapshot: Record<string, string | null>; fulfillment_type: "asap" | "preorder"; is_preorder: boolean; scheduled_for: string | null; status: string; subtotal: string; gst_total: string; delivery_fee: string; total: string; stock_reserved: boolean; customer_note: string; staff_note: string; cancellation_reason: string; cancellation_message: string; items: OrderItem[]; created_at: string };
const statuses: Record<string, string> = { pending: "Pending", confirmed: "Confirmed", preparing: "Preparing", ready: "Ready", out_for_delivery: "Out for delivery", completed: "Completed", cancelled: "Cancelled" };
const transitions: Record<string, string[]> = { pending: ["confirmed", "cancelled"], confirmed: ["preparing", "cancelled"], preparing: ["ready", "cancelled"], ready: ["out_for_delivery", "cancelled"], out_for_delivery: ["completed", "cancelled"], completed: [], cancelled: [] };
const cancellationReasons = [{ value: "out_of_stock", label: "An item is unavailable" }, { value: "delivery_unavailable", label: "Delivery is unavailable" }, { value: "operational_issue", label: "Unexpected operational issue" }, { value: "customer_request", label: "Customer requested cancellation" }];
type Filter = "all" | "preorder" | "asap";

export default function OrdersPage({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<Page<Order> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [nextStatus, setNextStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(pageNumber), page_size: "20" });
    if (filter !== "all") params.set("preorder", String(filter === "preorder"));
    if (statusFilter) params.set("status", statusFilter);
    if (query) params.set("search", query);
    try { setPage(await staffApi<Page<Order>>(`orders/?${params.toString()}`)); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not load orders."); }
  }, [filter, onError, pageNumber, query, statusFilter]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return;
    setBusy(true); const data = new FormData(event.currentTarget);
    const changes: Record<string, string> = { staff_note: String(data.get("staff_note") ?? "") };
    const newStatus = String(data.get("status") ?? "");
    if (newStatus && newStatus !== selected.status) changes.status = newStatus;
    if (newStatus === "cancelled" && newStatus !== selected.status) changes.cancellation_reason = String(data.get("cancellation_reason") ?? "");
    try {
      await staffApi(`orders/${selected.id}/manage/`, { method: "PATCH", body: JSON.stringify(changes) });
      setSelected(null); onError(""); await load();
    } catch (err) { onError(err instanceof Error ? err.message : "Could not update order."); }
    finally { setBusy(false); }
  }

  return <>
    <div className="toolbar orders-toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPageNumber(1), setQuery(search.trim()))} placeholder="Search order, customer, or phone" /><kbd>↵</kbd></div><label className="filter-select"><span>STATUS</span><ThemedSelect value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPageNumber(1); }} label="Filter by order status" options={[{ value: "", label: "All statuses" }, ...Object.entries(statuses).map(([key, label]) => ({ value: key, label }))]} /></label></div>
    <div className="tab-row"><button className={filter === "all" ? "selected" : ""} onClick={() => { setFilter("all"); setPageNumber(1); }}>All orders</button><button className={filter === "preorder" ? "selected" : ""} onClick={() => { setFilter("preorder"); setPageNumber(1); }}>Preorders <span className="tiny-dot amber-dot" /></button><button className={filter === "asap" ? "selected" : ""} onClick={() => { setFilter("asap"); setPageNumber(1); }}>As soon as possible</button><span className="tab-count">{page?.count ?? 0} orders</span></div>
    <div className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>FULFILLMENT</th><th>STATUS</th><th>TOTAL</th><th /></tr></thead><tbody>
      {page?.results.map((order) => <tr key={order.id}><td><strong className="order-number">#{order.id}</strong><small className="subcell">{new Date(order.created_at).toLocaleString()}</small></td><td><strong>{order.username}</strong><small className="subcell">{order.phone_number}</small></td><td><span className={`order-type ${order.is_preorder ? "preorder" : "asap"}`}>{order.is_preorder ? "◷ Preorder" : "↗ ASAP"}</span>{order.scheduled_for && <small className="subcell schedule-cell">{new Date(order.scheduled_for).toLocaleString()}</small>}</td><td><span className={`status-pill ${order.status === "completed" ? "success" : order.status === "cancelled" ? "neutral" : order.status === "pending" ? "pending" : "info"}`}><i />{statuses[order.status] ?? order.status}</span></td><td><strong>₹{Number(order.total).toFixed(2)}</strong></td><td><button className="row-open" onClick={() => { setSelected(order); setNextStatus(order.status); }}>Review <span>→</span></button></td></tr>)}
      {!page?.results.length && <tr><td colSpan={6}><div className="empty-state"><span>▤</span><strong>No orders in this view</strong><small>Try another status or check back later.</small></div></td></tr>}
    </tbody></table></div><Pager page={page} pageNumber={pageNumber} setPage={setPageNumber} /></div>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}><div className="modal-card order-modal"><div className="modal-heading"><div><span className="eyebrow">ORDER #{selected.id} · {selected.is_preorder ? "PREORDER" : "ASAP"}</span><h2>Order details</h2></div><button className="icon-button" onClick={() => setSelected(null)}>×</button></div>
      <div className="order-detail-grid"><div><span className="detail-label">CUSTOMER</span><strong>{selected.username}</strong><span>{selected.phone_number}</span></div><div><span className="detail-label">DELIVERY ADDRESS</span><strong>{selected.address_snapshot.recipient_name}</strong><span>{[selected.address_snapshot.address_line1, selected.address_snapshot.address_line2, selected.address_snapshot.city, selected.address_snapshot.state, selected.address_snapshot.postal_code].filter(Boolean).join(", ")}</span></div></div>
      {selected.is_preorder && <div className="preorder-callout"><span>◷</span><div><strong>Scheduled preorder</strong><small>{selected.scheduled_for ? new Date(selected.scheduled_for).toLocaleString() : "No scheduled time"} · No stock was reserved when placed</small></div></div>}
      <div className="order-lines"><div className="detail-label">ITEMS</div>{selected.items.map((item) => <div className="order-line" key={item.id}><div><strong>{item.product_name}</strong><small>{item.quantity} {item.unit} × ₹{Number(item.unit_price).toFixed(2)}{item.options.map((option) => ` · ${option.name}`).join("")}</small><small>Product ₹{Number(item.product_subtotal).toFixed(2)} · Preparation ₹{Number(item.processing_subtotal).toFixed(2)} · Product GST ({Number(item.gst_rate)}%) ₹{Number(item.gst_amount).toFixed(2)}{item.processing_gst_amount !== "0.00" ? ` · Prep GST ₹${Number(item.processing_gst_amount).toFixed(2)}` : ""}</small></div><strong>₹{Number(item.total).toFixed(2)}</strong></div>)}</div>
      <div className="order-price-totals"><div><span>Items and preparation</span><strong>₹{Number(selected.subtotal).toFixed(2)}</strong></div><div><span>GST</span><strong>₹{Number(selected.gst_total).toFixed(2)}</strong></div><div><span>Delivery</span><strong>{Number(selected.delivery_fee) ? `₹${Number(selected.delivery_fee).toFixed(2)}` : "Free"}</strong></div><div className="price-breakdown-total"><span>Order total</span><strong>₹{Number(selected.total).toFixed(2)}</strong></div></div>
      {selected.customer_note && <div className="note-box"><span className="detail-label">CUSTOMER NOTE</span><p>{selected.customer_note}</p></div>}
      {selected.cancellation_message && <div className="preorder-callout"><span>ⓘ</span><div><strong>Customer cancellation message</strong><small>{selected.cancellation_message}</small></div></div>}
      <form className="form-grid order-edit-form" onSubmit={save}><label>Status<ThemedSelect key={`${selected.id}-${selected.status}`} name="status" value={nextStatus || selected.status} onValueChange={setNextStatus} options={[{ value: selected.status, label: statuses[selected.status] }, ...transitions[selected.status].map((value) => ({ value, label: statuses[value] }))]} /></label>{nextStatus === "cancelled" && <label className="span-two">Cancellation message<ThemedSelect name="cancellation_reason" defaultValue="" options={[{ value: "", label: "Select a cancellation message" }, ...cancellationReasons]} /><small>This predefined message is visible to the customer in order history.</small></label>}<label className="span-two">Staff note<textarea name="staff_note" rows={2} defaultValue={selected.staff_note} placeholder="Internal note for the team" /></label><div className="form-footer span-two"><button type="button" className="secondary-button" onClick={() => { setSelected(null); setNextStatus(""); }}>Close</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save update"}</button></div></form>
    </div></div>}
  </>;
}
