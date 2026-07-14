/** @type {import('next').NextConfig} */

// Upstream RotoWire ceiling/floor projections proxy. Kept server-side via a
// rewrite so the browser calls a same-origin path and isn't subject to CORS.
// Override the upstream with the PROJECTIONS_FEED_UPSTREAM env var.
const PROJECTIONS_FEED_UPSTREAM =
  process.env.PROJECTIONS_FEED_UPSTREAM ??
  'https://rotowire-secrets-ebgmaeh8ecc4huhf.canadaeast-01.azurewebsites.net/api/proxy?feed=NFLceilfloor'

const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/projections-feed',
        destination: PROJECTIONS_FEED_UPSTREAM,
      },
    ]
  },
}

export default nextConfig;
