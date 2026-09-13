using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

internal sealed class SetupWizard : Form
{
    readonly bool settingsMode;
    readonly Label dependency = new Label();
    readonly Button install = new Button();
    readonly Button next = new Button();
    readonly NumericUpDown port = new NumericUpDown();
    readonly CheckBox network = new CheckBox();
    readonly CheckBox browser = new CheckBox();
    readonly CheckBox advanced = new CheckBox();
    readonly CheckBox dnsEnabled = new CheckBox();
    readonly TextBox dnsServers = new TextBox();
    readonly Panel dnsPanel = new Panel();
    readonly TextBox password = new TextBox();
    readonly TextBox progress = new TextBox();
    readonly Label heading = new Label();
    readonly Panel configuration = new Panel();
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    string node;
    string savedHost = "127.0.0.1";
    bool busy;
    bool done;
    int step;

    internal SetupWizard(bool settings)
    {
        settingsMode = settings;
        Text = settings ? "Inkrail Open - Settings" : "Inkrail Open - Setup";
        ClientSize = new Size(640, 650); MinimumSize = new Size(656, 689);
        FormBorderStyle = FormBorderStyle.FixedDialog; MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        Font = new Font("Segoe UI", 10);
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        heading.SetBounds(24, 20, 590, 35); heading.Font = new Font(Font.FontFamily, 17, FontStyle.Bold);
        Controls.Add(heading);
        dependency.SetBounds(24, 70, 590, 72); Controls.Add(dependency);
        install.Text = "Install Node.js LTS"; install.SetBounds(24, 146, 210, 36);
        install.Click += delegate { InstallNode(); }; Controls.Add(install);
        configuration.SetBounds(24, 145, 590, 425); Controls.Add(configuration);
        var portLabel = new Label { Text = "Web port", Left = 0, Top = 8, Width = 150 };
        port.SetBounds(185, 4, 140, 30); port.Minimum = 1; port.Maximum = 65535; port.Value = 4000;
        network.Text = "Allow access from other devices"; network.SetBounds(0, 48, 540, 28);
        var passwordLabel = new Label { Text = "Login password", Left = 0, Top = 97, Width = 170 };
        password.SetBounds(185, 92, 365, 30); password.UseSystemPasswordChar = true;
        var show = new CheckBox { Text = "Show password", Left = 185, Top = 130, Width = 200 };
        show.CheckedChanged += delegate { password.UseSystemPasswordChar = !show.Checked; };
        browser.Text = "Install browser support for browser-based sources (optional)";
        browser.SetBounds(0, 172, 585, 30);
        advanced.Text = "Advanced settings"; advanced.SetBounds(0, 212, 300, 28);
        dnsPanel.SetBounds(0, 246, 585, 165); dnsPanel.Visible = false;
        dnsEnabled.Text = "Override DNS with DNS-over-HTTPS"; dnsEnabled.SetBounds(0, 0, 550, 28); dnsEnabled.Checked = true;
        var dnsLabel = new Label { Text = "Resolver IP addresses", Left = 0, Top = 40, Width = 180 };
        dnsServers.SetBounds(185, 36, 365, 30); dnsServers.Text = "1.1.1.1,1.0.0.1"; dnsServers.AccessibleName = "DNS-over-HTTPS resolver IP addresses";
        var dnsHelp = new Label { Text = "Default: Cloudflare (1.1.1.1, 1.0.0.1). Custom IPs must support JSON DNS-over-HTTPS. Disable to use system DNS. Applies to Inkrail and source extensions after restart.", Left = 0, Top = 76, Width = 550, Height = 70 };
        dnsEnabled.CheckedChanged += delegate { dnsServers.Enabled = dnsEnabled.Checked; };
        advanced.CheckedChanged += delegate { dnsPanel.Visible = advanced.Checked; };
        dnsPanel.Controls.AddRange(new Control[] { dnsEnabled, dnsLabel, dnsServers, dnsHelp });
        configuration.Controls.Add(advanced); configuration.Controls.Add(dnsPanel);
        configuration.Controls.AddRange(new Control[] { portLabel, port, network, passwordLabel, password, show, browser });
        progress.SetBounds(24, 145, 590, 260); progress.Multiline = true; progress.ReadOnly = true;
        progress.ScrollBars = ScrollBars.Vertical; progress.Visible = false; progress.AccessibleName = "Installation progress"; Controls.Add(progress);
        next.SetBounds(414, 592, 200, 36); next.Click += delegate { Advance(); }; Controls.Add(next);
        var cancel = new Button { Text = "Cancel", Left = 24, Top = 592, Width = 110, Height = 36 };
        cancel.Click += delegate { if (!busy) Close(); }; Controls.Add(cancel);
        FormClosing += delegate(object sender, FormClosingEventArgs e) { if (busy) e.Cancel = true; };
        Shown += delegate { RefreshDependencies(); };
    }

