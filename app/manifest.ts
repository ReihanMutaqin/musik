import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RIFF//LAB — Browser Rhythm Game",
    short_name: "RIFF//LAB",
    description: "Mainkan paket chart .sng dan .zip langsung di browser.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0a0e",
    theme_color: "#d6ff3f",
    lang: "id",
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }],
  };
}
