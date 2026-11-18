using System.Reflection;
using InoRobotVirtualControllerBridge;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        using (BridgeWindow window = CreateWindow())
        {
            NotifyIcon tray = GetTray(window);
            Check(window.Visible && window.ShowInTaskbar && !tray.Visible, "Initial window visibility");
            Check(window.Icon is { Width: >= 64 }, "Large application icon");

            Minimize(window);
            Check(!window.Visible && !window.ShowInTaskbar && tray.Visible, "Minimize to notification area");
            ((ToolStripMenuItem)tray.ContextMenuStrip!.Items[0]).PerformClick();
            Application.DoEvents();
            Check(window.Visible && window.ShowInTaskbar && !tray.Visible, "Open from tray menu");
            Check(window.WindowState == FormWindowState.Normal, "Restored window state");

            Minimize(window);
            ((ToolStripMenuItem)tray.ContextMenuStrip.Items[2]).PerformClick();
            Application.DoEvents();
            Check(window.IsDisposed && !tray.Visible, "Exit from tray removes notification icon");
        }

        using (BridgeWindow window = CreateWindow())
        {
            NotifyIcon tray = GetTray(window);
            Minimize(window);
            window.RequestClose();
            Application.DoEvents();
            Check(window.IsDisposed && !tray.Visible, "Remote shutdown closes minimized window");
        }
        Console.WriteLine("Bridge window lifecycle checks passed");
    }

    private static BridgeWindow CreateWindow()
    {
        BridgeWindow window = new()
        {
            StartPosition = FormStartPosition.Manual,
            Location = new Point(-32000, -32000)
        };
        window.Show();
        Application.DoEvents();
        return window;
    }

    private static NotifyIcon GetTray(BridgeWindow window) =>
        (NotifyIcon)typeof(BridgeWindow).GetField("_trayIcon", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(window)!;

    private static void Minimize(BridgeWindow window)
    {
        window.WindowState = FormWindowState.Minimized;
        Application.DoEvents();
    }

    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
