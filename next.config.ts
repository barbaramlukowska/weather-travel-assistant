import type { NextConfig } from "next";

// Content-Security-Policy (OWASP web 2025 / security misconfiguration).
// Shipped in Report-Only mode: the browser reports violations to the console
// but blocks nothing. An *enforcing* strict CSP can't use 'self' alone here —
// two kinds of inline script would break: our theme script (app/layout.tsx)
// and the framework's own inline bootstrap/RSC-payload scripts. Enforcing
// would mean either 'unsafe-inline' (defeats the point) or per-request
// nonces, and nonces force dynamic rendering — losing static optimization and
// CDN caching. Deliberate YAGNI deferral for a portfolio app; see docs/SECURITY.md.
const isDev = process.env.NODE_ENV === "development";

const cspReportOnly = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

// These enforce immediately — all upside, nothing in this app breaks.
const securityHeaders = [
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
