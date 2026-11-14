"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Page, staffApi } from "@/lib/staff-api";
import { ThemedSelect } from "@/app/components/themed-select";

type Category = { id: number; name: string; kind: string; parent: number | null };
type Option = { id: number; name: string; slug: string; category: number; category_name: string; price_per_kg: string; gst_rate: string; is_active: boolean; sort_order: number };
export default function ProcessingPage({ onError }: { onError: (message: string) => void }) {
  const [options, setOptions] = useState<Page<Option> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Option | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const [result, cats] = await Promise.all([staffApi<Page<Option>>("processing-options/?page_size=100"), staffApi<Page<Category>>("categories/?page_size=100")]);
      setOptions(result); setCategories(cats.results.filter((item) => item.kind === "fish" && item.parent === null));
    } catch (err) { onError(err instanceof Error ? err.message : "Could not load fish services."); }
  }, [onError]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget; const data = new FormData(form);
    const id = data.get("id"); data.delete("id");
    data.set("is_active", (form.elements.namedItem("is_active") as HTMLInputElement).checked ? "true" : "false");
    try { await staffApi(id ? `processing-options/${id}/` : "processing-options/", { method: id ? "PATCH" : "POST", body: data }); setModal(false); setEditing(null); onError(""); await load(); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not save processing option."); }
    finally { setBusy(false); }
  }
  async function archive(option: Option) {
    if (!window.confirm(`Archive “${option.name}”?`)) return;
    try { await staffApi(`processing-options/${option.id}/`, { method: "DELETE" }); await load(); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not archive option."); }
  }
  return <>
    <div className="toolbar"><div className="toolbar-copy"><strong>Fish preparation services</strong><span>Optional prices are multiplied by the selected fish weight.</span></div><button className="secondary-button" onClick={() => { setEditing(null); setModal(true); }}>＋ Add service</button></div>
    <div className="service-grid">{options?.results.map((option) => <article className="service-card" key={option.id}><div className="service-card-head"><div className="service-icon">⌁</div><span className={`status-pill ${option.is_active ? "success" : "neutral"}`}><i />{option.is_active ? "Active" : "Archived"}</span></div><h3>{option.name}</h3><p>Available for products under <strong>{option.category_name}</strong></p><div className="service-price"><strong>₹{Number(option.price_per_kg).toFixed(2)}</strong><span>per kg</span></div><div className="category-card-footer"><span>FISH SERVICE</span><div><button onClick={() => { setEditing(option); setModal(true); }}>Edit</button>{option.is_active && <button className="danger-link" onClick={() => void archive(option)}>Archive</button>}</div></div></article>)}
      {!options?.results.length && <div className="empty-panel"><span>⌁</span><strong>No fish services yet</strong><small>Add cleaning, cutting, or another paid option.</small></div>}
    </div>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}><div className="modal-card compact-modal"><div className="modal-heading"><div><span className="eyebrow">FISH PREPARATION</span><h2>{editing ? "Edit service" : "Add service"}</h2></div><button className="icon-button" onClick={() => setModal(false)}>×</button></div><form className="form-grid" onSubmit={save}>
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <label className="span-two">Service name<input name="name" required defaultValue={editing?.name ?? ""} placeholder="Cleaning" /></label>
      <label className="span-two">Fish category<ThemedSelect name="category" defaultValue={editing?.category ? String(editing.category) : ""} options={[{ value: "", label: "Choose fish category" }, ...categories.map((category) => ({ value: String(category.id), label: category.name }))]} /></label>
      <label className="span-two">Additional price per kg<input name="price_per_kg" type="number" min="0" step="0.01" required defaultValue={editing?.price_per_kg ?? "0"} /></label>
      <label>GST on service (%)<input name="gst_rate" type="number" min="0" max="100" step="0.01" required defaultValue={editing?.gst_rate ?? "0.00"} /><small>Confirm service classification before applying a rate.</small></label>
      <label>Display order<input name="sort_order" type="number" min="0" defaultValue={editing?.sort_order ?? 0} /></label>
      <label className="check-label"><input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} /> Available to customers</label>
      <div className="form-footer span-two"><button type="button" className="secondary-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save service"}</button></div>
    </form></div></div>}
  </>;
}
