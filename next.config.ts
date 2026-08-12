import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (pdfjs) must stay external so Next doesn't bundle its worker.
  serverExternalPackages: ["pdf-parse"],
  experimental: {
    serverActions: {
      // Image uploads and Excel imports arrive through server actions.
      bodySizeLimit: "10mb",
    },
  },
  images: {
    // Sample photos are served from Vercel Blob.
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
};

export default nextConfig;
