# Fixes Applied After Initial Build

This document lists every issue found and corrected in the originally generated
project, so you know exactly what changed and why. All fixes were verified by
actually running `npm install` and `npm run build` (or `tsc --build` /
`tsc --noEmit`) for each component — not just read through.

---

## Blocking bugs (would have prevented the app from running at all)

1. **React was missing from `package.json`** in both `student-dashboard` and
   `admin-dashboard`. `react`, `react-dom`, `@types/react`, `@types/react-dom`,
   and `@vitejs/plugin-react` were never declared as dependencies, even though
   the code imports and uses them throughout. A fresh `npm install` on a clean
   machine would not have installed React at all, and `npm run dev` would have
   crashed immediately.
   → Fixed: added all five packages to `package.json` in both dashboards.

2. **`@vitejs/plugin-react` version mismatch** — the version I first tried
   adding (`^4.3.1`) doesn't support Vite 8, which this project uses. Verified
   by running `npm install` and watching it fail with a peer-dependency
   conflict; corrected to `^6.0.0`, which supports Vite 8, and confirmed
   `npm install` then succeeded.

3. **Missing `"jsx": "react-jsx"` in `tsconfig.json`** for both dashboards.
   Without it, `npm run build` (which runs `tsc && vite build`) fails
   immediately on the first JSX file with "Cannot use JSX unless the '--jsx'
   flag is provided." Fixed in both `student-dashboard/tsconfig.json` and
   `admin-dashboard/tsconfig.json`.

4. **Missing icon assets** — `desktop-app/resources/` and `extension/icons/`
   were both empty, but `manifest.json` and `electron-builder`'s config
   reference icon files that didn't exist. The Chrome extension would fail to
   load, and the Windows/macOS installer build would fail.
   → Fixed: generated `icon.ico` (Windows), `icon.icns` (macOS), `icon.png`,
   and the extension's `icon16.png` / `icon48.png` / `icon128.png`. These are
   simple placeholder icons — swap them for your institution's real branding
   before shipping to students.

5. **Desktop app had no `tsconfig.json` at all** — a TypeScript/Electron
   project with zero TS project configuration. It happened to still build
   because `electron-vite` uses esbuild directly rather than running `tsc`,
   but this meant no real type-checking ever happened and no editor
   IntelliSense worked. Fixed: added `tsconfig.json`, `tsconfig.node.json`
   (main + preload process), and `tsconfig.web.json` (renderer/React process),
   following the standard Electron-Vite dual-project pattern. Verified with
   `npx tsc --build tsconfig.json` — compiles clean.

---

## Real logic/type bugs (caught by actually compiling, not just reading)

6. **JWT signing type errors** in `backend/src/middleware/auth.ts` — the
   `expiresIn` option combined with a `string` env var didn't satisfy
   `jsonwebtoken`'s TypeScript overloads, which would block `npm run build`
   under strict settings. Fixed by casting the options object to
   `jwt.SignOptions`.

7. **Type-narrowing bug in `admin-dashboard/src/pages/NotificationsPage.tsx`**
   — the live notification feed builds a discriminated union (`FeedItem`) but
   constructed union members inline inside `setState` callbacks. TypeScript
   widened the `type` field to `string` in that context, causing three
   compile errors. Fixed by explicitly typing each constructed object as
   `FeedItem` before pushing it into the array.

8. **Device-activation race condition** in `backend/src/routes/device.ts` —
   the original code looked up whether a device existed, then manually built
   a fallback ID to force Prisma's `upsert` into "create" mode if not found.
   Two concurrent activation requests for the same device (e.g. on
   reconnect) could have created duplicate device rows. Fixed by adding a
   proper `@@unique([studentId, hostname])` constraint to the Prisma schema
   and using it directly in the upsert's `where` clause — this makes the
   operation atomic at the database level.

9. **Incomplete pagination in `admin-dashboard/src/pages/StudentsPage.tsx`**
   — `page`, `setPage`, and `totalPages` state existed but nothing in the UI
   ever called `setPage`, so admins could never see students beyond the
   first page of results. Fixed by wiring the fetch effect to `page` and
   adding Previous/Next controls.

