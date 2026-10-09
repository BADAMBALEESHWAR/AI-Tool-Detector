Add-Type -AssemblyName UIAutomationClient -ErrorAction SilentlyContinue
Add-Type -AssemblyName UIAutomationTypes -ErrorAction SilentlyContinue

Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Diagnostics;

public class WinEnumHelper {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenWindowStation(string lpszWinSta, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessWindowStation(IntPtr hWinSta);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr OpenDesktop(string lpszDesktop, uint dwFlags, bool fInherit, uint dwDesiredAccess);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetThreadDesktop(IntPtr hDesktop);

    [DllImport("user32.dll")]
    public static extern bool EnumDesktopWindows(IntPtr hDesktop, EnumWindowsProc lpfn, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    public class WinInfo {
        public IntPtr Hwnd;
        public uint Pid;
        public string ClassName;
        public string Title;
        public string ProcName;
    }

    public static List<WinInfo> GetDesktopWindows() {
        var list = new List<WinInfo>();
        IntPtr hwinsta = OpenWindowStation("winsta0", false, 0x10000000);
        if (hwinsta != IntPtr.Zero) SetProcessWindowStation(hwinsta);
        IntPtr hdesk = OpenDesktop("default", 0, false, 0x10000000);
        if (hdesk != IntPtr.Zero) {
            SetThreadDesktop(hdesk);
            EnumDesktopWindows(hdesk, (hWnd, lParam) => {
                if (!IsWindowVisible(hWnd)) return true;
                var sbTitle = new StringBuilder(512);
                GetWindowText(hWnd, sbTitle, 512);
                string title = sbTitle.ToString().Trim();
                if (string.IsNullOrEmpty(title)) return true;

                var sbClass = new StringBuilder(256);
                GetClassName(hWnd, sbClass, 256);

                uint pid = 0;
                GetWindowThreadProcessId(hWnd, out pid);

                string pName = "";
                try {
                    using (var p = Process.GetProcessById((int)pid)) {
                        pName = p.ProcessName;
                    }
                } catch { return true; }

                list.Add(new WinInfo {
                    Hwnd = hWnd,
                    Pid = pid,
                    ClassName = sbClass.ToString(),
                    Title = title,
                    ProcName = pName
                });
                return true;
            }, IntPtr.Zero);
        }
        return list;
    }
}
"@ -ErrorAction SilentlyContinue

$BrowserProcs = @("chrome", "msedge", "firefox", "brave", "opera", "opera_gx", "arc", "vivaldi", "safari", "floorp", "waterfox", "tor", "chromium")
$windows = [WinEnumHelper]::GetDesktopWindows()

$condTab = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::TabItem
)

$condControls = New-Object System.Windows.Automation.OrCondition(
    (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)),
    (New-Object System.Windows.Automation.OrCondition(
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Pane)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Group)),
        (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Custom))
    ))
)

foreach ($w in $windows) {
    $p = $w.ProcName.ToLower()
    if ($BrowserProcs -contains $p) {
        Write-Output "BROWSER_WINDOW|$p|$($w.Title)"
        try {
            $ae = [System.Windows.Automation.AutomationElement]::FromHandle($w.Hwnd)
            if ($ae) {
                $tabs = $ae.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condTab)
                foreach ($t in $tabs) {
                    $tName = $t.Current.Name
                    if ($tName) {
                        Write-Output "BROWSER_TAB|$p|$tName"
                    }
                }

                $elements = $ae.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condControls)
                foreach ($el in $elements) {
                    $eName = $el.Current.Name
                    if ($eName) {
                        $lower = $eName.ToLower()
                        # Filter out closed launcher buttons and search controls
                        if ($lower -eq "ask gemini" -or $lower -eq "open gemini in chrome" -or $lower.StartsWith("open gemini") -or $lower.Contains("ask google") -or $lower.Contains("ask ai mode") -or $lower.StartsWith("open copilot")) {
                            continue
                        }

                        if ($lower.Contains("gemini") -or $lower.Contains("copilot") -or $lower.Contains("side panel resize handle") -or $lower.Contains("brave leo") -or $lower.Contains("opera aria")) {
                            Write-Output "BROWSER_SIDEPANEL|$p|$eName"
                        }
                    }
                }
            }
        } catch {}
    } else {
        Write-Output "APP_WINDOW|$p|$($w.Title)"
    }
}
