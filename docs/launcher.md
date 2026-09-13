# Inkrail Open: Windows setup

1. Extract the full release ZIP into a writable folder.
2. Double-click **InkrailOpen.exe** in that folder.
3. Follow the first-run wizard: check dependencies, choose your web port and login password, then select **Install and start**.
4. When preparation finishes, select **Start Inkrail Open**. Double-click the tray icon to open the app and sign in with your chosen password.

**Node.js already installed?** A compatible Node.js 24+ installation with npm is detected automatically. There is no installation prompt. If missing or incomplete, the wizard offers **Install Node.js LTS** through Windows Package Manager. Windows may request administrator approval. If `winget` is unavailable, install Node.js 24+ with npm manually and reopen the wizard. Node.js must remain installed; it is not bundled with the launcher.

The release includes the production build. The wizard creates a private `.env`, generates the session secret, initializes an empty database and installs application dependencies. It reuses `.output/server/index.mjs` when present and builds only when that entry point is missing. Internet is needed for initial dependency downloads. Existing configuration and library data are preserved. Browser support is optional and can be installed during setup or afterward.

The launcher uses Windows .NET Framework 4.x, normally available on Windows 10/11. Git, Python, Docker and the .NET SDK are not required. Keep the **whole extracted folder**: the EXE is the entry point, not a bundle containing Node.js and the application.

## Daily use

Double-click **InkrailOpen.exe**. Completed installations go directly to the system tray. Launching again opens the browser. If the icon is hidden, check the **up arrow** beside the clock. Closing the browser leaves the server running; tray **Quit** stops the server and its child processes.

From the tray, choose **Settings > Preferences** to change the port, network access or login password, and optionally install browser support. Save and restart applies the changes. **Edit configuration (.env)** remains available for advanced settings. **Open logs** shows runtime errors.

The default port is **4000**; the existing developer installation uses **4001**. Keep network access off for local use. If another app uses your chosen port, choose a different port—the launcher never stops another app to claim it.

Sources are installed separately through **Extensions** with a publisher's repository URL and fingerprint. No public catalog is preconfigured. Codex CLI is optional and only needed for translation/character features.

## Updates and source checkouts

Quit before replacing application files, including `.output`, from a new release. Preserve `.env` and `data/`, then run `InkrailOpen.exe --setup` to prepare updated dependencies. The included build is reused. Source developers must run `npm run build` explicitly after code changes. Keep `node_modules`, `extensions`, `workers` and `.output` alongside the launcher. Nothing is added to Windows Startup automatically.

The release ZIP includes the compiled EXE. In a source-only Git checkout, run **Launch.cmd** once to compile the launcher using the Windows framework compiler, then use **InkrailOpen.exe**. Maintainers can also run `powershell -File scripts/launcher/build.ps1`.

Configuration, databases, downloaded content, logs and installed application dependencies are excluded from the public release. The release includes public source files, the launcher EXE and the production `.output` build with its bundled server dependencies.