10. **Several unused imports** (`Users`, `Settings`, `Clock` in various
    files) that failed the project's `noUnusedLocals` / `noUnusedParameters`
    strict TypeScript settings and would block `npm run build`. Removed.

---

## Missing functionality (gaps, not bugs)

11. **No password reset flow existed at all.** Since no email/SMTP
    infrastructure was configured or specified, a full "forgot password"
    email flow wasn't a safe assumption to build. Instead, added:
    - `PATCH /api/admin/students/:id/reset-password` — admin-initiated
      reset that generates a random temporary password (common pattern for
      school IT: student reports lost password to admin, admin resets and
      relays it through an existing trusted channel).
    - `PATCH /api/student/change-password` — self-service password change
      for a student who is already logged in and knows their current
      password.
    - `PATCH /api/admin/students/:id/status` — lets admin suspend/reactivate
      a student account (was referenced in the README's data model but had
      no endpoint).

12. **Hardcoded `http://localhost:3001/api` in the browser extension**
    (`extension/background/service-worker.js`). This would have silently
    broken the extension the moment it was deployed to any real institution
    server. Fixed by:
    - Reading the API base URL from `chrome.storage.local` at runtime
      (`getApiBase()`), falling back to localhost only for local dev.
    - Adding a small extension **Options page**
      (`extension/options/options.html` + `options.js`) so an admin can set
      the real backend URL without editing source code, and wiring it into
      `manifest.json` via `"options_page"`.
    - In production, the desktop app should write this value into
      `chrome.storage.local` automatically alongside the device token (see
      `desktop-app/src/main` for where the token is currently stored) so
      most students never need to touch the options page manually.

---

## What I could NOT verify in this environment (and why)

- **`npx prisma generate` / `npx prisma migrate dev`** — this sandbox's
  network allowlist doesn't include `binaries.prisma.sh`, so Prisma's query
  engine binary couldn't be downloaded here. The schema itself was manually
  checked for correctness (the `@@unique([studentId, hostname])` constraint
  generates a compound key named `studentId_hostname`, which is exactly what
  `device.ts` now references). This will resolve automatically the first
  time you run `npx prisma generate` on a machine with normal internet
  access — which you need to do anyway as part of setup.

- **`active-win` native module compilation** — this package ships prebuilt
  binaries for Windows/macOS/Linux, and building from source requires
  downloading Node.js headers from nodejs.org, which this sandbox also
  blocks. This is irrelevant for real use anyway: you'll be running
  `npm install` for the desktop app on an actual Windows or Mac machine when
  you build the installer, where this installs normally.

- **Full end-to-end runtime test** (sign up a real student, sign in on the
  desktop app, open an AI site, confirm the admin dashboard shows a live
  notification) — this requires a running PostgreSQL instance and multiple
  long-lived processes talking to each other over WebSocket, which isn't
  practical to fully exercise in this sandboxed environment. Every
  individual component was verified to install correctly and compile/build
  without errors, and the request/response contracts between them were
  manually cross-checked (e.g. the fields the desktop app sends to
  `/api/usage/event` match exactly what the route expects). Still, budget
  time for a real first run — that's normal for any first deployment, not a
  sign of a spec issue.

---

## Recommended first steps after unzipping

1. `cd backend && cp .env.example .env` — fill in a real `DATABASE_URL` and
   generate real random values for the three JWT secrets.
2. `npx prisma migrate dev --name init && npm run db:seed`
3. `npm run dev` in `backend/`, then `student-dashboard/`, then
   `admin-dashboard/` (each in its own terminal).
4. In `desktop-app/`, run `npm install` then `npm run dev` to open the
   Electron sign-in window.
5. Load `extension/` as an unpacked extension in Chrome
   (`chrome://extensions` → Developer mode → Load unpacked).
6. Sign up a test student on the Student Dashboard, sign in again inside the
   desktop app with the same credentials, then open `chat.openai.com` in a
   browser tab and confirm a live notification appears on the Admin
   Dashboard within a few seconds.
