# Author an Inkrail source

Use the separate `inkrail-sources` repository as the starting point. Each `packages/<id>/` folder contains `manifest.json` and `index.ts`. The example packages have synthetic content and require no external site. Source IDs match `[a-z][a-z0-9.-]{0,79}`. Choose a unique ID and keep it stable. A repository publisher's signing key pins ownership of that ID.

The manifest declares `protocol: 1`, `entry: "index.mjs"`, a three-part numeric version, display name, base URL, language, media type (`NOVEL` or `MANGA`), content rating (`SAFE` or `ADULT`), and capabilities. Filters and settings are declarative text, secret, or select fields. Settings are passed as `context.config`. Secret values are never returned by the management API; submit a replacement or an empty value to clear one.

Export a default object with `metadata` and every declared capability method. Refer to `extensions/sdk.ts` in core for parameter and result types. Dates cross RPC as ISO strings or null. IDs are opaque strings; they need not be numeric. `metadata` must return the requested item ID. `chapters` must return a complete directory with unique chapter IDs. Manga metadata includes pages or the source implements `pages`; page IDs and positions must be unique. A gallery is represented as one book with its page list; multi-chapter manga can flatten stable chapter/page IDs into an ordered page manifest in v1.

`asset` returns `{ base64 }` using the source's own cookies, headers, and transport. Sources needing browser sessions can use the shared source-repository transport helpers. `chapter` returns title, paragraphs, and nullable publication date. `resolve` converts a URL into an ID. `health` is optional; rejected promises prevent activation. Honor `context.signal` during requests. Only `console.error` logging is appropriate; stdout belongs to RPC.

## Publish a repository

1. Build/test the source code on your own computer or CI. Keep the signing key outside Git.
2. Generate a persistent Ed25519 private key (Node's `generateKeyPairSync('ed25519')` or OpenSSL).
3. Set `INKRAIL_SIGNING_KEY` to the private PEM file path and `INKRAIL_RELEASE_BASE_URL` to the HTTPS directory where package artifacts will be uploaded.
4. Run `npm ci`, `npm test`, and `npm run build` in the source repository. It produces `dist/public/index.json` and versioned `.inkrail.json` packages selected by `public-packages.json`, and prints the publisher fingerprint.
5. Publish all artifacts without modifying them. Publish the fingerprint separately where users can verify your identity. Users add the index URL and fingerprint to Inkrail.
6. Increment a source's version, rebuild/sign, and replace the index to issue updates. Users choose **Check for updates** and **Update**. Reuse your signing key. Do not silently overwrite released versions.

For local development use `http://127.0.0.1:4101/` as the release base and `npm run serve`. Development keys belong in ignored `work/`. The core smoke script expects `TEST_REPOSITORY_URL` and `TEST_REPOSITORY_FINGERPRINT`; run `node scripts/smoke-extensions.mjs` after building core. Tests install all listed packages but download only the synthetic examples.
