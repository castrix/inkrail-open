using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using System.Web.Script.Serialization;

internal static class Program
{
    internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar);
    internal static readonly string Prefix = MakePrefix();
    static string MakePrefix() {
        string root = Root.ToUpperInvariant();
        using (var hash = System.Security.Cryptography.SHA256.Create())
            return @"Local\InkrailOpen-" + BitConverter.ToString(hash.ComputeHash(System.Text.Encoding.UTF8.GetBytes(root))).Replace("-", "").Substring(0, 24);
    }
    [STAThread] static void Main(string[] args)
    {
        if (args.Length > 0 && (args[0] == "--quit" || args[0] == "--restart" || args[0] == "--open" || args[0] == "--settings"))
        {
            try { using (var e = EventWaitHandle.OpenExisting(Prefix + args[0])) e.Set(); }
            catch (WaitHandleCannotBeOpenedException) { Environment.ExitCode = 1; }
            return;
        }
        bool created;
        using (var mutex = new Mutex(true, Prefix, out created))
        {
            if (!created) { try { using (var e = EventWaitHandle.OpenExisting(Prefix + "--open")) e.Set(); } catch (WaitHandleCannotBeOpenedException) {} return; }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            try {
                Directory.SetCurrentDirectory(Root);
                string node = SetupWizard.FindNode();
                bool ready = File.Exists(Path.Combine(Root, "data", "launcher", "setup.complete")) && File.Exists(Path.Combine(Root, ".env")) && File.Exists(Path.Combine(Root, ".output", "server", "index.mjs")) && File.Exists(Path.Combine(Root, "node_modules", "@prisma", "client", "package.json"));
                if (!ready || node == null || (args.Length > 0 && args[0] == "--setup")) {
                    using (var wizard = new SetupWizard(false)) if (wizard.ShowDialog() != DialogResult.OK) return;
                } else File.WriteAllText(Path.Combine(Root, "data", "launcher", "node-path.txt"), node);
                using (var app = new Tray()) Application.Run(app);
            }
            catch (Exception e) { MessageBox.Show(e.Message, "Inkrail Open", MessageBoxButtons.OK, MessageBoxIcon.Error); }
            finally { mutex.ReleaseMutex(); }
        }
    }
}