    internal static string Execute(string file, string args, string input, Action<string> log)
    {
        var info = new ProcessStartInfo(file, args) { WorkingDirectory = Program.Root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, RedirectStandardInput = input != null };
        using (var process = new Process { StartInfo = info }) {
            var output = new System.Text.StringBuilder();
            var errors = new System.Text.StringBuilder();
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) { lock (output) output.AppendLine(e.Data); if (log != null) log(e.Data); } };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) { lock (errors) errors.AppendLine(e.Data); if (log != null) log(e.Data); } };
            process.Start(); process.BeginOutputReadLine(); process.BeginErrorReadLine();
            if (input != null) { process.StandardInput.Write(input); process.StandardInput.Close(); }
            process.WaitForExit();
            if (process.ExitCode != 0) throw new InvalidOperationException("Command failed (" + process.ExitCode + "). " + errors.ToString());
            return output.ToString();
        }
    }

    internal static string FindNode()
    {
        var candidates = new List<string>();
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(';')) {
            try { candidates.Add(Path.Combine(dir.Trim('"'), "node.exe")); } catch (ArgumentException) {}
        }
        string saved = Path.Combine(Program.Root, "data", "launcher", "node-path.txt");
        if (File.Exists(saved)) candidates.Add(File.ReadAllText(saved).Trim());
        candidates.Add(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "nodejs", "node.exe"));
        foreach (string candidate in candidates) {
            if (!File.Exists(candidate)) continue;
            try {
                string version = Execute(candidate, "--version", null, null).Trim().TrimStart('v');
                int major;
                if (Int32.TryParse(version.Split('.')[0], out major) && major >= 24 && File.Exists(Path.Combine(Path.GetDirectoryName(candidate), "node_modules", "npm", "bin", "npm-cli.js"))) return Path.GetFullPath(candidate);
            } catch (Exception) {}
        }
        return null;
    }

    void RefreshDependencies()
    {
        node = FindNode();
        heading.Text = settingsMode ? "Settings" : "Welcome to Inkrail Open";
        configuration.Visible = false; install.Visible = node == null;
        dependency.Text = node == null ? "Node.js 24+ with npm is required. Install it below, or install it manually and reopen this window. Windows may ask for administrator approval." : "Node.js " + Execute(node, "--version", null, null).Trim() + " and npm are ready. No installation needed.";
        next.Enabled = node != null; next.Text = settingsMode ? "Save and restart" : "Next";
        if (node != null) {
            try {
                var values = json.Deserialize<Dictionary<string, string>>(Execute(node, "scripts/launcher/configure.mjs read", null, null));
                int p; if (Int32.TryParse(values["port"], out p) && p > 0 && p <= 65535) port.Value = p;
                savedHost = values["host"]; network.Checked = savedHost == "0.0.0.0" || savedHost == "::";
                password.Text = values["password"];
                dnsEnabled.Checked = values["dnsEnabled"] != "false"; dnsServers.Text = values["dnsServers"];
                if (password.Text.Length == 0) { var bytes = new byte[16]; using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(bytes); password.Text = BitConverter.ToString(bytes).Replace("-", "").ToLowerInvariant(); }
                if (settingsMode) { configuration.Visible = true; step = 1; }
            } catch (Exception e) { MessageBox.Show(e.Message, Text); next.Enabled = false; }
        }
    }

    void WriteProgress(string line)
    {
        if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)delegate { progress.AppendText(line + Environment.NewLine); });
    }

    void RunWork(Action work, Action success)
    {
        busy = true; next.Enabled = false; install.Visible = false; configuration.Visible = false; progress.Visible = true;
        ThreadPool.QueueUserWorkItem(delegate {
            try { work(); BeginInvoke((Action)delegate { busy = false; success(); }); }
            catch (Exception e) { BeginInvoke((Action)delegate { busy = false; next.Enabled = true; next.Text = "Retry"; MessageBox.Show(e.Message + (node == null ? "\nInstall Node.js 24+ with npm from nodejs.org if Windows Package Manager is unavailable." : ""), Text, MessageBoxButtons.OK, MessageBoxIcon.Error); progress.Visible = false; if (node == null) { install.Visible = true; next.Enabled = false; } else configuration.Visible = true; }); }
        });
    }

    void InstallNode()
    {
        heading.Text = "Installing Node.js";
        dependency.Text = "Downloading Node.js LTS using Windows Package Manager. Keep this window open.";
        RunWork(delegate { Execute("winget.exe", "install --id OpenJS.NodeJS.LTS --exact --source winget --accept-source-agreements --accept-package-agreements", null, WriteProgress); }, delegate {
            progress.Visible = false; RefreshDependencies();
            if (node == null) MessageBox.Show("Node.js was not found with npm. Install Node.js 24+ with npm from nodejs.org, then reopen setup.", Text);
        });
    }

    void Advance()
    {
        if (done) { DialogResult = DialogResult.OK; Close(); return; }
        if (step == 0) {
            step = 1; heading.Text = "First configuration";
            dependency.Text = "Choose your port and login password. Existing library data and other settings are preserved. Keep the generated password or enter your own (at least 8 characters).";
            configuration.Visible = true; next.Text = "Install and start"; return;
        }
        if (password.Text.Length < 8 || password.Text.IndexOfAny(new char[] { '\r', '\n', '"', '\'', '`', '\0' }) >= 0) { MessageBox.Show("Use at least 8 password characters, without quotes, backticks or line breaks.", Text); return; }
        string selectedHost = network.Checked ? (savedHost == "::" ? "::" : "0.0.0.0") : (savedHost == "::1" || savedHost == "localhost" ? savedHost : "127.0.0.1");
        string payload = json.Serialize(new Dictionary<string, string> { { "port", port.Value.ToString() }, { "host", selectedHost }, { "password", password.Text }, { "dnsEnabled", dnsEnabled.Checked ? "true" : "false" }, { "dnsServers", dnsServers.Text } });
        bool installBrowser = browser.Checked;
        heading.Text = settingsMode ? "Applying settings" : "Preparing Inkrail Open";
        dependency.Text = "Please keep this window open. Initial download and build can take several minutes.";
        RunWork(delegate {
            Execute(node, "scripts/launcher/configure.mjs save", payload, null);
            if (!settingsMode) {
                string npm = Path.Combine(Path.GetDirectoryName(node), "node_modules", "npm", "bin", "npm-cli.js");
                Execute(node, "scripts/launcher/prepare.mjs \"" + npm + "\"", null, WriteProgress);
            }
            if (installBrowser) Execute(node, "node_modules/playwright/cli.js install chromium", null, WriteProgress);
            Directory.CreateDirectory(Path.Combine(Program.Root, "data", "launcher"));
            File.WriteAllText(Path.Combine(Program.Root, "data", "launcher", "node-path.txt"), node);
            if (!settingsMode) File.WriteAllText(Path.Combine(Program.Root, "data", "launcher", "setup.complete"), "1");
        }, delegate {
            done = true; heading.Text = "Ready"; dependency.Text = settingsMode ? "Settings saved. Continue to restart Inkrail Open." : "Setup is complete. Use your chosen password to sign in. Inkrail Open will run in the system tray.";
            next.Text = settingsMode ? "Restart Inkrail Open" : "Start Inkrail Open"; next.Enabled = true;
        });
    }
}
