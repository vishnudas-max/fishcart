"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Page, staffApi } from "@/lib/staff-api";
import { ThemedSelect } from "@/app/components/themed-select";

type Category = { id: number; name: string; kind: string; parent: number | null };
type Product = { id: number; name: string; slug: string; description: string; image: string; category: number; category_name: string; price_per_unit: string; unit: string; fish_type: string; available_quantity: string; minimum_quantity: string; quantity_step: string; is_active: boolean; is_featured: boolean };
type Props = { onError: (message: string) => void };

function productImageUrl(value: string | null | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value, "http://thatt.local");
    return url.pathname.startsWith("/media/") ? `${url.pathname}${url.search}` : value;
  } catch {
    return value;
  }
}

export default function ProductsPage({ onError }: Props) {
  const [page, setPage] = useState<Page<Product> | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [productPage, categoryPage] = await Promise.all([
        staffApi<Page<Product>>(`products/?page=${pageNumber}&page_size=20${query ? `&search=${encodeURIComponent(query)}` : ""}`),
        staffApi<Page<Category> | Category[]>("categories/?page_size=100"),
      ]);
      setPage(productPage);
      setCategories(Array.isArray(categoryPage) ? categoryPage : categoryPage.results);
    } catch (err) { onError(err instanceof Error ? err.message : "Could not load products."); }
  }, [onError, pageNumber, query]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const id = data.get("id"); data.delete("id");
      const image = data.get("image"); if (image instanceof File && !image.name) data.delete("image");
      const form = event.currentTarget;
      for (const field of ["is_featured", "is_active"]) {
        const input = form.elements.namedItem(field) as HTMLInputElement;
        data.set(field, input.checked ? "true" : "false");
      }
      for (const key of ["category", "price_per_unit", "available_quantity", "minimum_quantity", "quantity_step"]) data.set(key, String(data.get(key) ?? ""));
      await staffApi<Product>(id ? `products/${id}/` : "products/", { method: id ? "PATCH" : "POST", body: data });
      setModal(false); setEditing(null); onError(""); await load();
    } catch (err) { onError(err instanceof Error ? err.message : "Could not save product."); }
    finally { setBusy(false); }
  }

  async function archive(product: Product) {
    if (!window.confirm(`Archive “${product.name}”? It will no longer appear in the customer catalog.`)) return;
    try { await staffApi(`products/${product.id}/`, { method: "DELETE" }); await load(); }
    catch (err) { onError(err instanceof Error ? err.message : "Could not archive product."); }
  }

  const roots = useMemo(() => categories.filter((category) => category.parent === null), [categories]);
  return <>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (setPageNumber(1), setQuery(search.trim()))} placeholder="Search products" /><kbd>↵</kbd></div><div className="toolbar-actions"><button className="secondary-button" onClick={() => { setEditing(null); setModal(true); }}>＋ Add product</button></div></div>
    <div className="panel table-panel"><div className="panel-heading"><div><h2>Store products</h2><p>{page?.count ?? 0} products · Manage pricing, stock, and visibility</p></div><button className="icon-button" onClick={() => void load()} title="Refresh">↻</button></div>
      <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>PRICE</th><th>AVAILABLE</th><th>STATUS</th><th /></tr></thead><tbody>
        {page?.results.map((product) => <tr key={product.id}><td><div className="product-cell"><div className="product-thumb">{product.image ? <img src={productImageUrl(product.image)} alt="" loading="lazy" decoding="async" /> : <span>🐟</span>}</div><span><strong>{product.name}</strong><small>{product.slug}</small></span></div></td><td>{product.category_name}<small className="subcell">{product.fish_type === "sea" ? "Sea fish" : product.fish_type === "freshwater" ? "Freshwater" : product.unit}</small></td><td><strong>₹{Number(product.price_per_unit).toFixed(2)}</strong><small className="subcell">per {product.unit === "kg" ? "kg" : "item"}</small></td><td>{product.available_quantity} {product.unit}</td><td><span className={`status-pill ${product.is_active ? "success" : "neutral"}`}><i />{product.is_active ? "Active" : "Archived"}</span></td><td><div className="row-actions"><button onClick={() => { setEditing(product); setModal(true); }}>Edit</button>{product.is_active && <button className="danger-link" onClick={() => void archive(product)}>Archive</button>}</div></td></tr>)}
        {!page?.results.length && <tr><td colSpan={6}><div className="empty-state"><span>◈</span><strong>No products found</strong><small>Add your first product or try another search.</small></div></td></tr>}
      </tbody></table></div><Pager page={page} pageNumber={pageNumber} setPage={setPageNumber} />
    </div>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setModal(false)}><div className="modal-card"><div className="modal-heading"><div><span className="eyebrow">CATALOG</span><h2>{editing ? "Edit product" : "Add product"}</h2></div><button className="icon-button" onClick={() => setModal(false)}>×</button></div><ProductForm key={editing?.id ?? "new"} product={editing} categories={categories} roots={roots} busy={busy} onCancel={() => setModal(false)} onSubmit={save} /></div></div>}
  </>;
}

