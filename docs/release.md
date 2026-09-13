# Inkrail Open releases

The code was copied through an explicit application-code inclusion list. The original library, settings, browser profiles, `.env`, backups, logs, build outputs, and Git history were excluded. Runtime values and source-specific secrets are configured after installation. Default authentication secrets were removed. The personal prefilled import URL was removed.

Website adapters and parser/transport tests are maintained in the independent `inkrail-sources` repository. The public catalog currently contains MangaDex, TWKAN, and two synthetic examples. Core retains small compatibility helpers for old API callers and Tachimanga import mappings, while newly installed sources use generic routes and capability-based source lists.

Push a semantic version tag such as `v0.1.0` to build a GitHub release. The release workflow runs the typecheck and test suite, builds Nuxt for production, compiles `InkrailOpen.exe`, and publishes a Windows ZIP plus its SHA-256 checksum. The ZIP starts from `git archive`, so ignored local data, credentials, dependencies, logs, work files, and Git history cannot enter the package. It then adds only the freshly built launcher and `.output` directory.

The release remains dependent on Node.js 24+ with npm. On first launch, the wizard detects or installs Node.js, installs exact dependencies from `package-lock.json`, initializes the private environment and database, and reuses the included production build.

The included MIT license is the default for original Inkrail code. Review the included notices and any later contributed assets before distributing a release. This is an initial modular release, not a security-audited sandbox. Existing optional AI workflows remain language-specific in parts; the core reader and extension protocol support arbitrary source languages.
