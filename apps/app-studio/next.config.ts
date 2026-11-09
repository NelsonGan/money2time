import type { NextConfig } from 'next';

/**
 * Uploads shell out to the `asc` and `gplay` CLIs rather than calling the
 * Apple and Google APIs from this process, so there is nothing here to
 * configure: no Node externals to keep unbundled, and no TLS to relax.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
