"use client";

import { FormEvent, useEffect, useState } from "react";
import { getCsrfCookie, staffApi } from "@/lib/staff-api";
import ProductsPage from "./sections/products";
import CategoriesPage from "./sections/categories";
import OrdersPage from "./sections/orders";
import ProcessingPage from "./sections/processing";
import DirectoryPage from "./sections/directory";

type Section = "overview" | "orders" | "products" | "categories" | "processing" | "customers" | "addresses";
type Staff = { id: number; username: string; is_superuser: boolean };
type Stats = { active_products: number; active_categories: number; customers: number; open_orders: number; pending_preorders: number; active_carts: number };

const navigation: { id: Section; label: string; icon: string; group: string }[] = [
  { id: "overview", label: "Overview", icon: "◫", group: "WORKSPACE" },
  { id: "orders", label: "Orders", icon: "▤", group: "WORKSPACE" },
  { id: "products", label: "Products", icon: "◈", group: "CATALOG" },
  { id: "categories", label: "Categories", icon: "▦", group: "CATALOG" },
  { id: "processing", label: "Fish processing", icon: "⌁", group: "CATALOG" },
  { id: "customers", label: "Customers", icon: "♙", group: "PEOPLE" },
  { id: "addresses", label: "Addresses", icon: "⌖", group: "PEOPLE" },
];

export default function AdminDashboard() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [checking, setChecking] = useState(true);
  const [section, setSection] = useState<Section>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    staffApi<Staff>("me/").then(setStaff).catch(() => setStaff(null)).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!staff) return;
    staffApi<Stats>("dashboard/").then(setStats).catch((err) => setError(err.message));
  }, [staff, section]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await getCsrfCookie();
      const loggedIn = await staffApi<Staff>("login/", { method: "POST", body: JSON.stringify({ username: data.get("username"), password: data.get("password") }) });
      setStaff(loggedIn);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    }
  }

  async function signOut() {
    try { await staffApi("logout/", { method: "POST" }); } catch { /* the browser may already have an expired session */ }
    setStaff(null);
  }

  if (checking) return <main className="boot-screen"><span className="brand-mark">S</span><span>Opening SeaCart staff…</span></main>;

  if (!staff) return (
    <main className="login-shell">
      <div className="login-art">
        <div className="login-brand"><span className="brand-mark">S</span><span>SeaCart<span className="brand-soft"> / operations</span></span></div>
        <div className="login-art-copy"><span className="eyebrow">FRESH FROM THE COAST</span><h1>Good seafood.<br />Thoughtful service.</h1><p>Your daily operations, in one calm place.</p></div>
        <div className="wave-art" aria-hidden="true"><span>〰</span><span>〰</span><span>〰</span></div>
        <small>STAFF WORKSPACE · SECURE ACCESS</small>
      </div>
      <div className="login-panel"><form className="login-card" onSubmit={signIn}>
        <div className="login-icon">↗</div><p className="eyebrow">WELCOME BACK</p><h2>Sign in to your workspace</h2><p className="muted">Use your staff username and password.</p>
        <label>Username<input name="username" autoComplete="username" required autoFocus /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="primary-button full-button">Sign in <span>→</span></button>
        <p className="login-footnote">Staff accounts are managed by an administrator.</p>
      </form></div>
    </main>
  );

  const current = navigation.find((item) => item.id === section)!;
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark">S</span><span>SeaCart<small>STAFF CONSOLE</small></span></div>
        <div className="sidebar-location"><span className="location-dot" /> OPERATIONS <span className="chevron">⌄</span></div>
        {(["WORKSPACE", "CATALOG", "PEOPLE"] as const).map((group) => <div className="nav-group" key={group}>
          <p className="nav-caption">{group}</p>
          {navigation.filter((item) => item.group === group).map((item) => <button key={item.id} onClick={() => { setSection(item.id); setError(""); }} className={`nav-item ${section === item.id ? "active" : ""}`}><span className="nav-icon">{item.icon}</span>{item.label}{item.id === "orders" && stats?.pending_preorders ? <span className="nav-count">{stats.pending_preorders}</span> : null}</button>)}
        </div>)}
        <div className="sidebar-bottom"><div className="staff-avatar">{staff.username.slice(0, 1).toUpperCase()}</div><div className="staff-meta"><strong>{staff.username}</strong><span>{staff.is_superuser ? "Superuser" : "Staff account"}</span></div><button className="logout-button" onClick={signOut} aria-label="Sign out">↪</button></div>
      </aside>
      <main className="main-area">
        <header className="topbar"><div><span className="crumb">SeaCart <span>/</span> {current.label}</span><h1>{section === "overview" ? "Good morning" : current.label}<span className="wave-emoji">{section === "overview" ? " ☀" : ""}</span></h1></div><div className="topbar-right"><span className="today-label">{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date())}</span><div className="top-avatar">{staff.username.slice(0, 1).toUpperCase()}</div></div></header>
        {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
        <div className="page-content">
          {section === "overview" && <Overview stats={stats} onOpen={setSection} />}
          {section === "products" && <ProductsPage onError={setError} />}
          {section === "categories" && <CategoriesPage onError={setError} />}
          {section === "processing" && <ProcessingPage onError={setError} />}
          {section === "orders" && <OrdersPage onError={setError} />}
          {section === "customers" && <DirectoryPage kind="customers" onError={setError} />}
          {section === "addresses" && <DirectoryPage kind="addresses" onError={setError} />}
        </div>
      </main>
    </div>
  );
}

