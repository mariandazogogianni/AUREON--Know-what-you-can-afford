# AUREON

**Know what you can afford.** A transparent purchase-affordability calculator
that shows the real cost of a purchase — including the interest you'd pay on a
revolving balance and the cash-flow gap it creates — before you commit.

## Quick start

```bash
npm ci          # install dependencies from the lockfile
npm run dev     # http://localhost:3000
```

## Available scripts

| Script                | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `npm run dev`         | Start the dev server                                       |
| `npm run build`       | Production build                                           |
| `npm run start`       | Serve the production build                                 |
| `npm run typecheck`   | `tsc --noEmit`                                             |
| `npm test`            | Run the unit tests (Vitest)                                |
| `npm run lint`        | Lint with Next.js/ESLint                                   |

## Toolchain notes

The repository ships its own Node/npm under `.tools/` because no global Node is
installed on the development machine. When invoking the tools manually, prepend
it to `PATH` — **esbuild's postinstall runs `node install.js` by name**, so a
missing `PATH` entry fails the whole install with
`'node' is not recognized as an internal or external command`.

```powershell
$env:PATH = "D:\AUREON-Finance\.tools\node;$env:PATH"
npm run build
```

### The project lives on an exFAT volume

`D:` is a **removable exFAT USB drive**, and exFAT has no support for symbolic
links or NTFS reparse points. libuv consequently reports the wrong errno:

```js
fs.readlinkSync("<any regular file>") // -> EISDIR   (exFAT)
fs.readlinkSync("<any regular file>") // -> EINVAL   (NTFS/ext4/APFS)
```

Every build tool relies on the second behaviour: enhanced-resolve, webpack and
graceful-fs all treat `EINVAL` as "not a symlink, carry on". The bogus `EISDIR`
escaped as a fatal `Failed to compile.` / `Build failed because of webpack
errors` — even though the source, the dependency tree, the types and the tests
were all perfectly healthy.

Three measures handle this, in order of importance:

1. **`tools/fs-exfat-shim.cjs`** — restores the POSIX contract. If `lstat`
   (which *does* work on exFAT) proves a path is not a symlink, the error is
   rewritten to `EINVAL`. Real symlinks are passed through untouched, so the
   shim is inert on a healthy filesystem.
2. **`tools/run-with-fs-shim.mjs`** — preloads that shim and forwards it to
   every worker process Next.js spawns. It exists because
   `NODE_OPTIONS="--require ./shim.cjs" next build` is not portable: it is a
   POSIX shell construct, whereas `cmd.exe` needs `set VAR=… && …`.
3. **`next.config.mjs`** — sets `resolve.symlinks = false` and `cache = false`,
   removing two more webpack paths that depend on filesystem features exFAT
   does not provide.

Set `AUREON_DISABLE_FS_SHIM=1` to bypass the shim (e.g. to reproduce the
original failure), or `AUREON_SHIM_VERBOSE=1 node tools/fs-exfat-shim.cjs` to
print a self-check.

> If the project is ever moved to an NTFS drive, none of this is needed — the
> shim and the two webpack flags simply become no-ops.
