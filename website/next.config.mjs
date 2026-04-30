/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/download",
        permanent: false,
      },
    ]
  },
}

export default nextConfig
