// `next dev` must NOT share the production build's output directory: a dev
// server keeps running and rewriting files in its distDir continuously, so if
// it pointed at the same ".next-build" that `next build` (e.g. the pre-push
// quality gate) writes to, the two processes race for the same files. That
// collision is also what causes root-owned files to reappear in
// ".next-build" after clearing it, when the dev server runs under a
// different user (e.g. a root-owned container) than the build.
const nextConfig = {
  ...(process.env.NODE_ENV === "production"
    ? { distDir: ".next-build" }
    : {}),
  output: "standalone",
  // The repository lives below a desktop-level package-lock.json on some
  // developer machines. Pin tracing to this frontend package so Next.js does
  // not infer the parent directory as the application root.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
