// ---------------------------------------------------------------------------
// Vessel tracking provider abstraction.
//
// Terminal49 is the first implementation (REST + webhooks, tracks by container
// number, master BOL, or booking number). The app works fully in "manual" mode
// when no API key is configured: users edit the current ETA by hand and all
// downstream logic (revisions, risk engine, alerts) behaves identically.
// ---------------------------------------------------------------------------

export interface TrackingIds {
  containerNumber?: string | null;
  mblNumber?: string | null;
  bookingNumber?: string | null;
  carrierScac?: string | null;
}

export interface NormalizedTrackingUpdate {
  /** Provider's id for the tracked shipment, used to match webhooks to rows. */
  subscriptionId?: string | null;
  eta?: Date | null;
  etd?: Date | null;
  ata?: Date | null;
  atd?: Date | null;
  vesselName?: string | null;
  voyage?: string | null;
  pol?: string | null;
  pod?: string | null;
  /** Raw event(s) to append to the shipment's milestone history. */
  events: unknown[];
}

export interface TrackingProvider {
  readonly name: string;
  readonly configured: boolean;
  /** Start tracking; returns the provider's subscription/tracking id. */
  subscribe(ids: TrackingIds): Promise<string | null>;
  /** Poll the latest state for a subscription (cron backstop). */
  fetchLatest(subscriptionId: string): Promise<NormalizedTrackingUpdate | null>;
}

const T49_BASE = "https://api.terminal49.com/v2";

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

type Json = Record<string, unknown>;
const get = (o: unknown, path: string[]): unknown =>
  path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Json)[k] : undefined), o);

class Terminal49Provider implements TrackingProvider {
  readonly name = "terminal49";
  private apiKey = process.env.TERMINAL49_API_KEY;

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const res = await fetch(`${T49_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
    if (!res.ok) {
      throw new Error(`Terminal49 ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async subscribe(ids: TrackingIds): Promise<string | null> {
    if (!this.configured) return null;
    const requestNumber = ids.mblNumber ?? ids.bookingNumber ?? ids.containerNumber;
    if (!requestNumber) return null;
    const requestType = ids.mblNumber
      ? "bill_of_lading"
      : ids.bookingNumber
        ? "booking_number"
        : "container";
    const body = {
      data: {
        type: "tracking_request",
        attributes: {
          request_type: requestType,
          request_number: requestNumber,
          scac: ids.carrierScac ?? undefined,
        },
      },
    };
    const json = await this.request("/tracking_requests", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const id = get(json, ["data", "id"]);
    return typeof id === "string" ? id : null;
  }

  async fetchLatest(subscriptionId: string): Promise<NormalizedTrackingUpdate | null> {
    if (!this.configured) return null;
    const json = await this.request(
      `/tracking_requests/${subscriptionId}?include=tracked_object`,
    );
    const included = get(json, ["included"]);
    const shipment = Array.isArray(included)
      ? included.find((i) => get(i, ["type"]) === "shipment")
      : null;
    if (!shipment) return { subscriptionId, events: [json] };
    const attrs = (a: string) => get(shipment, ["attributes", a]);
    return {
      subscriptionId,
      eta: parseDate(attrs("pod_eta_at")) ?? parseDate(attrs("destination_eta_at")),
      etd: parseDate(attrs("pol_etd_at")),
      ata: parseDate(attrs("pod_ata_at")),
      atd: parseDate(attrs("pol_atd_at")),
      vesselName: (attrs("pod_vessel_name") as string) ?? null,
      voyage: (attrs("pod_voyage_number") as string) ?? null,
      pol: (attrs("port_of_lading_locode") as string) ?? null,
      pod: (attrs("port_of_discharge_locode") as string) ?? null,
      events: [shipment],
    };
  }
}

/** Parse a Terminal49 webhook payload into a normalized update. */
export function parseTerminal49Webhook(payload: unknown): NormalizedTrackingUpdate {
  const included = get(payload, ["included"]);
  const shipment = Array.isArray(included)
    ? included.find((i) => get(i, ["type"]) === "shipment")
    : null;
  const refId = get(payload, ["data", "relationships", "reference_object", "data", "id"]);
  const attrs = (a: string) => (shipment ? get(shipment, ["attributes", a]) : undefined);
  return {
    subscriptionId: typeof refId === "string" ? refId : null,
    eta: parseDate(attrs("pod_eta_at")) ?? parseDate(attrs("destination_eta_at")),
    etd: parseDate(attrs("pol_etd_at")),
    ata: parseDate(attrs("pod_ata_at")),
    atd: parseDate(attrs("pol_atd_at")),
    vesselName: (attrs("pod_vessel_name") as string | undefined) ?? null,
    voyage: (attrs("pod_voyage_number") as string | undefined) ?? null,
    pol: (attrs("port_of_lading_locode") as string | undefined) ?? null,
    pod: (attrs("port_of_discharge_locode") as string | undefined) ?? null,
    events: [payload],
  };
}

const terminal49 = new Terminal49Provider();

/** The active provider. Manual mode = provider not configured. */
export function getTrackingProvider(): TrackingProvider {
  return terminal49;
}
