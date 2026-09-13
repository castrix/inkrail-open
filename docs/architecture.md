# Runtime source architecture

The Nuxt server owns the ExtensionManager, library database, authentication, scheduling, and download queue. Core background workers call a worker-token-protected loopback API; they do not load source packages or create duplicate source runners. One runner process is kept per active source package until disabled, updated, restarted, or the application exits. Idle stopping is not enabled in v1.

The runner loads a compiled ESM package and exchanges newline-delimited JSON over stdin/stdout. Logs use stderr. Each request has a unique ID, a 60-second deadline, and cooperative cancellation. An unresponsive runner is terminated with its process tree; another request can restart it. The supported interface is independent of transport, but remote HTTP service/container execution is not implemented in this release.

Sources return remote metadata, chapter content, and image bytes. Core validates metadata and directories, adds local library state, and persists downloads. Asset RPC uses bounded base64 frames (24 MiB source asset limit); it is not zero-copy streaming and is intended for individual pages, not video or huge archives. Core streams the resulting file/response to readers. Local downloaded content can be read without a source. Raw remote IDs are hashed for storage directory names.

Repository indexes are signed with Ed25519 and pinned to a publisher SHA-256 fingerprint. Signed indexes include a hash and compatible manifest for every release. Packages are JSON containers of UTF-8 files, prebuilt by the publisher. Installation never runs npm lifecycle scripts. Paths, file count, size, protocol version, source identity, checksum, signature, and capability handshake are checked before activation.

Updates write into a new version directory, health-check the candidate, drain the old runner, atomically save the registry, and activate the candidate. A rejected candidate leaves the old installation active. Rollback retains one previous version pointer. Ownership remains pinned after uninstall; a different publisher cannot take over an existing source ID. Publisher key rotation/rebinding is intentionally not automated.

Registry mutation is serialized by the server. The persistent registry belongs to exactly one Inkrail server instance; do not run two server instances against the same data directory. Separate app installations must use separate data directories and databases. Source processes receive distinct configuration/state directories; separation is an operational boundary, not a malicious-code sandbox.

Future work can add OS/container isolation, a remote service transport, idle eviction, richer authentication flows, and image streaming without base64. These are not required for installing, updating, or using the v1 packages.
