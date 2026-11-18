"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Address, Cart, CartItem, Customer, Page, Product, customerApi, refreshCustomerSession, setAccessToken } from "@/lib/customer-api";
import { AuthDialog } from "./customer-auth";
import { ThemedSelect } from "./components/themed-select";
import { ThattBrand } from "./components/thatt-brand";

const storePhone = process.env.NEXT_PUBLIC_STORE_PHONE?.trim() || "9539833135";
const storePhoneLink = storePhone.startsWith("+") ? storePhone : "+91" + storePhone;

const imageFor = (product: Product, index: number) => {
  const value = product.image;
  if (value) {
    try { const path = new URL(value, "http://store.local").pathname; if (path.startsWith("/media/")) return path; } catch { return value; }
  }
  const name = product.name.toLowerCase();
  if (name.includes("prawn")) return "/figma/prawns.jpeg";
  if (name.includes("sardin")) return "/figma/sardines.jpeg";
  if (name.includes("karimeen") || name.includes("pearl") || name.includes("king") || name.includes("seer")) return "/figma/karimeen.jpeg";
  return ["/figma/karimeen.jpeg", "/figma/sardines.jpeg", "/figma/karimeen.jpeg", "/figma/prawns.jpeg"][index % 4];
};
const cartImage = (image: string | null) => {
  if (!image) return "/figma/karimeen.jpeg";
  try { const path = new URL(image, "http://store.local").pathname; return path.startsWith("/media/") ? path : image; } catch { return "/figma/karimeen.jpeg"; }
};
const profilePhoto = (photo: string | null | undefined) => {
  if (!photo) return "";
  try { const path = new URL(photo, "http://store.local").pathname; return path.startsWith("/media/") ? path : photo; } catch { return ""; }
};
const money = (value: string | number) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export default function Storefront() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Product["category"][]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerReady, setCustomerReady] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [fishType, setFishType] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [pageSize, setPageSize] = useState(8);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [chosen, setChosen] = useState<Product | null>(null);
  const [reviewProduct, setReviewProduct] = useState<Product | null>(null);
  const [loadCartError, setLoadCartError] = useState("");
  const [addressMenuOpen, setAddressMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [usernameEditing, setUsernameEditing] = useState(false);
  const [usernameDraft, setUsernameDraft] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (!reviewProduct) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setReviewProduct(null); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", closeOnEscape); };
  }, [reviewProduct]);

  useEffect(() => {
    const root = document.querySelector(".storefront");
    if (!root) return;
    const targets = root.querySelectorAll<HTMLElement>("[data-scroll-reveal]");
    if (!targets.length || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("scroll-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    targets.forEach((target) => { target.classList.add("will-reveal"); observer.observe(target); });
    return () => observer.disconnect();
  }, []);

  const loadCatalog = useCallback(async () => {
    setBusy(true); setError("");
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize), ordering: "-created_at" });
    if (query.trim()) params.set("search", query.trim());
    if (category) params.set("category", category);
    if (fishType) params.set("fish_type", fishType);
    if (minPrice) params.set("min_price", minPrice);
    if (maxPrice) params.set("max_price", maxPrice);
    try {
      const [items, cats] = await Promise.all([customerApi<Page<Product>>(`catalog/products/?${params}`), customerApi<Product["category"][]>("catalog/categories/")]);
      setProducts(items.results); setCount(items.count); setCategories(cats);
    } catch (err) { setError(err instanceof Error ? err.message : "We could not load the catalog."); }
    finally { setBusy(false); }
  }, [page, pageSize, query, category, fishType, minPrice, maxPrice]);

  const loadCart = useCallback(async () => {
    try { setCart(await customerApi<Cart>("cart/")); setLoadCartError(""); }
    catch (err) { setLoadCartError(err instanceof Error ? err.message : "Could not load your cart."); }
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1051px)");
    const tablet = window.matchMedia("(min-width: 761px) and (max-width: 1050px)");
    const update = () => setPageSize(desktop.matches ? 8 : tablet.matches ? 6 : 4);
    update(); desktop.addEventListener("change", update); tablet.addEventListener("change", update);
    return () => { desktop.removeEventListener("change", update); tablet.removeEventListener("change", update); };
  }, []);
  useEffect(() => {
    let active = true;
    refreshCustomerSession().then(async (user) => {
      if (!active) return;
      setCustomerReady(true);
      if (!user) return;
      setCustomer(user); setCart(await customerApi<Cart>("cart/").catch(() => null));
    }).catch(() => undefined).finally(() => { if (active) setCustomerReady(true); });
    return () => { active = false; };
  }, []);
  const cartQuantity = useMemo(() => (cart?.items || []).reduce((sum, item) => sum + Number(item.quantity), 0), [cart]);
  function signInDone(user: Customer) { setCustomer(user); setCustomerReady(true); setAuthOpen(false); void loadCart(); }
  async function signOut() { try { await customerApi("auth/logout/", { method: "POST" }); } catch { /* expired session is already signed out */ } setAccessToken(null); setCustomer(null); setCart(null); }
  async function openAddresses() {
    if (!customer) { setAuthOpen(true); return; }
    try { setSavedAddresses(await customerApi<Address[]>("auth/addresses/")); setAddressMenuOpen((open) => !open); setProfileMenuOpen(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load your saved addresses."); }
  }
  async function makeDefault(address: Address) {
    try {
      const updated = await customerApi<Address>(`auth/addresses/${address.id}/set-default/`, { method: "POST" });
      setSavedAddresses((items) => items.map((item) => ({ ...item, is_default: item.id === updated.id })));
      setCustomer((current) => current ? { ...current, default_address: updated } : current); setAddressMenuOpen(false);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update your delivery address."); }
  }
  async function updateUsername(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { const updated = await customerApi<Customer>("auth/me/", { method: "PATCH", body: JSON.stringify({ username: usernameDraft }) }); setCustomer((current) => current ? { ...current, ...updated } : updated); setUsernameEditing(false); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update your username."); }
  }
  async function updateProfilePhoto(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("Profile photos must be 5 MB or smaller."); input.value = ""; return; }
    setPhotoBusy(true);
    try { const data = new FormData(); data.set("profile_photo", file); const updated = await customerApi<Customer>("auth/me/", { method: "PATCH", body: data }); setCustomer((current) => current ? { ...current, ...updated } : updated); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update your profile photo."); }
    finally { setPhotoBusy(false); input.value = ""; }
  }

  async function addConfigured(product: Product, quantity: number, optionIds: number[], preorderEligible: boolean) {
    if (!customer) { setChosen(null); setAuthOpen(true); return; }
    try {
      await customerApi<CartItem>("cart/items/", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity, processing_option_ids: optionIds, preorder_eligible: preorderEligible }) });
      await loadCart(); setChosen(null); setCartOpen(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add that item."); throw err; }
  }

  return <main className="storefront">
    <header className="shop-header"><Link className="shop-brand thatt-header-brand" href="/" aria-label="തട്ട് home"><ThattBrand priority /><small>FRESH FROM MUNAMBAM</small></Link>
      <div className="delivery-wrap"><button className="delivery-pill" disabled={!customerReady} onClick={() => void openAddresses()}><span>⌖</span><span><small>DELIVERING TO</small><strong>{customer?.default_address?.label || customer?.default_address?.city || "Set your location"}</strong></span><b>⌄</b></button>{addressMenuOpen && <div className="account-popover delivery-popover"><span className="section-tag">CHOOSE DELIVERY ADDRESS</span>{savedAddresses.length ? savedAddresses.map((address) => <button className="saved-address-option" key={address.id} onClick={() => void makeDefault(address)}><span><b>{address.label}{address.is_default ? " · DEFAULT" : ""}</b><small>{address.address_line1}, {address.city}</small></span><strong>{address.is_default ? "✓" : "›"}</strong></button>) : <p>No saved addresses yet. Add one at checkout.</p>}<Link href="/checkout" className="text-button">＋ Add an address</Link></div>}</div>
      <form className="shop-search" onSubmit={(event) => { event.preventDefault(); setPage(1); void loadCatalog(); }}><span>⌕</span><input aria-label="Search seafood" placeholder="Search fish, prawns, pickles…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /><button aria-label="Submit search">↵</button></form>
      <div className="shop-actions"><a className="about-nav-link" href="#about">About us</a>{!customerReady ? <span className="profile-pill profile-pill-loading" aria-label="Checking account" /> : customer ? <button className="profile-pill" onClick={() => { setProfileMenuOpen((open) => !open); setAddressMenuOpen(false); setUsernameDraft(customer.username); }} title="Account">{customer.profile_photo ? <img className="profile-photo" src={profilePhoto(customer.profile_photo)} alt="" /> : <span className="profile-letter">{customer.username.slice(0, 1).toUpperCase()}</span>}<span>{customer.username === customer.email ? "My account" : customer.username}</span></button> : <button className="profile-pill" onClick={() => setAuthOpen(true)}>Sign in</button>}<button className="cart-pill" disabled={!customerReady} aria-busy={!customerReady} onClick={() => customer ? (setCartOpen(true), void loadCart()) : setAuthOpen(true)}><span>♧</span> Cart <b>{cartQuantity}</b></button></div>
      {profileMenuOpen && customer && <div className="account-popover profile-popover"><span className="section-tag">YOUR ACCOUNT</span><strong>{customer.username === customer.email ? "Choose a display name" : customer.username}</strong><small>{customer.email}</small><Link href="/account" className="account-settings-link" onClick={() => setProfileMenuOpen(false)}>Account · Addresses · Orders →</Link><label className="photo-upload">{photoBusy ? "Uploading photo…" : "Update profile photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={updateProfilePhoto} /></label>{usernameEditing ? <form onSubmit={updateUsername}><input aria-label="Username" value={usernameDraft} onChange={(event) => setUsernameDraft(event.target.value)} minLength={2} maxLength={150} required /><button className="plum-button">Save name</button></form> : <button className="text-button" onClick={() => setUsernameEditing(true)}>Edit display name</button>}<button className="profile-signout" onClick={() => void signOut()}>Sign out</button></div>}
    </header>
      <section className="hero-wrap"><div className="hero-card"><div className="hero-copy"><div className="harbor-badge">✦ &nbsp; 4:00 AM Munambam Fish Market Catch <i /> LIVE</div><h1>Pier-to-Door Fresh Fish.<br /><em>Cut fresh, never frozen.</em></h1><p className="hero-malayalam" lang="ml">കൊച്ചിയുടെ പുലർച്ചെ മീൻപിടിത്തത്തിൽ നിന്ന് നേരിട്ട് · ഇന്നത്തെ മീൻ, ഇന്ന് തന്നെ വീട്ടിൽ</p><p>Sourced daily at dawn straight from Munambam. Delivered chilled at 0–4°C across Kochi Marine Drive &amp; Greater Ernakulam.</p><div className="trust-pills"><span>✓ &nbsp;No chemicals added</span><span>◉ &nbsp;Inspect First, Pay COD</span><span>♧ &nbsp;Cut to your preference</span></div><div className="hero-actions"><a className="plum-button" href="#catalog">Shop today’s catch <b>→</b></a><a className="light-button" href="#promise">⌖ &nbsp; See where we deliver</a></div></div><div className="hero-photo"><img src="/figma/harbor.jpeg" alt="Fresh fish arriving at Munambam fish market" fetchPriority="high" decoding="async" /><div className="landing-bubble"><span>🐟</span><div><small>JUST LANDED</small><strong>Fresh from the morning auction</strong><i>Munambam · 4:00 AM</i></div></div></div></div></section>
    <section className="catalog-section" id="catalog"><div className="section-title"><div><span className="section-tag">OUR FRESH CATCH · ഇന്നത്തെ മീൻ</span><h2>Explore all fresh catches.</h2><p>Picked this morning, inspected, chilled, and handled with care.</p></div><span className="catalog-count">{count} fresh catches</span></div>
      <div className="filter-bar"><button className={!category ? "filter-chip selected" : "filter-chip"} onClick={() => { setCategory(""); setPage(1); }}>All catches</button>{categories.map((item) => <button className={category === item.slug ? "filter-chip selected" : "filter-chip"} key={item.id} onClick={() => { setCategory(category === item.slug ? "" : item.slug); setPage(1); }}>{item.name}</button>)}<ThemedSelect className="origin-dropdown" value={fishType} onValueChange={(value) => { setFishType(value); setPage(1); }} label="Fish origin filter" options={[{ value: "", label: "All origins" }, { value: "sea", label: "Sea fish" }, { value: "freshwater", label: "Freshwater" }]} /><label className="price-filter">₹<input aria-label="Minimum price per kilogram" placeholder="Min" type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} onBlur={() => setPage(1)} />–<input aria-label="Maximum price per kilogram" placeholder="Max" type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} onBlur={() => setPage(1)} /></label><button className="apply-filter" onClick={() => { setPage(1); void loadCatalog(); }}>Apply filters</button></div>
      {error && <div className="catalog-error" role="alert">{error}</div>}
      {busy ? <div className="catalog-loading">Bringing in the morning catch…</div> : products.length ? <div className="product-grid">{products.map((product, index) => <article className="fish-card" key={product.id}><div className="fish-image"><img src={imageFor(product, index)} alt={product.name} loading="lazy" decoding="async" /><span className="fresh-label">✦ &nbsp;FRESH TODAY</span><span className="origin-label">{product.fish_type === "sea" ? "ARABIAN SEA" : product.fish_type === "freshwater" ? "FRESHWATER" : product.category.name.toUpperCase()}</span></div><div className="fish-info"><span className="product-category">{product.category.name.toUpperCase()}</span><h3>{product.name}</h3><p>{product.description || "Freshly sourced and chilled for quality."}</p><div className="fish-price-row"><div><strong>{money(product.price_per_unit)}</strong><small> / {product.unit === "kg" ? "kg" : "piece"}</small></div><button className="add-button" disabled={!customerReady} onClick={() => customer ? setChosen(product) : setAuthOpen(true)}>＋ Add</button></div><div className="custom-cut">⌁ &nbsp;Cleaning &amp; cutting available</div><button className="review-link" onClick={() => setReviewProduct(product)}>{product.review_count ? "★ " + Number(product.average_rating).toFixed(1) + " · Read " + product.review_count + (product.review_count === 1 ? " review" : " reviews") : "Read reviews · Write the first review"}</button></div></article>)}</div> : <div className="catalog-empty"><span>🐟</span><h3>No catches match those filters</h3><p>Try a different fish type or price range.</p></div>}
      {count > 0 && <div className="catalog-pager"><span className="catalog-range">Showing {Math.min((page - 1) * pageSize + 1, count)}–{Math.min(page * pageSize, count)} of {count}</span><button disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>← Previous</button><span>Page {page} of {Math.max(1, Math.ceil(count / pageSize))}</span><button disabled={page >= Math.ceil(count / pageSize) || busy} onClick={() => setPage((value) => value + 1)}>Next →</button></div>}
      <div className="catalog-foot"><span>✓ &nbsp; 100% CIFT tested</span><span>Cold chain maintained, 0–4°C</span><span>Every catch hand-inspected</span></div>
    </section>
      <section data-scroll-reveal className="about-section" id="about"><div className="about-mark" lang="ml">തട്ട്</div><div><span className="section-tag">ABOUT തട്ട് · ഞങ്ങളെക്കുറിച്ച്</span><h2>Fresh from Munambam,<br /><em>prepared your way.</em></h2><p>We bring fresh freshwater and seawater fish directly from Munambam, with no chemicals added. We clean and cut each order to your preference, then deliver it to your door.</p><p className="about-malayalam" lang="ml">മുനമ്പത്ത് നിന്ന് നേരിട്ട് എത്തിക്കുന്ന ശുദ്ധമായ മീൻ · നിങ്ങളുടെ ഇഷ്ടത്തിന് വൃത്തിയാക്കി വീട്ടിലെത്തിക്കുന്നു.</p></div><a className="light-button about-contact" href={"tel:" + storePhoneLink}>Call us <span>{storePhone}</span></a></section>
     <section className="promise-section" id="promise"><div><span className="section-tag">THE തട്ട് PROMISE</span><h2>Good seafood starts<br />with <em>good people.</em></h2><p>We work directly with local fishing communities so every meal brings you closer to the coast.</p></div><div className="promise-grid">{[{title:"Harbor direct",copy:"Fair sourcing from trusted Kochi fishers.",icon:"⌖"},{title:"Cold, always",copy:"Freshness protected from shore to door.",icon:"❄"},{title:"Cut your way",copy:"Prepared to your preference, just in time.",icon:"♧"},{title:"People first",copy:"Honest quality and thoughtful service.",icon:"♡"}].map((item)=><article key={item.title}><span>{item.icon}</span><strong>{item.title}</strong><p>{item.copy}</p></article>)}</div></section>
      <footer data-scroll-reveal className="shop-footer"><div className="footer-main"><div className="footer-brand-col"><div className="footer-brand-logo"><ThattBrand /><span>FRESH FROM MUNAMBAM</span></div><p>Fresh fish from Munambam, cleaned your way and delivered to your door.</p></div><nav className="footer-column" aria-label="Footer navigation"><strong>Explore</strong><a href="#catalog">Shop products</a><a href="#about">About us</a><a href="#promise">Our promise</a></nav><div className="footer-column"><strong>Contact</strong><a href={"tel:" + storePhoneLink}>{storePhone}</a><a href="mailto:hello@thatt.example">hello@thatt.example</a></div><div className="footer-column"><strong>Our location</strong><span>Munambam, a suburb of Kochi, Kerala, India</span></div></div><div className="footer-bottom"><span>© {new Date().getFullYear()} vishnudas-max. All rights reserved.</span><span>Made for the love of fresh seafood · Kerala</span></div></footer>
     {chosen && <CustomizeDialog product={chosen} onClose={() => setChosen(null)} onAdd={addConfigured} />}
     {reviewProduct && <ReviewDialog product={reviewProduct} isAuthenticated={Boolean(customer)} onClose={() => setReviewProduct(null)} onSignIn={() => { setReviewProduct(null); setAuthOpen(true); }} />}
    {cartOpen && <CartDrawer cart={cart} error={loadCartError} onClose={() => setCartOpen(false)} onRefresh={loadCart} />}
    {authOpen && <AuthDialog onClose={() => setAuthOpen(false)} onSignedIn={signInDone} />}
  </main>;
}

function CustomizeDialog({ product, onClose, onAdd }: { product: Product; onClose: () => void; onAdd: (product: Product, quantity: number, options: number[], preorderEligible: boolean) => Promise<void> }) {
  const min = Number(product.minimum_quantity); const step = Number(product.quantity_step); const stock = Number(product.available_quantity);
  const [quantity, setQuantity] = useState(min); const [options, setOptions] = useState<number[]>([]); const [preorder, setPreorder] = useState(false); const [submitting, setSubmitting] = useState(false); const [error, setError] = useState("");
  const productSubtotal = quantity * Number(product.price_per_unit);
  const selectedOptions = product.processing_options.filter((option) => options.includes(option.id));
  const processingSubtotal = selectedOptions.reduce((sum, option) => sum + (product.unit === "kg" ? quantity * Number(option.price_per_kg) : 0), 0);
  const gst = productSubtotal * Number(product.gst_rate) / 100 + selectedOptions.reduce((sum, option) => sum + (product.unit === "kg" ? quantity * Number(option.price_per_kg) * Number(option.gst_rate) / 100 : 0), 0);
  const estimatedTotal = productSubtotal + processingSubtotal + gst;
  async function add() { setSubmitting(true); setError(""); try { await onAdd(product, quantity, options, preorder); } catch (err) { setError(err instanceof Error ? err.message : "Could not add item."); } finally { setSubmitting(false); } }
  return <div className="modal-backdrop customer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="customize-card" role="dialog" aria-modal="true" aria-labelledby="customize-title"><div className="customize-top"><div><span className="section-tag">MAKE IT YOURS</span><h2 id="customize-title">{product.name}</h2><p>{money(product.price_per_unit)} / {product.unit === "kg" ? "kg" : "piece"}</p></div><button className="customer-close" onClick={onClose} aria-label="Close customization">×</button></div>
    <div className="quantity-config"><div><strong>Choose quantity</strong><small>{product.unit === "kg" ? `Minimum ${min} kg · step ${step} kg` : `Minimum ${min} piece`}</small></div><div className="quantity-control"><button aria-label="Decrease quantity" disabled={quantity <= min} onClick={() => setQuantity(Math.max(min, Number((quantity - step).toFixed(3))))}>−</button><strong>{quantity.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} {product.unit}</strong><button aria-label="Increase quantity" disabled={!preorder && stock > 0 && quantity + step > stock} onClick={() => setQuantity(Number((quantity + step).toFixed(3)))}>＋</button></div></div>
    {product.processing_options.length > 0 && <div className="processing-config"><div><strong>How should we prepare it?</strong><small>Charged per kg, added to your total</small></div>{product.processing_options.map((option) => <label className="option-row" key={option.id}><span><b>{option.name}</b><small>+ {money(option.price_per_kg)} / kg</small></span><input type="checkbox" checked={options.includes(option.id)} onChange={() => setOptions((current) => current.includes(option.id) ? current.filter((id) => id !== option.id) : [...current, option.id])} /></label>)}</div>}
    <label className="preorder-check"><input type="checkbox" checked={preorder} onChange={(e) => setPreorder(e.target.checked)} /><span><b>Allow a future preorder</b><small>Lets you add this item when today’s stock is low. Choose a future slot at checkout.</small></span></label>
    {!preorder && stock > 0 && <div className="stock-hint">{stock} {product.unit} available now</div>}{error && <div className="customer-error">{error}</div>}
    <div className="price-breakdown"><div><span>Fish / product</span><strong>{money(productSubtotal)}</strong></div>{processingSubtotal > 0 && <div><span>Preparation</span><strong>{money(processingSubtotal)}</strong></div>}<div><span>GST at applicable category rates</span><strong>{money(gst)}</strong></div><div className="price-breakdown-total"><span>Estimated total</span><strong>{money(estimatedTotal)}</strong></div></div>
     <button className="plum-button wide-button" disabled={submitting || (!preorder && stock > 0 && quantity > stock)} onClick={add}>Add to cart · {money(estimatedTotal)} <span>→</span></button></section></div>;
}

function ProductReviews({ product, isAuthenticated, onSignIn }: { product: Product; isAuthenticated: boolean; onSignIn: () => void }) {
  const [reviews, setReviews] = useState<import("@/lib/customer-api").ProductReview[]>([]);
  const [myReview, setMyReview] = useState<import("@/lib/customer-api").ProductReview | null>(null);
  const [rating, setRating] = useState(5); const [comment, setComment] = useState("");
  const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await customerApi<import("@/lib/customer-api").ProductReview[]>("catalog/products/" + product.slug + "/reviews/");
      setReviews(data);
      const own = data.find((review) => review.is_mine) || null;
      setMyReview(own);
      if (own) { setRating(own.rating); setComment(own.comment); }
    } catch { setReviews([]); setMyReview(null); }
    finally { setLoading(false); }
  }, [product.slug, isAuthenticated]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await customerApi(myReview ? "catalog/reviews/" + myReview.id + "/" : "catalog/products/" + product.slug + "/reviews/", { method: myReview ? "PATCH" : "POST", body: JSON.stringify({ rating, comment }) });
      setNotice(myReview ? "Your review has been updated." : "Thanks for sharing your experience."); await load();
    }
    catch (err) { setError(err instanceof Error ? err.message : "You can review after a completed purchase."); }
    finally { setBusy(false); }
  }
  async function deleteMine() {
    if (!myReview) return;
    setBusy(true); setError(""); setNotice("");
    try { await customerApi("catalog/reviews/" + myReview.id + "/", { method: "DELETE" }); setMyReview(null); setRating(5); setComment(""); setNotice("Your review has been removed."); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not delete your review."); }
    finally { setBusy(false); }
  }
  const average = Number(product.average_rating || 0);
  return <div className="review-panel">
    <div className="review-summary-card"><div className="review-average"><strong>{product.review_count ? average.toFixed(1) : "—"}</strong><StarDisplay rating={average} /><small>{product.review_count} {product.review_count === 1 ? "review" : "reviews"}</small></div><div className="review-summary-copy"><b>Fresh catch, honest feedback.</b><span>Reviews are shared by customers after a completed order.</span></div></div>
    {isAuthenticated ? <form className="review-form" onSubmit={submit}><div className="review-form-heading"><div><span className="section-tag">YOUR EXPERIENCE</span><strong>{myReview ? "Update your review" : "Tried this catch?"}</strong></div><span className="verified-chip">✓ VERIFIED ORDER</span></div><div className="star-picker" role="radiogroup" aria-label="Choose a star rating">{[1,2,3,4,5].map((value) => <button key={value} type="button" role="radio" aria-checked={rating === value} aria-label={value + " star" + (value === 1 ? "" : "s")} className={value <= rating ? "star-choice active" : "star-choice"} onClick={() => setRating(value)}>★</button>)}<span>{rating} out of 5</span></div><textarea aria-label="Review comment" maxLength={1000} placeholder="Tell us what you thought about the freshness and preparation…" value={comment} onChange={(event) => setComment(event.target.value)} /><div className="review-form-footer"><small>{comment.length}/1000</small><div>{myReview && <button type="button" className="text-button" disabled={busy} onClick={() => void deleteMine()}>Delete review</button>}<button className="plum-button" disabled={busy}>{busy ? "Saving…" : myReview ? "Save changes" : "Post review"} <span>→</span></button></div></div>{error && <p className="customer-error">{error}</p>}{notice && <p className="review-notice">{notice}</p>}<small className="review-rule">You can review this item after its order is completed.</small></form> : <div className="review-signin"><div><b>Have you tried this catch?</b><span>Sign in to leave a review after a completed order.</span></div><button className="plum-button" onClick={onSignIn}>Sign in <span>→</span></button></div>}
    <div className="review-list-heading"><strong>Customer notes</strong><span>{product.review_count ? product.review_count + " total" : "No reviews yet"}</span></div>
    {loading ? <div className="reviews-loading"><i /><span>Loading customer reviews</span></div> : reviews.length ? <div className="review-list">{reviews.map((review) => <article className="review-item" key={review.id}><div className="review-item-top"><StarDisplay rating={review.rating} /><small>{new Date(review.created_at).toLocaleDateString()}</small></div><strong>{review.display_name}{review.is_mine && <span className="you-tag">YOUR REVIEW</span>}</strong>{review.comment && <p>{review.comment}</p>}</article>)}</div> : <div className="reviews-empty"><span>✦</span><strong>Be the first to share your experience</strong><p>Your feedback helps other seafood lovers choose with confidence.</p></div>}
  </div>;
}

