import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets you open the dev site from this PC's network address or from another device on the same Wi-Fi.
  allowedDevOrigins: ["localhost", "127.0.0.1", "192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
};

export default nextConfig;