function Overview({ stats, onOpen }: { stats: Stats | null; onOpen: (section: Section) => void }) {
  const cards = [
    { label: "Open orders", value: stats?.open_orders ?? "—", hint: "Need attention", icon: "▤", accent: "blue", target: "orders" as Section },
    { label: "Pending preorders", value: stats?.pending_preorders ?? "—", hint: "Scheduled for later", icon: "◷", accent: "amber", target: "orders" as Section },
    { label: "Active products", value: stats?.active_products ?? "—", hint: "Visible in catalog", icon: "◈", accent: "green", target: "products" as Section },
    { label: "Customers", value: stats?.customers ?? "—", hint: "Registered accounts", icon: "♙", accent: "violet", target: "customers" as Section },
  ];
  return <>
    <div className="welcome-row"><div><p className="section-kicker">YOUR STORE, AT A GLANCE</p><p className="muted">Here’s what’s happening across your seafood store.</p></div><button className="secondary-button" onClick={() => onOpen("products")}>＋ Add product</button></div>
    <div className="stats-grid">{cards.map((card) => <button className="stat-card" key={card.label} onClick={() => onOpen(card.target)}><div className={`stat-icon ${card.accent}`}>{card.icon}</div><span className="stat-label">{card.label}</span><strong>{card.value}</strong><span className="stat-hint">{card.hint}<span>↗</span></span></button>)}</div>
    <div className="overview-grid"><div className="panel quick-panel"><div className="panel-heading"><div><h2>Quick actions</h2><p>Common tasks for today</p></div><span className="panel-dots">···</span></div><div className="quick-actions"><button onClick={() => onOpen("products")}><span className="quick-icon teal">＋</span><span><strong>Add a product</strong><small>List fresh catch or pantry goods</small></span><b>→</b></button><button onClick={() => onOpen("categories")}><span className="quick-icon peach">▦</span><span><strong>Manage categories</strong><small>Organize your storefront</small></span><b>→</b></button><button onClick={() => onOpen("processing")}><span className="quick-icon lavender">⌁</span><span><strong>Set fish services</strong><small>Update cleaning and cutting rates</small></span><b>→</b></button><button onClick={() => onOpen("orders")}><span className="quick-icon yellow">◷</span><span><strong>Review preorders</strong><small>Plan for future availability</small></span><b>→</b></button></div></div><div className="panel note-panel"><div className="note-illustration">✳</div><span className="eyebrow">A SMALL REMINDER</span><h2>Freshness is a promise.</h2><p>Keep product availability up to date. Preorders intentionally don’t reserve stock, so review future supply before confirming them.</p><button onClick={() => onOpen("orders")}>Open order management <span>→</span></button></div></div>
    <div className="footer-note"><span className="status-pulse" /> All systems ready <span>·</span> Cart activity: {stats?.active_carts ?? "—"} active carts</div>
  </>;
}
