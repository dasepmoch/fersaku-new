import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fersaku",
    short_name: "Fersaku",
    description: "Sell digital products beautifully in Indonesia.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F7F2",
    theme_color: "#173F2C",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
