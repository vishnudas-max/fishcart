"use client";

import { FormEvent, useEffect, useState } from "react";
import { Coordinates, LocationMapPicker } from "@/app/components/map-picker";
import { staffApi } from "@/lib/staff-api";

type Area = { latitude: number | null; longitude: number | null; radius_km: string; configured: boolean };
export default function DeliveryAreaPage({ onError }: { onError: (message: string) => void }) {
  const [area, setArea] = useState<Area | null>(null);
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { staffApi<Area>("delivery-area/").then((value) => { setArea(value); setPin(value.configured ? { latitude: Number(value.latitude), longitude: Number(value.longitude) } : null); }).catch((error) => onError(error.message)); }, [onError]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pin) { onError("Select your market location on the map."); return; }
    const form = new FormData(event.currentTarget); setBusy(true);
    try { const updated = await staffApi<Area>("delivery-area/", { method: "PATCH", body: JSON.stringify({ latitude: pin.latitude, longitude: pin.longitude, radius_km: String(form.get("radius_km")) }) }); setArea(updated); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : "Could not update delivery area."); }
    finally { setBusy(false); }
  }
  if (!area) return <div className="catalog-loading">Loading delivery area…</div>;
  return <div className="panel table-panel" style={{ padding: 24, maxWidth: 900 }}>
    <div className="panel-heading"><div><h2>Market and delivery range</h2><p>Customers can place orders only when their pinned address is inside this radius.</p></div></div>
    <form onSubmit={save} className="form-grid">
      <div className="span-two"><LocationMapPicker value={pin} onChange={setPin} /></div>
      <label>Market latitude<input type="number" step="0.000001" value={pin?.latitude ?? ""} onChange={(e) => setPin((p) => ({ latitude: Number(e.target.value), longitude: p?.longitude ?? 0 }))} required /></label>
      <label>Market longitude<input type="number" step="0.000001" value={pin?.longitude ?? ""} onChange={(e) => setPin((p) => ({ latitude: p?.latitude ?? 0, longitude: Number(e.target.value) }))} required /></label>
      <label>Delivery radius (km)<input name="radius_km" type="number" min="0.1" max="500" step="0.1" defaultValue={area.radius_km} required /></label>
      <div className="form-footer span-two"><span>{area.configured ? "Current location is active" : "Delivery is disabled until you set a market pin"}</span><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save delivery area"}</button></div>
    </form>
  </div>;
}
