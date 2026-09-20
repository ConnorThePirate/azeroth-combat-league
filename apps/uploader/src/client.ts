/**
 * client.ts — upload + pairing HTTP client (docs/27).
 *
 * Error taxonomy drives the retry decision:
 *   transient  — network failure, 408/425/429, 5xx   -> retry with backoff
 *   auth       — 401/403                             -> needs re-pairing
 *   permanent  — other 4xx                           -> quarantine, keep evidence
 */
export type UploadErrorKind = "transient" | "auth" | "permanent";

export class UploadError extends Error {
  constructor(
    message: string,
    public readonly kind: UploadErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "UploadError";
  }
}

export interface BatchResult {
  accepted: number;
  alreadyReceived: number;
  needsAttention: number;
  receipts: { nonce: string; receiptId: string; status: string }[];
}

export interface PairStart {
  deviceCode: string;
  userCode: string;
  verifyUrl: string;
  pollIntervalMs: number;
  expiresAtMs: number;
}

export interface HttpLike {
  (url: string, init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }): Promise<{ status: number; json(): Promise<unknown>; text(): Promise<string> }>;
}

export class UploaderClient {
  constructor(
    private readonly baseUrl: string,
    private readonly http: HttpLike = fetch as unknown as HttpLike,
  ) {}

  private async req(
    method: string, path: string, token: string | null, body?: unknown,
  ): Promise<unknown> {
    let res: Awaited<ReturnType<HttpLike>>;
    try {
      res = await this.http(this.baseUrl + path, {
        method,
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      throw new UploadError(`network error: ${(e as Error).message}`, "transient");
    }
    if (res.status >= 200 && res.status < 300) return res.json();
    if (res.status === 401 || res.status === 403) {
      throw new UploadError("credential rejected — re-pair the companion", "auth", res.status);
    }
    if (res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500) {
      throw new UploadError(`server busy (${res.status})`, "transient", res.status);
    }
    const detail = await res.text().catch(() => "");
    throw new UploadError(`upload rejected (${res.status}): ${detail.slice(0, 200)}`,
      "permanent", res.status);
  }

  uploadBatch(
    token: string,
    batch: { reports: unknown[]; contracts?: unknown[]; envelopes?: string[] },
  ): Promise<BatchResult> {
    return this.req("POST", "/v1/reports/batch", token, batch) as Promise<BatchResult>;
  }

  /** Fetch the WFU1 update bundle (receipts, ladder snapshots, rulesets). */
  addonUpdate(token: string): Promise<{ update: string; snapshotSequence: number }> {
    return this.req("GET", "/v1/addon-update", token) as Promise<
      { update: string; snapshotSequence: number }>;
  }

  pairStart(installationId: string): Promise<PairStart> {
    return this.req("POST", "/v1/pair/start", null, { installationId }) as Promise<PairStart>;
  }

  async pairPoll(deviceCode: string): Promise<
    | { status: "pending" }
    | { status: "approved"; token: string; accountId: string; expiresAtMs?: number }
  > {
    return this.req("POST", "/v1/pair/poll", null, { deviceCode }) as Promise<
      { status: "pending" }
      | { status: "approved"; token: string; accountId: string; expiresAtMs?: number }
    >;
  }

  revoke(token: string): Promise<unknown> {
    return this.req("POST", "/v1/pair/revoke", token, {});
  }
}
