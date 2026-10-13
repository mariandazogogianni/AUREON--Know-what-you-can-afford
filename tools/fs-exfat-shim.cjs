/**
 * exFAT compatibility shim for Node's `fs.readlink*`.
 *
 * WHY THIS EXISTS
 * ---------------
 * This project is developed directly on a removable **exFAT** USB volume
 * (`D:`, "Samsung USB"). exFAT has no concept of symbolic links or NTFS
 * reparse points, and libuv therefore reports the wrong errno for them:
 *
 *   fs.readlinkSync("<any regular file>")   -> EISDIR   (wrong!)
 *   fs.realpathSync("<any regular file>")   -> works    (fine)
 *
 * On a normal filesystem (NTFS, APFS, ext4) `readlink` on a path that is not a
 * symlink fails with **EINVAL**, and every build tool relies on that contract:
 * enhanced-resolve's symlink plugin, webpack and graceful-fs all interpret
 * EINVAL as "this is an ordinary file, move on". exFAT's bogus `EISDIR` is not
 * recognised, so the error escapes as a fatal build failure:
 *
 *   Error: EISDIR: illegal operation on a directory,
 *   readlink 'D:\AUREON-Finance\src\app\page.tsx'
 *
 * The fix below restores the contract: if the path is verifiably *not* a
 * symbolic link (checked with `lstat`, which works correctly on exFAT), the
 * shim reports `EINVAL` — exactly what NTFS/POSIX would have reported. Genuine
 * symlinks, if any ever exist, are passed straight through untouched.
 *
 * LOADING
 * -------
 * Enabled automatically by the `dev` / `build` / `start` npm scripts through
 * NODE_OPTIONS=--require. It is inert on healthy filesystems (the shim only
 * reacts to the abnormal errno), so it is safe to leave in place everywhere.
 *
 * Escape hatch: set AUREON_DISABLE_FS_SHIM=1 to bypass it entirely.
 */

if (!process.env.AUREON_DISABLE_FS_SHIM) {
  const fs = require("fs");
  const path = require("path");

  /** Convert an fs-style error's errno in place so callers see POSIX semantics. */
  function normaliseError(err, path) {
    if (!err || err.code !== "EISDIR") return err;
    // `lstat` is reliable on exFAT, so use it as the source of truth.
    let isSymlink = false;
    try {
      isSymlink = fs.__aureon_lstatSync(path).isSymbolicLink();
    } catch {
      // Path is gone / unreadable: preserve the original error.
      return err;
    }
    if (isSymlink) return err; // real symlink -> leave the original error alone

    err.code = "EINVAL";
    err.errno = -4071; // UV_EINVAL
    return err;
  }

  // Keep a private, unpatched lstat so the shim cannot recurse.
  const realLstatSync = fs.lstatSync;
  fs.__aureon_lstatSync = realLstatSync;

  const realReadlinkSync = fs.readlinkSync;
  fs.readlinkSync = function readlinkSync(path, options) {
    try {
      return realReadlinkSync.call(this, path, options);
    } catch (err) {
      throw normaliseError(err, path);
    }
  };

  const realReadlink = fs.readlink;
  fs.readlink = function readlink(path, options, callback) {
    // Support the (path, callback) overload.
    if (typeof options === "function") {
      callback = options;
      options = undefined;
    }
    return realReadlink.call(this, path, options, (err, result) => {
      if (err) {
        try {
          err = normaliseError(err, path);
        } catch (shimErr) {
          return callback(shimErr);
        }
      }
      return callback(err, result);
    });
  };

  if (fs.promises && typeof fs.promises.readlink === "function") {
    const realPromisesReadlink = fs.promises.readlink;
    fs.promises.readlink = function readlink(path, options) {
      return realPromisesReadlink.call(this, path, options).catch((err) => {
        throw normaliseError(err, path);
      });
    };
  }

  // A tiny self-check, printed only when explicitly requested, so the shim can
  // be verified rather than trusted: AUREON_SHIM_VERBOSE=1 node tools/fs-exfat-shim.cjs
  if (process.env.AUREON_SHIM_VERBOSE === "1") {
    const probe = path.join(__dirname, "fs-exfat-shim.cjs");
    const report = (label, fn) => {
      try {
        fn();
        console.log(`[fs-exfat-shim] ${label}: OK`);
      } catch (e) {
        console.log(`[fs-exfat-shim] ${label}: ${e.code}`);
      }
    };
    report("raw readlink     ", () => realReadlinkSync(probe));
    report("shimmed readlink ", () => fs.readlinkSync(probe));
  }
}

module.exports = {};


