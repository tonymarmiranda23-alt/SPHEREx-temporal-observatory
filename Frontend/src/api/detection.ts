import { getJson, isFiniteNumber, isRecordValue } from "./client";

export type CandidateDiscovery = {
  id: number;
  candidate_code: string;
  ra: number;
  dec: number;
  category: string;
  peak_z_score: number;
  epochs_involved: string[];
  metrics_summary: Record<string, unknown> | null;
  created_at: string | null;
};

export type CandidateEvidence = {
  candidate_code: string;
  ra: number;
  dec: number;
  category: string;
  peak_z_score: number;
  epochs_involved: string[];
  metrics_summary: Record<string, unknown> | null;
  is_verified: boolean;
};

function isCandidate(value: unknown): value is CandidateDiscovery {
  return (
    isRecordValue(value) &&
    isFiniteNumber(value.id) &&
    typeof value.candidate_code === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    typeof value.category === "string" &&
    isFiniteNumber(value.peak_z_score) &&
    Array.isArray(value.epochs_involved) &&
    value.epochs_involved.every((item) => typeof item === "string") &&
    (value.metrics_summary === null || isRecordValue(value.metrics_summary)) &&
    (value.created_at === null || typeof value.created_at === "string")
  );
}

export function isDiscoveryList(value: unknown): value is CandidateDiscovery[] {
  return Array.isArray(value) && value.every(isCandidate);
}

export function getDiscoveries(limit = 50, signal?: AbortSignal) {
  return getJson(`/detection/discoveries?limit=${limit}`, isDiscoveryList, { signal });
}

export function getDiscoveryEvidence(code: string, signal?: AbortSignal) {
  return getJson(
    `/detection/discoveries/${encodeURIComponent(code)}`,
    (value): value is CandidateEvidence =>
      isRecordValue(value) &&
      typeof value.candidate_code === "string" &&
      isFiniteNumber(value.ra) &&
      isFiniteNumber(value.dec) &&
      typeof value.category === "string" &&
      isFiniteNumber(value.peak_z_score) &&
      Array.isArray(value.epochs_involved) &&
      value.epochs_involved.every((item) => typeof item === "string") &&
      (value.metrics_summary === null || isRecordValue(value.metrics_summary)) &&
      typeof value.is_verified === "boolean",
    { signal },
  );
}
