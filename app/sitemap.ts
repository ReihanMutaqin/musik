import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [""].map((path) => ({
    url: `https://reihan.online${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.7,
  }));
}
