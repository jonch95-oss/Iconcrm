// Shared picklists used by the template, the New Sample form, and the table.
// Keep this module free of server-only deps so client components can import it.

export const SAMPLE_CATEGORIES = [
  "Handbag",
  "Cooler",
  "Duffel",
  "Rolling Duffle",
  "Cosmetic Bag",
  "Toiletry Bag",
  "Wallet",
  "Belt",
  "Luggage",
  "Backpack",
  "Neck Pillow",
  "Packing Cube",
] as const;

export const SAMPLE_BRANDS = [
  "Ted Baker",
  "Champion",
  "Off White",
  "Off White L/AB",
  "Palm Angels",
  "Palm Angels PLAY",
  "Pink London",
] as const;
