import { getJson, isFiniteNumber, isRecordValue, postJson } from "./client";

export type TemporalCandidate = {
  candidate_id: string;
  ra: number;
  dec: number;
  peak_z_score: number;
  angular_velocity_mu: number | null;
  confidence_score_c: number;
  gaia_match: Record<string, unknown> | null;
  wiseview_url: string;
};

export type TemporalResult = {
  status: string;
  ra: number;
  dec: number;
  t1_image_url: string;
  t2_image_url: string;
  diff_z_image_url: string;
  candidates: TemporalCandidate[];
  metrics: Record<string, unknown>;
};

export type JobStatus = {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  step?: string;
  result: TemporalResult | null;
  error?: string | null;
};

function isTemporalCandidate(value: unknown): value is TemporalCandidate {
  return (
    isRecordValue(value) &&
    typeof value.candidate_id === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    isFiniteNumber(value.peak_z_score) &&
    (value.angular_velocity_mu === null || isFiniteNumber(value.angular_velocity_mu)) &&
    isFiniteNumber(value.confidence_score_c) &&
    (value.gaia_match === null || isRecordValue(value.gaia_match)) &&
    typeof value.wiseview_url === "string"
  );
}

export function isTemporalResult(value: unknown): value is TemporalResult {
  return (
    isRecordValue(value) &&
    typeof value.status === "string" &&
    isFiniteNumber(value.ra) &&
    isFiniteNumber(value.dec) &&
    typeof value.t1_image_url === "string" &&
    typeof value.t2_image_url === "string" &&
    typeof value.diff_z_image_url === "string" &&
    Array.isArray(value.candidates) &&
    value.candidates.every(isTemporalCandidate) &&
    isRecordValue(value.metrics)
  );
}

function isJobStatus(value: unknown): value is JobStatus {
  return (
    isRecordValue(value) &&
    typeof value.job_id === "string" &&
    ["queued", "processing", "completed", "failed"].includes(String(value.status)) &&
    (value.step === undefined || typeof value.step === "string") &&
    (value.error === undefined || value.error === null || typeof value.error === "string") &&
    (value.result === null || isTemporalResult(value.result))
  );
}

export function runTemporalComparison(
  input: { ra: number; dec: number; fov_deg: number; band_index: number; epoch_t1: string; epoch_t2: string },
  signal?: AbortSignal,
  onProgress?: (status: JobStatus) => void,
): Promise<TemporalResult> {
  return runTemporalJob("/jobs/temporal", input, signal, onProgress);
}

export async function runTemporalJob(
  path: string,
  input: unknown,
  signal?: AbortSignal,
  onProgress?: (status: JobStatus) => void,
): Promise<TemporalResult> {
  const queued = await postJson(
    path,
    input,
    (value): value is { job_id: string; status: string } =>
      isRecordValue(value) && typeof value.job_id === "string" && value.status === "queued",
    { signal },
  );

  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw signal.reason;
    await waitForPoll(signal);
    const status = await getJson(
      `/jobs/${encodeURIComponent(queued.job_id)}`,
      isJobStatus,
      { signal, timeoutMs: 20_000 },
    );
    onProgress?.(status);
    if (status.status === "failed") throw new Error(status.error || status.step || "El análisis temporal falló.");
    if (status.status === "completed" && status.result) return status.result;
  }
  throw new Error("El trabajo temporal superó el límite de espera de 15 minutos.");
}

function waitForPoll(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const cleanup = () => signal?.removeEventListener("abort", onAbort);
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, 1500);
    const onAbort = () => {
      clearTimeout(timer);
      cleanup();
      reject(signal?.reason);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

