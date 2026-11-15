import { getJson, isFiniteNumber, isRecordValue } from "./client";

export type FeaturedRegion = {
  region_id: string;
  name: string;
  ra: number;
  dec: number;
  fov_deg: number;
  description: string;
  recommended_epochs: string[];
};

export type Observation = {
  plane_id: string;
  obs_id: string;
  collection: string;
  t_min: number;
  t_max: number;
  wavelength_min_um: number | null;
  wavelength_max_um: number | null;
  base_uri: string;
};

export type ObservationSearch = {
  status: string;
  ra: number;
  dec: number;
  fov_deg: number;
  total_found: number;
  observations: Observation[];
};

function isFeaturedRegion(value: unknown): value is FeaturedRegion {
  return (
    isRecordValue(value) &&
    typeof value.region_id === "string" &&
    typeof value.name === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    isFiniteNumber(value.fov_deg) &&
    typeof value.description === "string" &&
    Array.isArray(value.recommended_epochs) &&
    value.recommended_epochs.every((item) => typeof item === "string")
  );
}

function isObservation(value: unknown): value is Observation {
  return (
    isRecordValue(value) &&
    typeof value.plane_id === "string" &&
    typeof value.obs_id === "string" &&
    typeof value.collection === "string" &&
    isFiniteNumber(value.t_min) &&
    isFiniteNumber(value.t_max) &&
    (value.wavelength_min_um === null || isFiniteNumber(value.wavelength_min_um)) &&
    (value.wavelength_max_um === null || isFiniteNumber(value.wavelength_max_um)) &&
    typeof value.base_uri === "string"
  );
}

export function isObservationSearch(value: unknown): value is ObservationSearch {
  return (
    isRecordValue(value) &&
    typeof value.status === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    isFiniteNumber(value.fov_deg) &&
    isFiniteNumber(value.total_found) &&
    Array.isArray(value.observations) &&
    value.observations.every(isObservation)
  );
}

export function getFeaturedRegions(signal?: AbortSignal) {
  return getJson<FeaturedRegion[]>(
    "/sky/regions/featured",
    (value): value is FeaturedRegion[] => Array.isArray(value) && value.every(isFeaturedRegion),
    { signal },
  );
}

export function searchObservations(ra: number, dec: number, fovDeg: number, signal?: AbortSignal) {
  const params = new URLSearchParams({
    ra: String(ra),
    dec: String(dec),
    fov_deg: String(fovDeg),
  });
  return getJson(`/sky/observations?${params}`, isObservationSearch, { signal });
}
