import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // For Vercel deployment, static export works with ISR
  // Dev server runs on port 3000, API routes served natively
  // Allow all hosts for Replit proxy
  allowedDevOrigins: ["localhost", "*.replit.dev"],
};

export default nextConfig;
