import type { NextConfig } from "next";
// @ts-expect-error next-pwa does not publish types compatible with Next 16.
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  output: 'export',
  typescript: {
    ignoreBuildErrors: true,
  }
};

export default withPWA(nextConfig);
