import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TLS Admin — That Laundry Shop",
    short_name: "TLS Admin",
    description: "Admin Dashboard & Rider Management System for That Laundry Shop",
    start_url: "/admin",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
