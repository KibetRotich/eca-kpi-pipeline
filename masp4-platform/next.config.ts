import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ECA Events dashboard was slimmed from 11 tabs to 5 — keep old links working.
  async redirects() {
    return [
      ...['geography', 'gender-youth', 'beneficiaries'].map(p => (
        { source: `/eca-events/${p}`, destination: '/eca-events/where-who', permanent: true })),
      ...['curriculum', 'facilitators', 'time-planning'].map(p => (
        { source: `/eca-events/${p}`, destination: '/eca-events/delivery', permanent: true })),
      { source: '/eca-events/projects', destination: '/eca-events', permanent: true },
      { source: '/eca-events/dictionary', destination: '/eca-events/data-quality', permanent: true },
      // MASP III dashboard retired — Thematic Insights replaced its nav tab.
      { source: '/eca-dashboard', destination: '/thematic-insights', permanent: true },
      { source: '/ECA_Dashboard.html', destination: '/thematic-insights', permanent: true },
    ]
  },
};

export default nextConfig;
