/**
 * The Samples list filter set, shared by the page (which seeds it from the
 * URL) and the table (which writes it back as you filter). Keeping it in the
 * URL is what makes the list survive a round trip into a sample and back.
 */
export type SampleFilters = {
  q: string;
  status: string;
  factory: string;
  brand: string;
  season: string;
  category: string;
  color: string;
  overdue: boolean;
};

/** sessionStorage key holding the last filter set used in this tab. */
export const SAMPLE_FILTERS_KEY = "samplesFilters";

export const EMPTY_SAMPLE_FILTERS: SampleFilters = {
  q: "",
  status: "",
  factory: "",
  brand: "",
  season: "",
  category: "",
  color: "",
  overdue: false,
};

type Param = string | string[] | undefined;
const one = (v: Param) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();

/** Read filters off the URL (unknown/absent params fall back to "no filter"). */
export function sampleFiltersFromQuery(sp: Record<string, Param>): SampleFilters {
  return {
    q: one(sp.q),
    status: one(sp.status),
    factory: one(sp.factory),
    brand: one(sp.brand),
    season: one(sp.season),
    category: one(sp.category),
    color: one(sp.color),
    overdue: one(sp.overdue) === "1",
  };
}

/** True when nothing is being filtered (used to decide whether to show Clear). */
export function hasActiveFilters(f: SampleFilters): boolean {
  return sampleFiltersToQuery(f) !== "";
}

/** Back to a query string, dropping everything that isn't filtering anything. */
export function sampleFiltersToQuery(f: SampleFilters): string {
  const params = new URLSearchParams();
  if (f.q) params.set("q", f.q);
  if (f.status) params.set("status", f.status);
  if (f.factory) params.set("factory", f.factory);
  if (f.brand) params.set("brand", f.brand);
  if (f.season) params.set("season", f.season);
  if (f.category) params.set("category", f.category);
  if (f.color) params.set("color", f.color);
  if (f.overdue) params.set("overdue", "1");
  return params.toString();
}
