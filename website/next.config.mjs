import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Repo has a lockfile at both the root and in website/. Pin the workspace
  // root so Turbopack stops warning and always treats website/ as the app root.
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
