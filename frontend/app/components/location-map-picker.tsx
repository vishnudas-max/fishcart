"use client";

import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

export type Coordinates = { latitude: number; longitude: number };

const tileUrl = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const tileSize = 256;
const toWorld = ({ latitude, longitude }: Coordinates, zoom: number) => {
  const size = tileSize * 2 ** zoom;
  const safeLat = Math.max(-85.0511, Math.min(85.0511, latitude));
  const radians = safeLat * Math.PI / 180;
  return { x: (longitude + 180) / 360 * size, y: (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * size };
};
const fromWorld = (x: number, y: number, zoom: number): Coordinates => {
  const size = tileSize * 2 ** zoom;
  return { longitude: ((x / size) * 360 - 180 + 540) % 360 - 180, latitude: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / size))) * 180 / Math.PI };
};

export function LocationMapPicker({ value, onChange }: { value: Coordinates | null; onChange: (value: Coordinates) => void }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; centerX: number; centerY: number; moved: boolean } | null>(null);
  const [size, setSize] = useState({ width: 640, height: 300 });
  const [center, setCenter] = useState<Coordinates>(value || { latitude: 9.9312, longitude: 76.2673 });
  const [zoom, setZoom] = useState(12);
  const worldCenter = toWorld(center, zoom);

  useEffect(() => {
    const node = mapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (value) setCenter(value); }, [value?.latitude, value?.longitude]);

  const tiles = useMemo(() => {
    const n = 2 ** zoom;
    const left = Math.floor((worldCenter.x - size.width / 2) / tileSize);
    const right = Math.floor((worldCenter.x + size.width / 2) / tileSize);
    const top = Math.max(0, Math.floor((worldCenter.y - size.height / 2) / tileSize));
    const bottom = Math.min(n - 1, Math.floor((worldCenter.y + size.height / 2) / tileSize));
    const visible = [] as { key: string; url: string; left: number; top: number }[];
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const wrappedX = (x % n + n) % n;
      visible.push({ key: `${zoom}-${wrappedX}-${y}`, url: tileUrl.replace("{z}", String(zoom)).replace("{x}", String(wrappedX)).replace("{y}", String(y)), left: x * tileSize - worldCenter.x + size.width / 2, top: y * tileSize - worldCenter.y + size.height / 2 });
    }
    return visible;
  }, [worldCenter.x, worldCenter.y, size.width, size.height, zoom]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || (event.target as HTMLElement).closest(".map-zoom, .map-attribution")) return;
    const point = toWorld(center, zoom);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, centerX: point.x, centerY: point.y, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved && contentRef.current) contentRef.current.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      setCenter(fromWorld(drag.centerX - (event.clientX - drag.x), drag.centerY - (event.clientY - drag.y), zoom));
      if (contentRef.current) contentRef.current.style.transform = "translate3d(0, 0, 0)";
    } else if (mapRef.current) {
      const rect = mapRef.current.getBoundingClientRect();
      const point = toWorld(center, zoom);
      const selected = fromWorld(point.x + event.clientX - rect.left - size.width / 2, point.y + event.clientY - rect.top - size.height / 2, zoom);
      setCenter(selected); onChange({ latitude: Number(selected.latitude.toFixed(6)), longitude: Number(selected.longitude.toFixed(6)) });
    }
    dragRef.current = null;
  }
  function zoomBy(amount: number) {
    const next = Math.max(3, Math.min(18, zoom + amount));
    const point = value ? toWorld(value, next) : toWorld(center, next);
    setZoom(next); setCenter(fromWorld(point.x, point.y, next));
  }
  const pin = value ? toWorld(value, zoom) : null;

  return <div className="location-map-wrap">
    <div className="location-map" ref={mapRef} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { dragRef.current = null; }} role="application" aria-label="Map. Click to pin a delivery location or drag to move the map.">
      <div className="map-content" ref={contentRef}>
        {tiles.map((tile) => <img key={tile.key} src={tile.url} alt="" draggable={false} referrerPolicy="strict-origin-when-cross-origin" className="map-tile" style={{ left: tile.left, top: tile.top }} />)}
        {pin && <span className="map-pin" style={{ left: pin.x - worldCenter.x + size.width / 2, top: pin.y - worldCenter.y + size.height / 2 }} aria-label="Selected delivery location"><i /></span>}
      </div>
      <div className="map-zoom"><button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">＋</button><button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button></div>
      <small className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></small>
    </div>
    <p className="map-help">Drag to move the map, then tap to pin your delivery spot. {value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : "The map starts around Kochi."}</p>
  </div>;
}
