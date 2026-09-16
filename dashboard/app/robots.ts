import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://attendance.nextgenapplication.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/about",
          "/capabilities",
          "/services",
          "/join",
          "/login",
          "/forgot-password",
          "/reset-password",
          "/favicon.png",
          "/images/",
        ],
        disallow: [
          "/dashboard",
          "/employees",
          "/attendance",
          "/leaves",
          "/leave-requests",
          "/holidays",
          "/salary",
          "/tasks",
          "/chat",
          "/settings",
          "/plans",
          "/admin/",
          "/super-admin/",
          "/api/",
          "/sso/",
        ],
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "Google-Extended"],
        allow: [
          "/",
          "/about",
          "/capabilities",
          "/services",
          "/join",
          "/llms.txt",
        ],
        disallow: [
          "/admin/",
          "/super-admin/",
          "/api/",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}