internal sealed class Tray : ApplicationContext
{
    readonly string root = Program.Root;
    readonly object logLock = new object();
    readonly NotifyIcon icon;
    readonly System.Windows.Forms.Timer timer;
    readonly EventWaitHandle quit = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Prefix + "--quit");
    readonly EventWaitHandle restart = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Prefix + "--restart");
    Process server;
    readonly EventWaitHandle open = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Prefix + "--open");
    readonly EventWaitHandle preferences = new EventWaitHandle(false, EventResetMode.AutoReset, Program.Prefix + "--settings");
    int port = 4000;
    string host = "127.0.0.1";
    IntPtr job;
    DateTime nextStart = DateTime.MinValue;
    bool closing;
    const string StatusPrefix = "[inkrail-tray-status] ";
    string pendingStatus;
    string lastSummary;
    DateTime lastStatus = DateTime.MinValue;
    readonly ToolStripMenuItem workspaceStatus = new ToolStripMenuItem("Workspace: starting...");
    readonly ToolStripMenuItem workCounts = new ToolStripMenuItem("Waiting for job status...");
    readonly ToolStripMenuItem queueCounts = new ToolStripMenuItem("Queue: unknown");
    readonly JavaScriptSerializer json = new JavaScriptSerializer();
    public sealed class JobStatus {
        public int active { get; set; } public int translation { get; set; }
        public int dictionary { get; set; } public int downloads { get; set; }
        public int art { get; set; } public int queued { get; set; }
        public int blocked { get; set; } public bool unavailable { get; set; }
    }

    internal Tray()
    {
        Directory.CreateDirectory(Path.Combine(root, "data", "logs"));
        var menu = new ContextMenuStrip();
        workspaceStatus.Enabled = false; workCounts.Enabled = false; queueCounts.Enabled = false;
        menu.Items.Add(workspaceStatus); menu.Items.Add(workCounts); menu.Items.Add(queueCounts);
        menu.Items.Add("Open Workspace", null, delegate { Open("/admin"); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Open Inkrail", null, delegate { Open(); });
        menu.Items.Add("Extensions", null, delegate { Open("/extensions"); });
        var settings = new ToolStripMenuItem("Settings");
        settings.DropDownItems.Add("Preferences...", null, delegate { ShowPreferences(); });
        settings.DropDownItems.Add("Edit configuration (.env)", null, delegate {
            Process.Start(new ProcessStartInfo("notepad.exe", "\"" + Path.Combine(root, ".env") + "\"") { UseShellExecute = true });
        });
        settings.DropDownItems.Add("Apply configuration and restart", null, delegate { Restart(); });
        settings.DropDownItems.Add("Install browser support", null, delegate {
            Process.Start(new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -File \"" + Path.Combine(root, "scripts", "launcher", "browser.ps1") + "\"") { UseShellExecute = true, WorkingDirectory = root });
        });
        menu.Items.Add(settings);
        menu.Items.Add("Open logs", null, delegate { Process.Start(new ProcessStartInfo(Path.Combine(root, "data", "logs")) { UseShellExecute = true }); });
        menu.Items.Add("Restart", null, delegate { Restart(); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, delegate { ExitThread(); });
        icon = new NotifyIcon { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath), Text = "Inkrail Open - starting", ContextMenuStrip = menu, Visible = true };
        icon.DoubleClick += delegate { Open(); };
        timer = new System.Windows.Forms.Timer { Interval = 1000 };
        timer.Tick += delegate {
            if (quit.WaitOne(0)) { ExitThread(); return; }
            if (restart.WaitOne(0)) Restart();
            if (open.WaitOne(0)) Open();
            if (preferences.WaitOne(0)) ShowPreferences();
            if (!closing && (server == null || server.HasExited) && DateTime.UtcNow >= nextStart) Start();
            string update = Interlocked.Exchange(ref pendingStatus, null);
            if (update != null) ApplyStatus(update);
            if (lastStatus != DateTime.MinValue && (DateTime.UtcNow - lastStatus).TotalSeconds > 75) StatusUnavailable();
        };
        timer.Start();
        Log("Tray started.");
        Start();
    }

    void Log(string message)
    {
        if (message == null) return;
        lock (logLock) {
            try { File.AppendAllText(Path.Combine(root, "data", "logs", "tray-" + DateTime.Now.ToString("yyyy-MM-dd") + ".log"), DateTime.Now.ToString("o") + " " + message + Environment.NewLine); }
            catch (IOException) { }
        }
    }

    void Open(string path = "")
    {
        try { Process.Start(new ProcessStartInfo("http://" + (host == "::1" ? "[::1]" : "127.0.0.1") + ":" + port + path) { UseShellExecute = true }); }
        catch (Exception e) { Log("Open failed: " + e.Message); }
    }

    void Start()
    {
        Stop();
        pendingStatus = null; lastStatus = DateTime.UtcNow;
        workspaceStatus.Text = "Workspace: starting...";
        workCounts.Text = "Waiting for job status..."; queueCounts.Text = "Queue: unknown";
        nextStart = DateTime.UtcNow.AddSeconds(15);
        try {
            string node = File.ReadAllText(Path.Combine(root, "data", "launcher", "node-path.txt")).Trim();
            var readConfig = new ProcessStartInfo(node, "scripts/launcher/config.mjs") { WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            using (var reader = Process.Start(readConfig)) {
                string output = reader.StandardOutput.ReadToEnd();
                string error = reader.StandardError.ReadToEnd();
                reader.WaitForExit();
                if (reader.ExitCode != 0) throw new InvalidOperationException(error);
                var config = json.Deserialize<System.Collections.Generic.Dictionary<string, string>>(output);
                port = Int32.Parse(config["port"]); host = config["host"];
            }
            foreach (var endpoint in IPGlobalProperties.GetIPGlobalProperties().GetActiveTcpListeners())
                if (endpoint.Port == port) throw new InvalidOperationException("Port " + port + " is occupied; leaving the existing process untouched.");
            if (!File.Exists(node) || !File.Exists(Path.Combine(root, ".output", "server", "index.mjs")))
                throw new FileNotFoundException("Node or the production build is missing.");
            job = CreateJobObject(IntPtr.Zero, null);
            if (job == IntPtr.Zero) throw new System.ComponentModel.Win32Exception();
            var limits = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            limits.BasicLimitInformation.LimitFlags = 0x2000; // Kill the entire owned process tree when the job closes.
            if (!SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits))) throw new System.ComponentModel.Win32Exception();
            var info = new ProcessStartInfo(node, "--env-file=.env --import ./scripts/launcher/status-feed.mjs .output/server/index.mjs") {
                WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                RedirectStandardOutput = true, RedirectStandardError = true
            };
            info.EnvironmentVariables["PORT"] = port.ToString();
            info.EnvironmentVariables["NITRO_PORT"] = port.ToString();
            info.EnvironmentVariables["HOST"] = host;
            info.EnvironmentVariables["NITRO_HOST"] = host;
            server = new Process { StartInfo = info };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                if (e.Data != null && e.Data.StartsWith(StatusPrefix) && e.Data.Length < 4096)
                    Interlocked.Exchange(ref pendingStatus, e.Data.Substring(StatusPrefix.Length));
                else Log(e.Data);
            };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { Log(e.Data); };
            server.Start();
            if (!AssignProcessToJobObject(job, server.Handle)) {
                server.Kill();
                throw new System.ComponentModel.Win32Exception();
            }
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            icon.Text = "Inkrail Open - port " + port;
            Log("Server started, PID " + server.Id + ".");
        } catch (Exception e) {
            Log("Start failed: " + e.Message);
            Stop();
            icon.Text = "Inkrail - start failed (see logs)";
            workspaceStatus.Text = "Workspace: server unavailable";
        }
    }

    void StatusUnavailable() {
        icon.Text = "Inkrail - job status unavailable";
        workspaceStatus.Text = "Workspace: status unavailable";
        workCounts.Text = "Job counts unavailable"; queueCounts.Text = "Queue: unknown";
    }
    void ApplyStatus(string message) {
        try {
            var status = json.Deserialize<JobStatus>(message);
            lastStatus = DateTime.UtcNow;
            if (status == null || status.unavailable) { StatusUnavailable(); return; }
            string state = status.blocked > 0 ? "Needs attention" : status.active > 0 ? "Working" : status.queued > 0 ? "Queued" : "Idle";
            workspaceStatus.Text = "Workspace: " + state;
            workCounts.Text = String.Format("Translating {0} | Dictionary {1} | Downloads {2} | Art {3}", status.translation, status.dictionary, status.downloads, status.art);
            queueCounts.Text = String.Format("Active {0} | Queued {1} | Needs access {2}", status.active, status.queued, status.blocked);
            string tooltip = String.Format("Inkrail - {0}\nActive {1} | Queued {2} | Blocked {3}", state, status.active, status.queued, status.blocked);
            icon.Text = tooltip.Length > 63 ? tooltip.Substring(0, 63) : tooltip;
            if (lastSummary != tooltip) { Log("Workspace status: " + tooltip.Replace('\n', ' ')); lastSummary = tooltip; }
        } catch (Exception) { StatusUnavailable(); }
    }

    void Stop()
    {
        if (job != IntPtr.Zero) { CloseHandle(job); job = IntPtr.Zero; }
        if (server != null) {
            try { server.WaitForExit(5000); Log("Server stopped, PID " + server.Id + "."); } catch (InvalidOperationException) { }
            server.Dispose(); server = null;
        }
    }
    void Restart() { Log("Restart requested."); Start(); }
    bool showingPreferences;
    void ShowPreferences() {
        if (showingPreferences) return;
        showingPreferences = true;
        try { using (var wizard = new SetupWizard(true)) if (wizard.ShowDialog() == DialogResult.OK) Restart(); }
        finally { showingPreferences = false; }
    }
    protected override void ExitThreadCore()
    {
        closing = true; timer.Stop(); Stop(); icon.Visible = false;
        Log("Tray quit."); base.ExitThreadCore();
    }
    bool resourcesDisposed;
    protected override void Dispose(bool disposing)
    {
        if (disposing && !resourcesDisposed) { resourcesDisposed = true; Stop(); timer.Dispose(); if (icon.Icon != null) icon.Icon.Dispose(); icon.Dispose(); quit.Dispose(); restart.Dispose(); open.Dispose(); preferences.Dispose(); }
        base.Dispose(disposing);
    }
    [StructLayout(LayoutKind.Sequential)] struct BASIC_LIMITS {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct IO_COUNTERS { public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount, ReadTransferCount, WriteTransferCount, OtherTransferCount; }
    [StructLayout(LayoutKind.Sequential)] struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION {
        public BASIC_LIMITS BasicLimitInformation; public IO_COUNTERS IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)] static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref JOBOBJECT_EXTENDED_LIMIT_INFORMATION info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
}
