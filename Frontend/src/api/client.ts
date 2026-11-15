const configuredApiUrl = import.meta.env.VITE_API_URL?.trim() || "http://localhost:8000";
export const apiBaseUrl = configuredApiUrl.replace(/\/+$/, "");
const apiPrefix = "/api/v1";
type InFlightGet = {
  promise: Promise<unknown>;
  controller: AbortController;
  subscribers: number;
  settled: boolean;
};
const inFlightGets = new Map<string, InFlightGet>();

export class ApiError extends Error {
  constructor(
    message: string,
    readonly kind: "network" | "timeout" | "http" | "invalid-response",
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function request<T>(
  path: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {},
): Promise<T> {
  const { method = "GET", body, signal, timeoutMs = 180_000 } = options;
  const url = `${apiBaseUrl}${apiPrefix}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Request timed out")), timeoutMs);
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      if (!response.ok) {
        throw new ApiError(`Error HTTP ${response.status}`, "http", response.status);
      }
      throw new ApiError("El backend devolvió una respuesta JSON no válida.", "invalid-response");
    }

    if (!response.ok) {
      const detail =
        isRecord(payload) && typeof payload.detail === "string"
          ? payload.detail
          : `Error HTTP ${response.status}`;
      throw new ApiError(detail, "http", response.status);
    }
    return payload as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) {
      throw new ApiError("La solicitud al backend excedió el tiempo de espera.", "timeout");
    }
    throw new ApiError(
      "No se pudo conectar con el backend. Comprueba que esté iniciado y que CORS permita este origen.",
      "network",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

export function getJson<T>(
  path: string,
  validate: (value: unknown) => value is T,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  if (options.signal?.aborted) return Promise.reject(options.signal.reason);
  const key = `${apiBaseUrl}${apiPrefix}${path}`;
  let flight = inFlightGets.get(key);
  if (!flight) {
    const controller = new AbortController();
    flight = {
      promise: request<unknown>(path, { timeoutMs: options.timeoutMs, signal: controller.signal }),
      controller,
      subscribers: 0,
      settled: false,
    };
    inFlightGets.set(key, flight);
    const registeredFlight = flight;
    void registeredFlight.promise.then(
      () => {
        registeredFlight.settled = true;
        if (inFlightGets.get(key) === registeredFlight) inFlightGets.delete(key);
      },
      () => {
        registeredFlight.settled = true;
        if (inFlightGets.get(key) === registeredFlight) inFlightGets.delete(key);
      },
    );
  }
  const sharedFlight = flight;
  const sharedRequest = new Promise<unknown>((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(options.signal.reason);
      return;
    }
    sharedFlight.subscribers += 1;
    let completed = false;
    const finish = () => {
      if (completed) return;
      completed = true;
      options.signal?.removeEventListener("abort", onAbort);
      sharedFlight.subscribers -= 1;
      if (sharedFlight.subscribers === 0 && !sharedFlight.settled) {
        if (inFlightGets.get(key) === sharedFlight) inFlightGets.delete(key);
        sharedFlight.controller.abort();
      }
    };
    const onAbort = () => {
      finish();
      reject(options.signal?.reason);
    };
    options.signal?.addEventListener("abort", onAbort, { once: true });
    sharedFlight.promise.then(
      (value) => {
        if (completed) return;
        finish();
        resolve(value);
      },
      (error: unknown) => {
        if (completed) return;
        finish();
        reject(error);
      },
    );
  });
  return sharedRequest.then((value) => {
    if (!validate(value)) {
      throw new ApiError("La respuesta no coincide con el contrato esperado.", "invalid-response");
    }
    return value;
  });
}

export function postJson<T>(
  path: string,
  body: unknown,
  validate: (value: unknown) => value is T,
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<T> {
  return request<unknown>(path, { ...options, method: "POST", body }).then((value) => {
    if (!validate(value)) throw new ApiError("La respuesta no coincide con el contrato esperado.", "invalid-response");
    return value;
  });
}

export function backendAssetUrl(path: string): string {
  return new URL(path, `${apiBaseUrl}/`).toString();
}

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
