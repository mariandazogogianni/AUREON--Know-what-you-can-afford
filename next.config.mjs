/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config) => {
    // This project lives on a removable exFAT volume (a USB drive), which has no
    // support for symbolic links / NTFS reparse points. On such a filesystem
    // Node's `fs.readlinkSync()` fails with `EISDIR` even for an ordinary regular
    // file (on NTFS the same call correctly throws `EINVAL`). Webpack's resolver
    // probes module paths with `readlink` whenever `resolve.symlinks` is enabled,
    // so the production build aborted with:
    //
    //   Error: EISDIR: illegal operation on a directory,
    //   readlink '...\node_modules\next\dist\pages\_app.js'
    //
    // Nothing in the dependency tree is actually broken (`npm ci`, `tsc
    // --noEmit` and the unit tests all pass) — the failure is purely the
    // filesystem refusing the symlink probe. Disabling symlink resolution tells
    // webpack to skip that probe entirely, which is safe here because the
    // npm-installed tree contains no symlinks in the first place.
    config.resolve.symlinks = false;

    // Webpack 5's default filesystem cache (PackFileCacheStrategy) snapshots the
    // dependency graph to disk. That relies on filesystem features this exFAT
    // volume does not provide, so the build then dies with
    // "Unable to snapshot dependencies". Turning the cache off trades a slower
    // rebuild for a build that actually completes on this filesystem.
    config.cache = false;

    return config;
  },
};

export default nextConfig;
