import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Typed application settings (admin-configurable), persisted in AppSetting.
// ---------------------------------------------------------------------------

export interface AppSettings {
  // Parsing regex patterns (evolving formats) — applied in order.
  sampleNumberPatterns: string[];
  brandPatterns: string[];
  categoryPatterns: string[];
  // Recipients notified when inbound parsing is missing required fields.
  missingInfoRecipients: string[];
  // Internal distribution list emailed when a PO is issued.
  internalPoDistribution: string[];
  // PO / Order form number formatting.
  poNumberPrefix: string;
  poNumberStart: number;
  orderFormPrefix: string;
  // Follow-up cadence (days) default.
  followUpCadenceDays: number;
  // Option lists.
  brands: string[];
  categories: string[];
  // Shipment tracking.
  inlandBufferDaysDefault: number; // days from port arrival to customer DC
  riskThresholdDays: number;       // "at risk" when within N days of cancel date
}

export const DEFAULT_SETTINGS: AppSettings = {
  sampleNumberPatterns: [
    "Sample[#:\\s]*([A-Z0-9-]+)",
    "S#\\s*([A-Z0-9-]+)",
    "SMPL[-#:\\s]*([A-Z0-9-]+)",
  ],
  brandPatterns: ["Brand[:\\s]*([A-Za-z0-9 &'-]+)"],
  categoryPatterns: ["Category[:\\s]*([A-Za-z0-9 &'-]+)"],
  missingInfoRecipients: [],
  internalPoDistribution: [],
  poNumberPrefix: "PO",
  poNumberStart: 1,
  orderFormPrefix: "OF",
  followUpCadenceDays: 7,
  brands: ["Aurora", "Northwind", "Coastline", "Vertex", "Maple & Co"],
  categories: ["Tops", "Bottoms", "Outerwear", "Dresses", "Accessories", "Footwear"],
  inlandBufferDaysDefault: 5,
  riskThresholdDays: 7,
};

const SETTINGS_KEY = "app_settings";

/** Load merged settings (defaults + persisted overrides). */
export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...(row.value as Partial<AppSettings>) };
}

/** Persist a partial settings update. */
export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await prisma.appSetting.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: next },
    update: { value: next },
  });
  return next;
}
