import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Icon CRM",
    short_name: "Icon CRM",
    description: "Wholesale production tracker — samples to shipments.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1ec",
    theme_color: "#1b1916",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
