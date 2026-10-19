// TabScanner — reports AI-relevant UI state to the AI Integrity Monitor desktop app.
//
//   TabScanner.exe                    WINDOW|<process>|<title>      every visible top-level window
//                                     TAB|<process>|<tab title>     every tab in a browser's tab strip
//   TabScanner.exe --deep <rules>     MARKER|<process>|<rule id>    every marker rule that matched
//
// Rules file: one rule per line, "ruleId|host1,host2|ControlType|op|text", where op is
// "=" (exact name) or "^" (name prefix) and ControlType may be empty (any type).
//
// Privacy: deep mode reads accessibility names in-process only to compare them with the
// rules. It prints rule ids, never on-screen text, so chat or document content is never
// captured. Inside browsers, elements that belong to web pages are ignored entirely.
//
// Build: native\build.ps1 (C# 5 / .NET Framework 4, no extra dependencies). The PowerShell
// fallback TabScanner.ps1 compiles this same file at runtime.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Automation;

public static class TabScanner
{
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int max);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("dwmapi.dll")] private static extern int DwmGetWindowAttribute(IntPtr hWnd, int attribute, out int value, int size);
    private const int DWMWA_CLOAKED = 14;

    private static readonly HashSet<string> Browsers = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "chrome", "msedge", "brave", "opera", "opera_gx", "vivaldi", "chromium", "thorium", "yandex",
        "firefox", "floorp", "waterfox", "librewolf", "zen", "arc"
    };

    private static readonly HashSet<string> Ignored = new HashSet<string>(StringComparer.OrdinalIgnoreCase) {
        "explorer", "dwm", "ShellExperienceHost", "StartMenuExperienceHost", "SearchHost", "TextInputHost",
        "LockApp", "SystemSettings", "ApplicationFrameHost", "AI Monitor", "TabScanner"
    };

    private sealed class Win { public IntPtr Handle; public string Process; public string Title; }
    private sealed class Rule { public string Id; public HashSet<string> Hosts; public string ControlType; public bool Prefix; public string Text; }

    public static int Main(string[] args)
    {
        try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }
        try
        {
            if (args.Length >= 2 && args[0] == "--deep") Deep(args[1]);
            else Fast();
            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("TabScanner error: " + ex.Message);
            return 1;
        }
    }

    private static void Fast()
    {
        foreach (Win w in TopWindows())
        {
            Emit("WINDOW", w.Process, w.Title);
            if (!Browsers.Contains(w.Process)) continue;
            try
            {
                AutomationElement root = AutomationElement.FromHandle(w.Handle);
                AutomationElementCollection tabs = root.FindAll(TreeScope.Descendants,
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.TabItem));
                foreach (AutomationElement tab in tabs)
                {
                    string name = SafeName(tab);
                    // Tabs drawn by web pages (role="tab") are not browser tabs.
                    if (name.Length > 0 && !IsInsideDocument(tab)) Emit("TAB", w.Process, name);
                }
            }
            catch { }
        }
    }

    private static void Deep(string rulesFile)
    {
        List<Rule> rules = LoadRules(rulesFile);
        if (rules.Count == 0) return;

        var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Rule r in rules) hosts.UnionWith(r.Hosts);

        var reported = new HashSet<string>();
        foreach (Win w in TopWindows())
        {
            if (!hosts.Contains(w.Process)) continue;
            bool browser = Browsers.Contains(w.Process);
            var pending = new List<Rule>();
            foreach (Rule r in rules)
                if (r.Hosts.Contains(w.Process) && !reported.Contains(r.Id + "|" + w.Process)) pending.Add(r);
            if (pending.Count == 0) continue;

            try
            {
                var cache = new CacheRequest();
                cache.Add(AutomationElement.NameProperty);
                cache.Add(AutomationElement.ControlTypeProperty);
                AutomationElementCollection all;
                using (cache.Activate())
                {
                    all = AutomationElement.FromHandle(w.Handle).FindAll(TreeScope.Descendants, Condition.TrueCondition);
                }

                foreach (AutomationElement el in all)
                {
                    if (pending.Count == 0) break;
                    string name, type;
                    try
                    {
                        name = el.Cached.Name ?? "";
                        type = el.Cached.ControlType.ProgrammaticName.Replace("ControlType.", "");
                    }
                    catch { continue; }
                    // Long names are content (messages, paragraphs), never UI markers.
                    if (name.Length == 0 || name.Length > 200) continue;

                    for (int i = pending.Count - 1; i >= 0; i--)
                    {
                        Rule r = pending[i];
                        if (r.ControlType.Length > 0 && !string.Equals(r.ControlType, type, StringComparison.OrdinalIgnoreCase)) continue;
                        bool hit = r.Prefix
                            ? name.StartsWith(r.Text, StringComparison.OrdinalIgnoreCase)
                            : string.Equals(name, r.Text, StringComparison.OrdinalIgnoreCase);
                        if (!hit) continue;
                        // In browsers only the browser's own UI counts; a side panel's document
                        // is matched by its title, but nothing inside any web page is.
                        if (browser && type != "Document" && IsInsideDocument(el)) continue;
                        Emit("MARKER", w.Process, r.Id);
                        reported.Add(r.Id + "|" + w.Process);
                        pending.RemoveAt(i);
                    }
                }
            }
            catch { }
        }
    }

    private static List<Win> TopWindows()
    {
        var names = new Dictionary<uint, string>();
        var list = new List<Win>();
        EnumWindows(delegate (IntPtr h, IntPtr l)
        {
            if (!IsWindowVisible(h)) return true;
            int cloaked;
            if (DwmGetWindowAttribute(h, DWMWA_CLOAKED, out cloaked, 4) == 0 && cloaked != 0) return true;

            var sb = new StringBuilder(512);
            GetWindowText(h, sb, sb.Capacity);
            string title = sb.ToString().Trim();
            if (title.Length == 0) return true;

            uint pid;
            GetWindowThreadProcessId(h, out pid);
            string proc;
            if (!names.TryGetValue(pid, out proc))
            {
                try { using (Process p = Process.GetProcessById((int)pid)) proc = p.ProcessName; }
                catch { proc = ""; }
                names[pid] = proc;
            }
            if (proc.Length == 0 || Ignored.Contains(proc)) return true;

            list.Add(new Win { Handle = h, Process = proc, Title = title });
            return true;
        }, IntPtr.Zero);
        return list;
    }

    private static bool IsInsideDocument(AutomationElement el)
    {
        try
        {
            TreeWalker walker = TreeWalker.ControlViewWalker;
            AutomationElement parent = walker.GetParent(el);
            for (int depth = 0; parent != null && depth < 64; depth++)
            {
                if (parent.Current.ControlType == ControlType.Document) return true;
                parent = walker.GetParent(parent);
            }
        }
        catch { }
        return false;
    }

    private static List<Rule> LoadRules(string path)
    {
        var rules = new List<Rule>();
        foreach (string raw in File.ReadAllLines(path, Encoding.UTF8))
        {
            string[] f = raw.Split('|');
            if (f.Length < 5 || f[0].Length == 0 || f[4].Length == 0) continue;
            var hosts = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (string h in f[1].Split(',')) if (h.Trim().Length > 0) hosts.Add(h.Trim());
            rules.Add(new Rule
            {
                Id = f[0],
                Hosts = hosts,
                ControlType = f[2].Trim(),
                Prefix = f[3] == "^",
                Text = string.Join("|", f, 4, f.Length - 4).Trim()
            });
        }
        return rules;
    }

    private static string SafeName(AutomationElement el)
    {
        try { return (el.Current.Name ?? "").Trim(); } catch { return ""; }
    }

    private static void Emit(string kind, string process, string value)
    {
        Console.WriteLine(kind + "|" + process + "|" + value.Replace('\r', ' ').Replace('\n', ' '));
    }
}