function StarDisplay({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return <span className="star-display" aria-label={rating.toFixed(1) + " out of 5 stars"}>{[1,2,3,4,5].map((star) => <span className={star <= rounded ? "filled" : "empty"} key={star}>★</span>)}</span>;
}

function ReviewDialog({ product, isAuthenticated, onClose, onSignIn }: { product: Product; isAuthenticated: boolean; onClose: () => void; onSignIn: () => void }) {
  return <div className="review-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" onMouseDown={(event) => event.stopPropagation()}><div className="review-dialog-head"><div><span className="section-tag">COMMUNITY REVIEWS · ഉപഭോക്തൃ അഭിപ്രായങ്ങൾ</span><h2 id="review-dialog-title">Customer reviews</h2><p>{product.name}</p></div><button className="customer-close" aria-label="Close reviews" onClick={onClose}>×</button></div><ProductReviews product={product} isAuthenticated={isAuthenticated} onSignIn={onSignIn} /></section></div>;
}

function CartDrawer({ cart, error, onClose, onRefresh }: { cart: Cart | null; error: string; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [removeError, setRemoveError] = useState("");
  async function remove(id: number) { setRemoveError(""); try { await customerApi(`cart/items/${id}/`, { method: "DELETE" }); await onRefresh(); } catch (err) { setRemoveError(err instanceof Error ? err.message : "Could not remove this item."); } }
  return <div className="modal-backdrop drawer-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title"><div className="drawer-title"><div><span className="section-tag">YOUR HARBOR PICKS</span><h2 id="cart-title">Your cart</h2></div><button className="customer-close" onClick={onClose}>×</button></div>{error && <div className="customer-error">{error}</div>}{removeError && <div className="customer-error">{removeError}</div>}{!cart?.items.length ? <div className="cart-empty"><span>♧</span><h3>Your cart is waiting</h3><p>Add your favorite fresh catch to get started.</p></div> : <><div className="cart-lines">{cart.items.map((item) => <article className="cart-line" key={item.id}><img src={cartImage(item.image)} alt="" /><div><strong>{item.product_name}</strong><small>{item.quantity} {item.unit}{item.selected_options.length ? ` · ${item.selected_options.map((option) => option.name).join(", ")}` : ""}</small><b>{money(item.total)}</b></div><button onClick={() => void remove(item.id)} aria-label={`Remove ${item.product_name}`}>×</button></article>)}</div><div className="price-breakdown"><div><span>Items and preparation</span><strong>{money(cart.subtotal)}</strong></div><div><span>GST (where applicable)</span><strong>{money(cart.gst_total)}</strong></div><div><span>Delivery</span><strong>Calculated at checkout</strong></div><div className="price-breakdown-total"><span>Items total</span><strong>{money(cart.total)}</strong></div></div><details className="price-explanation"><summary>How we calculate this total</summary><p>Item prices and selected preparation charges make up the subtotal. GST is calculated using the rates configured for each product category and service. Delivery is calculated after you select a pinned address at checkout.</p></details><Link href="/checkout" onClick={onClose} className="plum-button wide-button">Continue to checkout · {money(cart.total)} <span>→</span></Link></>}</aside></div>;
}
