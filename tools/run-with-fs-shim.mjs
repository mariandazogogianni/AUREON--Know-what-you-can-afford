/**
 * Portable launcher for the Next.js CLI that preloads the exFAT `readlink`
 * compatibility shim.
 *
 * WHY A LAUNCHER?
 * ---------------
 * The canonical way to preload a module is
 *
 *   NODE_OPTIONS="--require ./shim.cjs" next build
 *
 * but that inline syntax is not portable: `VAR=value cmd` is a POSIX shell
 * construct, while Windows `cmd.exe` needs `set VAR=value && cmd`. Putting the
 * env var in package.json would therefore only work on one of the two
 * platforms. Spawning the CLI from Node keeps it working everywhere, and also
 * guarantees the shim is inherited by every worker process Next.js starts.
 *
 * See ./fs-exfat-shim.cjs for why the shim is needed at all (this project lives
 * on a removable exFAT volume, where Node reports `EISDIR` instead of `EINVAL`
 * for `fs.readlink` on ordinary files, which aborts the webpack build).
 *
 * Usage: node ./tools/run-with-fs-shim.mjs next build
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Forward slashes are mandatory: Node strips backslashes while parsing
// NODE_OPTIONS, which would corrupt a Windows path such as
// D:\proj\tools\x.cjs into "D:projtoolsx.cjs".
const shim = path.join(here, "fs-exfat-shim.cjs").replace(/\\/g, "/");

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error(
    "usage: node tools/run-with-fs-shim.mjs <command> [args...]\n" +
      'example: node tools/run-with-fs-shim.mjs next build'
  );
  process.exit(1);
}

// --require takes a single value, so quote the path in case of spaces.
const requireShim = `--require "${shim}"`;
const nodeOptions = process.env.NODE_OPTIONS?.trim();
const mergedOptions = nodeOptions ? `${nodeOptions} ${requireShim}` : requireShim;

// Run through the platform-appropriate shell so that CLI shims in
// node_modules/.bin (next, next.cmd) resolve exactly as `npm run` would.
const isWindows = process.platform === "win32";
const file = isWindows ? process.env.comspec || "cmd.exe" : command;
const spawnArgs = isWindows ? ["/d", "/s", "/c", command, ...args] : args;

const child = spawn(file, spawnArgs, {
  stdio: "inherit",
  // Forward NODE_OPTIONS to this child *and* everything it spawns.
  env: { ...process.env, NODE_OPTIONS: mergedOptions },
});

// Relay common termination signals so Ctrl+C reaches the child cleanly.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.on("error", (err) => {
  console.error(`[run-with-fs-shim] failed to start "${command}":`, err.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (typeof code === "number") {
    process.exit(code);
  }
  console.error(`[run-with-fs-shim] "${command}" terminated by ${signal}`);
  process.exit(1);
});