function ProductForm({ product, categories, roots, busy, onCancel, onSubmit }: { product: Product | null; categories: Category[]; roots: Category[]; busy: boolean; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const [categoryId, setCategoryId] = useState(product?.category ? String(product.category) : "");
  const [unit, setUnit] = useState(product?.unit ?? "each");
  const [minimum, setMinimum] = useState(product?.minimum_quantity ?? "1");
  const [step, setStep] = useState(product?.quantity_step ?? "1");
  const currentCategory = categories.find((item) => item.id === Number(categoryId));
  const root = currentCategory?.parent ? roots.find((item) => item.id === currentCategory.parent) : currentCategory;
  const isFish = root?.kind === "fish";
  return <form className="form-grid" onSubmit={onSubmit} encType="multipart/form-data">
    <input type="hidden" name="id" value={product?.id ?? ""} />
    <label className="span-two">Product name<input name="name" required defaultValue={product?.name ?? ""} placeholder="e.g. Wild caught seer fish" /></label>
    <label className="span-two">Description<textarea name="description" rows={3} defaultValue={product?.description ?? ""} placeholder="Tell customers what makes this product special" /></label>
    <label className="span-two">Product image<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required={!product} /></label>
    {product?.image && <div className="image-preview span-two"><img src={productImageUrl(product.image)} alt="Current product" loading="lazy" decoding="async" /><small>Current image · Choose a file above to replace it</small></div>}
    <label>Category<ThemedSelect name="category" value={categoryId} onValueChange={(selectedId) => { setCategoryId(selectedId); const choice = categories.find((item) => item.id === Number(selectedId)); const choiceRoot = choice?.parent ? roots.find((item) => item.id === choice.parent) : choice; const fish = choiceRoot?.kind === "fish"; setUnit(fish ? "kg" : "each"); setMinimum(fish ? "0.5" : "1"); setStep(fish ? "0.5" : "1"); }} options={[{ value: "", label: "Choose category" }, ...categories.map((item) => ({ value: String(item.id), label: item.parent ? `↳ ${item.name}` : item.name }))]} /></label>
    <label>Price per {unit === "kg" ? "kg" : "item"}<input name="price_per_unit" type="number" min="0.01" step="0.01" required defaultValue={product?.price_per_unit ?? ""} /></label>
    <label>Pricing unit<ThemedSelect name="unit" value={unit} onValueChange={setUnit} disabled={isFish} options={[{ value: "kg", label: "Kilogram" }, { value: "each", label: "Each" }]} />{isFish && <small>Fish products are always priced and stocked by kilogram.</small>}</label>
    {isFish ? <label>Fish type<ThemedSelect name="fish_type" defaultValue={product?.fish_type ?? "sea"} options={[{ value: "sea", label: "Sea fish" }, { value: "freshwater", label: "Freshwater fish" }]} /></label> : <input type="hidden" name="fish_type" value="" />}
    <label>Available quantity ({unit})<input name="available_quantity" type="number" min="0" step={unit === "kg" ? "0.001" : "1"} required defaultValue={product?.available_quantity ?? "0"} /></label>
    <label>Minimum quantity ({unit})<input name="minimum_quantity" type="number" min={unit === "kg" ? "0.001" : "1"} step={unit === "kg" ? "0.001" : "1"} required value={minimum} onChange={(e) => setMinimum(e.target.value)} /></label>
    <label>Quantity step ({unit})<input name="quantity_step" type="number" min={unit === "kg" ? "0.001" : "1"} step={unit === "kg" ? "0.001" : "1"} required value={step} onChange={(e) => setStep(e.target.value)} /></label>
    <label className="check-label"><input name="is_featured" type="checkbox" value="true" defaultChecked={product?.is_featured ?? false} /> Feature this product</label>
    <label className="check-label"><input name="is_active" type="checkbox" value="true" defaultChecked={product?.is_active ?? true} /> Visible in storefront</label>
    <div className="form-footer span-two"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : product ? "Save changes" : "Create product"}</button></div>
  </form>;
}

export function Pager({ page, pageNumber, setPage }: { page: Page<unknown> | null; pageNumber: number; setPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil((page?.count ?? 0) / 20));
  return <div className="pager"><span>Page {pageNumber} of {pages}</span><div><button disabled={!page?.previous} onClick={() => setPage(Math.max(1, pageNumber - 1))}>← Previous</button><button disabled={!page?.next} onClick={() => setPage(pageNumber + 1)}>Next →</button></div></div>;
}
