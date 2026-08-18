import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.220.3",
    "localhost",
    "*.trycloudflare.com",
    "*.loca.lt",
    "*.ngrok-free.app",
  ],
};

export default nextConfig;
