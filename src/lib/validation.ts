import { z } from "zod";

export const currencyEnum = z.enum(["USD", "RMB", "EUR"]);

export const sampleStatusEnum = z.enum([
  "sample_requested",
  "eta_set",
  "sample_received",
  "quoted",
  "on_order_form",
  "pi_received",
  "pi_matched",
  "po_issued",
  "in_production",
  "shipped",
  "packing_list_matched",
  "closed",
  "dropped",
]);

export const droppedReasonEnum = z.enum([
  "customer_passed",
  "price_too_high",
  "quality_fail",
  "factory_issue",
  "other",
]);

// Accept "" -> undefined for optional text fields coming from forms.
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v && v !== "" ? v : undefined));

const decimalString = z
  .string()
  .optional()
  .transform((v) => (v && v !== "" ? v : undefined))
  .refine((v) => v === undefined || !Number.isNaN(Number(v)), {
    message: "Must be a number",
  });

export const sampleCreateSchema = z.object({
  sampleNumber: z.string().trim().min(1, "Sample # is required"),
  brand: optionalString,
  color: optionalString,
  category: optionalString,
  season: optionalString,
  styleName: optionalString,
  styleNumber: optionalString,
  description: optionalString,
  factoryId: optionalString,
  targetCustomer: optionalString,
  fobCost: decimalString,
  currency: currencyEnum.default("USD"),
  fobPort: optionalString,
  customerSellPrice: decimalString,
  dutyRatePercent: decimalString,
  freightPerUnit: decimalString,
  inlandPerUnit: decimalString,
  htsCode: z.string().optional(),
  composition: z.string().optional(),
  cbmPerCarton: decimalString,
  casePackDefault: z.string().optional(),
  trackingNumber: z.string().optional(),
  sampleEta: optionalDate,
  sampleReceivedDate: optionalDate,
});

export const sampleUpdateSchema = sampleCreateSchema.partial().extend({
  id: z.string().min(1),
  status: sampleStatusEnum.optional(),
  droppedReason: droppedReasonEnum.optional(),
  etaReason: optionalString,
});

export const skuVariantSchema = z.object({
  sampleId: z.string().min(1),
  size: z.string().trim().min(1, "Size required"),
  color: z.string().trim().min(1, "Color required"),
  upc: z.string().trim().min(1, "UPC required"),
  skuCode: optionalString,
  unitsPerCarton: z
    .string()
    .optional()
    .transform((v) => (v && v !== "" ? Number(v) : undefined)),
});

export const commentSchema = z.object({
  sampleId: z.string().min(1),
  body: z.string().trim().min(1, "Comment cannot be empty"),
});

export const factorySchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name required"),
  contactName: optionalString,
  contactEmail: optionalString,
  country: optionalString,
  paymentTermsDefault: optionalString,
  notes: optionalString,
});

// Postmark inbound webhook payload (subset we use).
export const postmarkInboundSchema = z.object({
  From: z.string().optional(),
  FromFull: z.object({ Email: z.string().optional(), Name: z.string().optional() }).optional(),
  To: z.string().optional(),
  Cc: z.string().optional(),
  Subject: z.string().optional(),
  TextBody: z.string().optional(),
  HtmlBody: z.string().optional(),
  Attachments: z
    .array(
      z.object({
        Name: z.string(),
        Content: z.string().optional(),
        DownloadUrl: z.string().optional(),
        ContentType: z.string().optional(),
        ContentLength: z.number().optional(),
      }),
    )
    .optional(),
});

export type SampleCreateInput = z.infer<typeof sampleCreateSchema>;
export type SampleUpdateInput = z.infer<typeof sampleUpdateSchema>;
