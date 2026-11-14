"use client";

import { useCallback, useEffect, useState } from "react";
import { Page, staffApi } from "@/lib/staff-api";
import { Pager } from "./products";

type Customer = { id: number; username: string; first_name: string; last_name: string; phone_number: string; phone_verified_at: string | null; is_active: boolean; date_joined: string; address_count: number };
type Address = { id: number; user_id: number; username: string; label: string; recipient_name: string; phone_number: string; address_line1: string; address_line2: string; city: string; state: string; postal_code: string; latitude: string | null; longitude: string | null; is_default: boolean; created_at: string };
export default function DirectoryPage({ kind, onError }: { kind: "customers" | "addresses"; onError: (message: string) => void }) {
  const [page, setPage] = useState<Page<Customer> | Page<Address> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const load = useCallback(async () => {
    const url = `${kind}/?page=${pageNumber}&page_size=25${query ? `&search=${encodeURIComponent(query)}` : ""}`;
    try { setPage(await staffApi<Page<Customer> | Page<Address>>(url)); }
    catch (err) { onError(err instanceof Error ? err.message : `Could not load ${kind}.`); }
  }, [kind, onError, pageNumber, query]);
  useEffect(() => { void load(); }, [load]);

  async function toggle(customer: Customer) {
    try { await staffApi(`users/${customer.id}/status/`, { method: "PATCH", body: JSON.stringify({ is_active: !customer.is_active }) }); await load(); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not update customer."); }
  }
  return <>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPageNumber(1), setQuery(search.trim()))} placeholder={kind === "customers" ? "Search name or phone" : "Search recipient, city, or postal code"} /><kbd>↵</kbd></div><div className="directory-note">{kind === "customers" ? "Customer accounts" : "Saved delivery locations"}</div></div>
    <div className="panel table-panel"><div className="panel-heading"><div><h2>{kind === "customers" ? "Customer accounts" : "Delivery addresses"}</h2><p>{page?.count ?? 0} records · Sensitive details are visible to authorized staff</p></div></div>
      <div className="table-scroll"><table><thead>{kind === "customers" ? <tr><th>CUSTOMER</th><th>PHONE</th><th>ADDRESSES</th><th>JOINED</th><th>STATUS</th><th /></tr> : <tr><th>RECIPIENT</th><th>ADDRESS</th><th>CUSTOMER</th><th>MAP PIN</th><th>DEFAULT</th></tr>}</thead><tbody>
        {kind === "customers" ? (page as Page<Customer> | null)?.results.map((user) => <tr key={user.id}><td><div className="customer-cell"><div className="customer-avatar">{(user.first_name || user.username).slice(0, 1).toUpperCase()}</div><span><strong>{user.first_name || user.username}{user.last_name ? ` ${user.last_name}` : ""}</strong><small>@{user.username}</small></span></div></td><td>{user.phone_number}{user.phone_verified_at && <small className="subcell">Verified</small>}</td><td>{user.address_count}</td><td>{new Date(user.date_joined).toLocaleDateString()}</td><td><span className={`status-pill ${user.is_active ? "success" : "neutral"}`}><i />{user.is_active ? "Active" : "Disabled"}</span></td><td><button className={user.is_active ? "danger-link" : "row-open"} onClick={() => void toggle(user)}>{user.is_active ? "Disable" : "Enable"}</button></td></tr>) : (page as Page<Address> | null)?.results.map((address) => <tr key={address.id}><td><strong>{address.recipient_name}</strong><small className="subcell">{address.label} · {address.phone_number}</small></td><td>{[address.address_line1, address.address_line2, address.city, address.state, address.postal_code].filter(Boolean).join(", ")}</td><td><a className="text-link" onClick={() => { setSearch(address.username); setQuery(address.username); }}>{address.username}</a><small className="subcell">Customer #{address.user_id}</small></td><td>{address.latitude && address.longitude ? <a className="map-link" href={`https://maps.google.com/?q=${address.latitude},${address.longitude}`} target="_blank" rel="noreferrer">Open map ↗</a> : <span className="muted">Not pinned</span>}</td><td>{address.is_default ? <span className="status-pill success"><i />Default</span> : <span className="muted">—</span>}</td></tr>)}
        {!page?.results.length && <tr><td colSpan={6}><div className="empty-state"><span>♙</span><strong>No records found</strong><small>Try a different search.</small></div></td></tr>}
      </tbody></table></div><Pager page={page as Page<unknown> | null} pageNumber={pageNumber} setPage={setPageNumber} />
    </div>
  </>;
}
