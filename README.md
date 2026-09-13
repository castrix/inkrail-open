# Inkrail

[Inkrail Open application](https://github.com/castrix/inkrail-open) · [Installable source packages](https://github.com/castrix/inkrail-sources)

A self-hosted novel and manga library, reader, and optional translation workspace. Nuxt 3, TypeScript, Prisma, SQLite, Node.js 24 or newer.

Inkrail starts with an empty library and no installed sources. Website integrations are separate packages installed at runtime from repositories you choose. Android/Tachiyomi APK extensions are not compatible with this protocol.

## Quick start

**Windows release:** double-click **InkrailOpen.exe** for the first-run setup wizard. Existing Node.js 24+ with npm is accepted without an installation prompt; missing Node.js can be installed from the wizard. Choose your initial settings and let setup prepare the app. Later launches go directly to the tray; **Settings > Preferences** provides graphical configuration. For source-only checkouts, run **Launch.cmd** once to build the EXE. See the [minimal launcher guide](docs/launcher.md).

For a terminal-based setup:

```sh
npm ci
npm run setup
npm run build
npm start
```

Open http://127.0.0.1:4000 and sign in using `OWNER_PASSWORD` from the generated private `.env`. Setup generates a random password and session secret and initializes an empty database. It is safe to run again. Set another `PORT` in `.env` if 4000 is occupied. For development, use `npm run dev -- --port 4000` after setup.

Keep the full checkout and production dependencies when running: the source runner and background workers use `extensions/`, `workers/`, and `node_modules/` alongside `.output/`. Do not deploy `.output/` alone. Windows and Linux CI checks are included; Windows is the locally verified platform.

## Install sources

Use the [public extension import guide](https://github.com/castrix/inkrail-sources/blob/main/docs/importing.md) for MangaDex and TWKAN. In **Extensions > Add repository**, choose **Use public repository** to fill the URL and fingerprint, or enter them manually:

- **Repository index URL:** `https://raw.githubusercontent.com/castrix/inkrail-sources/main/repository/index.json`
- **Publisher SHA-256 fingerprint:** `cfc683ef1fc8e8504bbdb899ba839116eb6deb120b7aa07e18ca91bf1f624436`

Confirm that you trust the publisher, select **Add repository**, then **Install** on a source and **Browse** under Installed. Paste the index URL above, not the GitHub homepage or a website URL. No rebuild or restart is needed.

Open **Extensions**, enter a signed repository index URL and the publisher's SHA-256 key fingerprint, and choose whether to trust that publisher. Then install a source. Browse and search discover installed sources immediately; no app rebuild or restart is required. Update checks are manual. Disable, restart, configure, rollback, and uninstall are available there too.

Repositories may live on static HTTPS hosting, raw GitHub files, or release assets. HTTP is allowed only for localhost development. The public `inkrail-sources` repository includes MangaDex, TWKAN, and two explicitly labeled synthetic examples. It is installed manually using the index above; no publisher is trusted automatically.

**Extensions execute trusted third-party code on your server.** Signatures pin the publisher and detect modified packages; they do not sandbox code. Processes isolate crashes and receive only source-specific configuration, but retain the host user's filesystem privileges. Run the whole app under a dedicated OS account or a suitably restricted container when appropriate. Do not expose an unauthenticated extension installer.

Downloads and reading progress remain available after disabling or removing a source. Download jobs pause when their source is missing and resume on reinstallation/enabling. Uninstall retains source configuration/cache and previous package files locally so user data is never implicitly deleted.

## Optional features

Translation and character tools require a separately installed and authenticated Codex CLI. Basic browsing, downloading, and reading do not. Enable translation workers with `INKRAIL_ENABLE_TRANSLATION=true`; choose the language and model in `.env`. Unavailable translation/character actions are disabled in the UI and rejected by the API. The dictionary still scans only chapters needed for requested translations. New schedules use the browser’s timezone. Change the IANA timezone and daily time in **Schedules**; existing schedules retain their saved timezone (Asia/Jakarta for older entries). Missing daylight-saving times run at the next valid minute. Schedules only queue translation when translation is enabled.

App discovery and Tailscale helpers are optional host integrations. Browser-based sources may need Playwright Chromium:

```sh
npx playwright install chromium
```

Source API keys belong in that extension's settings, not the shared app environment. Browser profiles and caches are private runtime data. A browser challenge can still require manual verification on the host; the protocol cannot guarantee site availability.

## Development

```sh
npm run typecheck
npm test
npm run build
npm run check:public
```

See [extension authoring](docs/extensions.md), [architecture](docs/architecture.md), and [release notes](docs/release.md). `extensions/sdk.ts` describes protocol v1; runtime input schemas live in `extensions/runtime.mjs`. Source parser tests live in the source repository. Integration smoke tests use only synthetic content in an isolated `work/` database.

## Private data and licensing

`data/`, `.env`, `work/`, databases, downloaded content, backups, logs, dependency folders, build outputs, and signing keys are ignored. Never publish those folders or an old installation's Git history. This repository contains no imported library or old history. MIT applies to original Inkrail code; third-party packages retain their own licenses. See [THIRD_PARTY.md](THIRD_PARTY.md).

## DNS override

Cloudflare DNS-over-HTTPS is enabled by default for source requests. Set `SCRAPER_DNS_ENABLED=false` to use system DNS, or set `SCRAPER_DNS_SERVERS=1.1.1.1,1.0.0.1` to choose comma-separated resolver IPs. Custom resolvers must support HTTPS `/dns-query` with the Cloudflare-compatible JSON API and a valid certificate for their IP address. Ordinary UDP DNS servers are not supported by this setting.

Inkrail Open exposes these options under **Advanced settings** in first-run setup and the tray **Settings** window. Save and restart to apply changes; source extensions inherit these settings. Core repository downloads also use the override. No Windows or router DNS settings are changed. HTTPS remains encrypted end to end; resolver failures are reported without silently falling back to system DNS. The resolver currently requires IPv4 answers (A records).

### Optional manga chapters

Source metadata may include `mangaChapters`: an ordered array of `{ sourceChapterId, titleOriginal, position, sourcePageIds }`. Chapter page IDs reference the existing `pages` list, with no duplicates or missing pages. Sources without this field keep the page-based reader. MangaDex 1.1.0 exposes this directory on its source book page for chapter reading, previous/next navigation, and individual chapter downloads. Existing library readers and saved page IDs remain supported without a database migration.
