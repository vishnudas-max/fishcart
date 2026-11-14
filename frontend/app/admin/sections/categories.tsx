"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Page, staffApi } from "@/lib/staff-api";
import { Pager } from "./products";
import { ThemedSelect } from "@/app/components/themed-select";

type Category = { id: number; name: string; slug: string; kind: string; parent: number | null; parent_name: string | null; description: string; image: string; gst_rate: string; is_active: boolean; sort_order: number };
export default function CategoriesPage({ onError }: { onError: (message: string) => void }) {
  const [page, setPage] = useState<Page<Category> | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [all, setAll] = useState<Category[]>([]);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const result = await staffApi<Page<Category>>(`categories/?page=${pageNumber}&page_size=50`);
      setPage(result);
      setAll(result.results);
    } catch (err) { onError(err instanceof Error ? err.message : "Could not load categories."); }
  }, [onError, pageNumber]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = event.currentTarget;
    const data = new FormData(form);
    const id = data.get("id"); data.delete("id");
    const image = data.get("image"); if (image instanceof File && !image.name) data.delete("image");
    data.set("is_active", (form.elements.namedItem("is_active") as HTMLInputElement).checked ? "true" : "false");
    try {
      await staffApi(id ? `categories/${id}/` : "categories/", { method: id ? "PATCH" : "POST", body: data });
      setModal(false); setEditing(null); onError(""); await load();
    } catch (err) { onError(err instanceof Error ? err.message : "Could not save category."); }
    finally { setBusy(false); }
  }

  async function archive(category: Category) {
    if (!window.confirm(`Archive “${category.name}”?`)) return;
    try { await staffApi(`categories/${category.id}/`, { method: "DELETE" }); await load(); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not archive category."); }
  }

  const roots = all.filter((category) => !category.parent);
  return <>
    <div className="toolbar"><div className="toolbar-copy"><strong>Arrange your storefront</strong><span>Use a top-level category and one level of subcategories.</span></div><button className="secondary-button" onClick={() => { setEditing(null); setModal(true); }}>＋ Add category</button></div>
    <div className="category-grid">{page?.results.map((category) => <article className={`category-card ${!category.is_active ? "is-muted" : ""}`} key={category.id}><div className="category-card-top"><div className={`category-symbol ${category.kind}`}>{category.kind === "fish" ? "≈" : category.kind === "pickle" ? "◉" : "✳"}</div><span className={`status-pill ${category.is_active ? "success" : "neutral"}`}><i />{category.is_active ? "Active" : "Archived"}</span></div><h3>{category.parent_name ? <small>{category.parent_name} / </small> : null}{category.name}</h3><p>{category.description || (category.kind === "fish" ? "Seafood category" : category.kind === "pickle" ? "Pickle category" : "Store category")}</p><div className="category-card-footer"><span>{category.parent ? "SUBCATEGORY" : category.kind.toUpperCase()}</span><div><button onClick={() => { setEditing(category); setModal(true); }}>Edit</button>{category.is_active && <button className="danger-link" onClick={() => void archive(category)}>Archive</button>}</div></div></article>)}
      <button className="add-category-card" onClick={() => { setEditing(null); setModal(true); }}><span>＋</span><strong>Add a category</strong><small>Group products into clear collections</small></button>
    </div>
    {page && <Pager page={page} pageNumber={pageNumber} setPage={setPageNumber} />}
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}><div className="modal-card compact-modal"><div className="modal-heading"><div><span className="eyebrow">STOREFRONT</span><h2>{editing ? "Edit category" : "Create category"}</h2></div><button className="icon-button" onClick={() => setModal(false)}>×</button></div><form className="form-grid" onSubmit={save} encType="multipart/form-data">
      <input type="hidden" name="id" value={editing?.id ?? ""} />
      <label className="span-two">Name<input name="name" required defaultValue={editing?.name ?? ""} placeholder="e.g. Freshwater fish" /></label>
      <label>Parent category<ThemedSelect name="parent" defaultValue={editing?.parent ? String(editing.parent) : ""} options={[{ value: "", label: "Top-level category" }, ...roots.filter((item) => item.id !== editing?.id).map((item) => ({ value: String(item.id), label: item.name }))]} /></label>
      <label>Category kind<ThemedSelect name="kind" defaultValue={editing?.kind ?? "fish"} options={[{ value: "fish", label: "Fish" }, { value: "pickle", label: "Pickles" }, { value: "other", label: "Other" }]} /></label>
      <label>GST rate (%)<input name="gst_rate" type="number" min="0" max="100" step="0.01" required defaultValue={editing?.gst_rate ?? "0.00"} /><small>Use 0 for nil rated items; confirm each product classification before charging GST.</small></label>
      <label className="span-two">Description<textarea name="description" rows={3} defaultValue={editing?.description ?? ""} /></label>
      <label className="span-two">Category image<input type="file" name="image" accept="image/jpeg,image/png,image/webp" /></label>
      <label>Display order<input name="sort_order" type="number" min="0" defaultValue={editing?.sort_order ?? 0} /></label>
      <label className="check-label"><input name="is_active" type="checkbox" defaultChecked={editing?.is_active ?? true} /> Active in storefront</label>
      <div className="form-footer span-two"><button type="button" className="secondary-button" onClick={() => setModal(false)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save category"}</button></div>
    </form></div></div>}
  </>;
}
