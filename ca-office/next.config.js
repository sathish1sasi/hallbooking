/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // Build plain HTML/JS files (in out/) that any cPanel host can serve.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};
