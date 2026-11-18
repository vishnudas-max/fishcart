"use client";

export type MapPoint = { latitude: number | string; longitude: number | string };

export function DeliveryMapPreview({ market, delivery }: { market: MapPoint; delivery: MapPoint }) {
  const mlat = Number(market.latitude), mlon = Number(market.longitude), dlat = Number(delivery.latitude), dlon = Number(delivery.longitude);
  const span = Math.max(Math.abs(mlat - dlat), Math.abs(mlon - dlon), 0.008) * 1.6;
  const bbox = [mlon - span, mlat - span, mlon + span, mlat + span].join(",");
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${mlat}%2C${mlon}`;
  return <div className="delivery-map-preview">
    <iframe title="Map showing the market location" src={src} loading="lazy" referrerPolicy="no-referrer" />
    <div className="delivery-map-legend"><span><i className="market-map-pin" /> Market location</span><span>Your pin: {dlat.toFixed(5)}, {dlon.toFixed(5)}</span></div>
  </div>;
}
