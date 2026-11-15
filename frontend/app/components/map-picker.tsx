"use client";

import { OpenStreetMapMapProvider } from "./location-map-picker";

export type Coordinates = { latitude: number; longitude: number };

/** Provider boundary: change the implementation here without changing address flows. */
export function LocationMapPicker(props: { value: Coordinates | null; onChange: (value: Coordinates) => void }) {
  return <OpenStreetMapMapProvider {...props} />;
}
