import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Docker image builds a self-contained server (NEXT_OUTPUT=standalone); Vercel and
  // `next start` use the default output.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Terrain chunks are requested with ?v=<bake version>, so they can be cached hard.
        source: "/chunks/:file*.bin",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
