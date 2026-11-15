import { getJson, isFiniteNumber, isRecordValue } from "./client";

export type SpectralPoint = {
  wavelength_um: number;
  flux_mjy_sr: number;
  flux_error_mjy_sr: number;
  flag: number;
  is_valid_measurement: boolean;
  obs_id: string;
  t_min: number;
};

export type SpectralProfile = {
  status: string;
  ra: number;
  dec: number;
  total_channels_measured: number;
  measurement_type: string;
  spectrum: SpectralPoint[];
  failed_observations: { obs_id: string; reason: string }[];
};

function isSpectralPoint(value: unknown): value is SpectralPoint {
  return (
    isRecordValue(value) &&
    isFiniteNumber(value.wavelength_um) &&
    value.wavelength_um > 0 &&
    isFiniteNumber(value.flux_mjy_sr) &&
    isFiniteNumber(value.flux_error_mjy_sr) &&
    value.flux_error_mjy_sr >= 0 &&
    isFiniteNumber(value.flag) &&
    typeof value.is_valid_measurement === "boolean" &&
    typeof value.obs_id === "string" &&
    isFiniteNumber(value.t_min)
  );
}

function isSpectralProfile(value: unknown): value is SpectralProfile {
  return (
    isRecordValue(value) &&
    typeof value.status === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    isFiniteNumber(value.total_channels_measured) &&
    typeof value.measurement_type === "string" &&
    Array.isArray(value.spectrum) &&
    value.spectrum.every(isSpectralPoint) &&
    Array.isArray(value.failed_observations) &&
    value.failed_observations.every(
      (item) =>
        isRecordValue(item) &&
        typeof item.obs_id === "string" &&
        typeof item.reason === "string",
    )
  );
}

export function getSpectralProfile(ra: number, dec: number, fovDeg: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ ra: String(ra), dec: String(dec), fov_deg: String(fovDeg) });
  return getJson(`/spectral/profile?${params}`, isSpectralProfile, { signal, timeoutMs: 180_000 });
}
