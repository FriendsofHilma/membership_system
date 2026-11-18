/** @type {import("next").NextConfig} */
const config = {
  // The local DFRI-eID prototype verifier proxies to Next from these origins.
  allowedDevOrigins: ["localhost:8080", "localhost:8443"],
};

export default config;
