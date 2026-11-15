import { apiBaseUrl, getJson, isFiniteNumber, isRecordValue } from "./client";
import { runTemporalJob, type JobStatus, type TemporalResult } from "./temporal";

export type FitsModule =
  | "sky_explorer"
  | "temporal_vision"
  | "spectral_analysis"
  | "object_detection"
  | "discovery_catalog";

export type LocalFitsFile = {
  file_id: string;
  relative_path: string;
  filename: string;
  size_bytes: number | null;
  sha256: string | null;
  consumers: FitsModule[];
  product_type: string | null;
  source: string | null;
  downloaded_at: string | null;
  ingested_at: string;
  duplicate_of: string | null;
  validation_status: string;
  validation_warnings: string[];
  hdu_count: number;
  observation: Record<string, unknown>;
  release: string | null;
  release_metadata_present: boolean;
  has_celestial_wcs: boolean;
  has_spectral_wcs: boolean;
  metadata_presence: Record<string, string>;
  compatibility: Record<string, { compatible: boolean; reason: string | null }>;
};

export type LocalFitsCatalog = {
  dataset_root: string;
  generated_at: string;
  total: number;
  files: LocalFitsFile[];
};

export type FitsHeaderCard = {
  keyword: string;
  value: string | number | boolean | null;
  comment: string;
};

export type FitsHduMetadata = {
  index: number;
  name: string | null;
  version: string | number | null;
  type: string;
  shape: number[] | null;
  dtype: string | null;
  has_celestial_wcs: boolean;
  has_spectral_wcs: boolean;
  unit: string | null;
  checksum_present: boolean;
  checksum_valid: boolean | null;
  datasum_present: boolean;
  datasum_valid: boolean | null;
  header_cards: FitsHeaderCard[];
};

export type LocalFitsMetadata = LocalFitsFile & {
  extensions: FitsHduMetadata[];
};

const fitsModules = new Set<string>([
  "sky_explorer",
  "temporal_vision",
  "spectral_analysis",
  "object_detection",
  "discovery_catalog",
]);

export type LocalSpectralPoint = {
  file_id: string;
  filename: string;
  relative_path: string;
  release: string | null;
  ra: number;
  dec: number;
  measurement_type: string;
  wavelength_um: number;
  flux: number;
  flux_error: number;
  flag: number;
  is_valid_measurement: boolean;
  unit: string;
  uncertainty_unit: string;
};

function isLocalFitsFile(value: unknown): value is LocalFitsFile {
  return (
    isRecordValue(value) &&
    typeof value.file_id === "string" &&
    typeof value.relative_path === "string" &&
    typeof value.filename === "string" &&
    (value.size_bytes === null || isFiniteNumber(value.size_bytes)) &&
    (value.sha256 === null || typeof value.sha256 === "string") &&
    Array.isArray(value.consumers) &&
    value.consumers.every((module) => typeof module === "string" && fitsModules.has(module)) &&
    typeof value.validation_status === "string" &&
    isFiniteNumber(value.hdu_count) &&
    isRecordValue(value.observation) &&
    isRecordValue(value.metadata_presence) &&
    Object.values(value.metadata_presence).every((status) => typeof status === "string") &&
    (value.release === null || typeof value.release === "string") &&
    Array.isArray(value.validation_warnings) &&
    value.validation_warnings.every((warning) => typeof warning === "string") &&
    isRecordValue(value.compatibility) &&
    Object.values(value.compatibility).every(
      (item) =>
        isRecordValue(item) &&
        typeof item.compatible === "boolean" &&
        (item.reason === null || typeof item.reason === "string"),
    )
  );
}

function isCatalog(value: unknown): value is LocalFitsCatalog {
  return (
    isRecordValue(value) &&
    typeof value.dataset_root === "string" &&
    typeof value.generated_at === "string" &&
    isFiniteNumber(value.total) &&
    Array.isArray(value.files) &&
    value.files.every(isLocalFitsFile)
  );
}

export function getLocalFitsFiles(module: FitsModule, signal?: AbortSignal) {
  const params = new URLSearchParams({ module });
  return getJson(`/data/fits?${params}`, isCatalog, { signal });
}

function isFitsMetadata(value: unknown): value is LocalFitsMetadata {
  const record = isRecordValue(value) ? value : null;
  if (!record) return false;
  const extensions = record.extensions;
  if (!isLocalFitsFile(record) || !Array.isArray(extensions)) return false;
  const extensionList: unknown[] = extensions;
  return extensionList.every(
    (hdu) =>
      isRecordValue(hdu) &&
      isFiniteNumber(hdu.index) &&
      typeof hdu.type === "string" &&
      (hdu.name === null || typeof hdu.name === "string") &&
      (hdu.shape === null || (Array.isArray(hdu.shape) && hdu.shape.every(isFiniteNumber))) &&
      typeof hdu.has_celestial_wcs === "boolean" &&
      typeof hdu.has_spectral_wcs === "boolean" &&
      (hdu.checksum_valid === null || typeof hdu.checksum_valid === "boolean") &&
      (hdu.datasum_valid === null || typeof hdu.datasum_valid === "boolean") &&
      Array.isArray(hdu.header_cards) &&
      hdu.header_cards.every(
        (card) =>
          isRecordValue(card) &&
          typeof card.keyword === "string" &&
          typeof card.comment === "string" &&
          (card.value === null ||
            typeof card.value === "string" ||
            typeof card.value === "number" ||
            typeof card.value === "boolean"),
      ),
  );
}

export function getFitsMetadata(fileId: string, signal?: AbortSignal) {
  return getJson(`/data/fits/${encodeURIComponent(fileId)}`, isFitsMetadata, { signal });
}

export function getFitsPreviewUrl(fileId: string, hdu?: number) {
  const params = hdu === undefined ? "" : `?hdu=${hdu}`;
  return `${apiBaseUrl}/api/v1/data/fits/${encodeURIComponent(fileId)}/preview${params}`;
}

export function getFitsDownloadUrl(fileId: string) {
  return `${apiBaseUrl}/api/v1/data/fits/${encodeURIComponent(fileId)}/download`;
}

export function getLocalSpectralPoint(fileId: string, ra: number, dec: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ ra: String(ra), dec: String(dec) });
  return getJson(`/data/fits/${encodeURIComponent(fileId)}/spectral-profile?${params}`, isSpectralPoint, { signal, timeoutMs: 120_000 });
}

function isSpectralPoint(value: unknown): value is LocalSpectralPoint {
  return (
    isRecordValue(value) &&
    typeof value.file_id === "string" &&
    typeof value.filename === "string" &&
    typeof value.relative_path === "string" &&
    typeof value.measurement_type === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    isFiniteNumber(value.wavelength_um) &&
    isFiniteNumber(value.flux) &&
    isFiniteNumber(value.flux_error) &&
    isFiniteNumber(value.flag) &&
    typeof value.is_valid_measurement === "boolean" &&
    typeof value.unit === "string" &&
    typeof value.uncertainty_unit === "string"
  );
}

export function runLocalTemporalComparison(
  input: {
    file_id_t1: string;
    file_id_t2: string;
    ra: number;
    dec: number;
  },
  signal?: AbortSignal,
  onProgress?: (status: JobStatus) => void,
): Promise<TemporalResult> {
  return runTemporalJob("/jobs/temporal/local", input, signal, onProgress);
}
