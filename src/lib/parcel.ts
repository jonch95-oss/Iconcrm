/**
 * Inbound parcel tracking for samples (courier from factory to office).
 *
 * Two layers:
 *  1. Always available — carrier auto-detection from the number's shape and a
 *     public tracking link.
 *  2. Live ETAs — when AFTERSHIP_API_KEY is set, the carrier's expected
 *     delivery date and status are pulled in real time (on upload and via a
 *     daily cron). Without the key everything still works; ETAs just stay
 *     blank until the key is added.
 */

export type ParcelCarrier = "ups" | "fedex" | "dhl" | "usps" | "other";

const CARRIER_LABEL: Record<ParcelCarrier, string> = {
  ups: "UPS",
  fedex: "FedEx",
  dhl: "DHL",
  usps: "USPS",
  other: "Carrier",
};

/** Best-effort carrier detection from the tracking number's shape. */
export function detectCarrier(num: string): ParcelCarrier {
  const n = num.replace(/\s/g, "").toUpperCase();
  if (/^1Z[0-9A-Z]{16}$/.test(n)) return "ups";
  if (/^\d{10}$/.test(n)) return "dhl"; // DHL Express air waybill
  if (/^(94|93|92|95)\d{18,24}$/.test(n) || /^[A-Z]{2}\d{9}US$/.test(n)) return "usps";
  if (/^(\d{12}|\d{15}|\d{20,22})$/.test(n)) return "fedex";
  return "other";
}

export function carrierLabel(c: string | null): string {
  return CARRIER_LABEL[(c ?? "other") as ParcelCarrier] ?? "Carrier";
}

/** Public tracking page for a number. */
export function trackingUrl(carrier: string | null, num: string): string {
  const n = encodeURIComponent(num.trim());
  switch (carrier) {
    case "ups":
      return `https://www.ups.com/track?tracknum=${n}`;
    case "fedex":
      return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "dhl":
      return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
    case "usps":
      return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    default:
      return `https://www.google.com/search?q=${n}+tracking`;
  }
}

const AFTERSHIP_SLUG: Record<ParcelCarrier, string> = {
  ups: "ups",
  fedex: "fedex",
  dhl: "dhl",
  usps: "usps",
  other: "",
};

export interface ParcelUpdate {
  eta: Date | null;
  status: string | null; // in_transit | out_for_delivery | delivered | exception
}

function mapTag(tag: string | undefined): string | null {
  switch (tag) {
    case "Delivered":
      return "delivered";
    case "OutForDelivery":
      return "out_for_delivery";
    case "InTransit":
    case "InfoReceived":
    case "Pending":
      return "in_transit";
    case "Exception":
    case "FailedAttempt":
    case "Expired":
      return "exception";
    default:
      return tag ? "in_transit" : null;
  }
}

/**
 * Resolve live ETA + status from AfterShip. Returns null when no API key is
 * configured or the lookup fails — callers treat that as "no update".
 */
export async function resolveParcel(
  trackingNumber: string,
  carrier: ParcelCarrier,
): Promise<ParcelUpdate | null> {
  const key = process.env.AFTERSHIP_API_KEY;
  if (!key) return null;
  const slug = AFTERSHIP_SLUG[carrier];
  if (!slug) return null;

  const headers = { "as-api-key": key, "Content-Type": "application/json" };
  const base = "https://api.aftership.com/tracking/2025-01";
  const num = trackingNumber.trim();

  try {
    // Ensure the tracking exists (idempotent: 4003 = already created).
    const createRes = await fetch(`${base}/trackings`, {
      method: "POST",
      headers,
      body: JSON.stringify({ tracking: { tracking_number: num, slug } }),
    });
    if (!createRes.ok) {
      const body = (await createRes.json().catch(() => null)) as { meta?: { code?: number } } | null;
      if (body?.meta?.code !== 4003) return null;
    }

    const res = await fetch(`${base}/trackings/${slug}/${encodeURIComponent(num)}`, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: {
        tracking?: {
          tag?: string;
          expected_delivery?: string | null;
          latest_estimated_delivery?: { datetime?: string | null } | null;
        };
      };
    };
    const t = data.data?.tracking;
    if (!t) return null;
    const etaRaw = t.latest_estimated_delivery?.datetime ?? t.expected_delivery ?? null;
    return {
      eta: etaRaw ? new Date(etaRaw) : null,
      status: mapTag(t.tag),
    };
  } catch {
    return null;
  }
}
