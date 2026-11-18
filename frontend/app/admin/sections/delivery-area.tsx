"use client";

import { FormEvent, useEffect, useState } from "react";
import { Coordinates, LocationMapPicker } from "@/app/components/map-picker";
import { staffApi } from "@/lib/staff-api";

type Area = { latitude: number | null; longitude: number | null; max_delivery_distance_km: string; free_delivery_km: string; delivery_fee_per_km: string; configured: boolean };
export default function DeliveryAreaPage({ onError }: { onError: (message: string) => void }) {
  const [area, setArea] = useState<Area | null>(null);
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { staffApi<Area>("delivery-area/").then((value) => { setArea(value); setPin(value.configured ? { latitude: Number(value.latitude), longitude: Number(value.longitude) } : null); }).catch((error) => onError(error.message)); }, [onError]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pin) { onError("Select your market location on the map."); return; }
    const form = new FormData(event.currentTarget); setBusy(true);
    try { const updated = await staffApi<Area>("delivery-area/", { method: "PATCH", body: JSON.stringify({ latitude: pin.latitude, longitude: pin.longitude, max_delivery_distance_km: String(form.get("max_delivery_distance_km")), free_delivery_km: String(form.get("free_delivery_km")), delivery_fee_per_km: String(form.get("delivery_fee_per_km")) }) }); setArea(updated); onError(""); }
    catch (error) { onError(error instanceof Error ? error.message : "Could not update delivery area."); }
    finally { setBusy(false); }
  }
  if (!area) return <div className="catalog-loading">Loading delivery area…</div>;
  return <div className="panel table-panel" style={{ padding: 24, maxWidth: 900 }}>
    <div className="panel-heading"><div><h2>Market and delivery pricing</h2><p>Delivery radius and fee use straight-line distance from this market pin.</p></div></div>
    <form onSubmit={save} className="form-grid">
      <div className="span-two"><LocationMapPicker value={pin} onChange={setPin} /></div>
      <label>Market latitude<input type="number" step="0.000001" value={pin?.latitude ?? ""} onChange={(e) => setPin((p) => ({ latitude: Number(e.target.value), longitude: p?.longitude ?? 0 }))} required /></label>
      <label>Market longitude<input type="number" step="0.000001" value={pin?.longitude ?? ""} onChange={(e) => setPin((p) => ({ latitude: p?.latitude ?? 0, longitude: Number(e.target.value) }))} required /></label>
      <label>Maximum delivery radius (km)<input name="max_delivery_distance_km" type="number" min="0.1" max="500" step="0.1" defaultValue={area.max_delivery_distance_km} required /></label>
      <label>Free delivery distance (km)<input name="free_delivery_km" type="number" min="0" max="500" step="0.1" defaultValue={area.free_delivery_km} required /></label>
      <label>Fee per additional km (₹)<input name="delivery_fee_per_km" type="number" min="0" max="10000" step="0.01" defaultValue={area.delivery_fee_per_km} required /></label>
      <div className="form-footer span-two"><span>{area.configured ? "Current location is active" : "Delivery is disabled until you set a market pin"}</span><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save delivery area"}</button></div>
    </form>
  </div>;
}
