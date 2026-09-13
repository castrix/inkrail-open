# Public-copy release

The code was copied through an explicit application-code inclusion list. The original library, settings, browser profiles, `.env`, backups, logs, build outputs, and Git history were excluded. Runtime values and source-specific secrets are configured after installation. Default authentication secrets were removed. The personal prefilled import URL was removed.

The four adapters (TWKAN, nHentai, Hitomi, HentaiNexus) and parser/transport tests are maintained in the independent source repository. Core retains small compatibility helpers for old API callers and Tachimanga import mappings, not website parsers. Generic routes and capability-based source lists are used for newly installed sources.

Choose your public hosting URLs, publisher identity, and persistent signing key before publishing releases. No GitHub repository, remote, deployment, or public extension catalog has been created by this local preparation. The development signing key and local package builds must not be published as a production publisher identity.

The included MIT license is the default for original Inkrail code. Review the included notices and any later contributed assets before distributing a release. This is an initial modular release, not a security-audited sandbox. Existing optional AI workflows remain language-specific in parts; the core reader and extension protocol support arbitrary source languages.
