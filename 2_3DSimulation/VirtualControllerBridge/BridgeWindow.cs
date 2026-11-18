using Microsoft.Win32;

namespace InoRobotVirtualControllerBridge;

internal sealed class BridgeWindow : Form
{
    private readonly NotifyIcon _trayIcon;

    public BridgeWindow()
    {
        Text = BridgeInfo.DisplayName;
        using Stream iconStream = typeof(BridgeWindow).Assembly.GetManifestResourceStream(
            "InoRobotVirtualControllerBridge.bridge.ico")!;
        Icon applicationIcon = new(iconStream, 64, 64);
        Icon = applicationIcon;
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;
        ClientSize = new Size(480, 190);

        PictureBox appIcon = new()
        {
            Location = new Point(22, 22),
            Size = new Size(40, 40),
            SizeMode = PictureBoxSizeMode.Zoom,
            Image = applicationIcon.ToBitmap()
        };
        ContextMenuStrip trayMenu = new();
        trayMenu.Items.Add("열기", null, (_, _) => RestoreFromTray());
        trayMenu.Items.Add(new ToolStripSeparator());
        trayMenu.Items.Add("종료", null, (_, _) => Close());
        Icon trayImage = new(applicationIcon, SystemInformation.SmallIconSize);
        _trayIcon = new NotifyIcon
        {
            Icon = trayImage,
            Text = BridgeInfo.DisplayName,
            ContextMenuStrip = trayMenu,
            Visible = false
        };
        _trayIcon.MouseDoubleClick += (_, args) =>
        {
            if (args.Button == MouseButtons.Left)
                RestoreFromTray();
        };
        Resize += (_, _) =>
        {
            if (WindowState != FormWindowState.Minimized || _trayIcon.Visible)
                return;
            _trayIcon.Visible = true;
            Hide();
            ShowInTaskbar = false;
        };
        FormClosed += (_, _) => _trayIcon.Visible = false;
        Disposed += (_, _) =>
        {
            _trayIcon.Dispose();
            trayMenu.Dispose();
            trayImage.Dispose();
            appIcon.Image?.Dispose();
            applicationIcon.Dispose();
        };

        Label title = new()
        {
            AutoSize = true,
            Font = new Font("Segoe UI", 9F, FontStyle.Bold),
            Location = new Point(78, 22),
            Text = "가상 컨트롤러 전용 브리지"
        };
        Label version = new()
        {
            AutoSize = true,
            Location = new Point(78, 46),
            Text = $"{BridgeInfo.DisplayVersion} · 실행 중"
        };
        Label detail = new()
        {
            AutoSize = false,
            Location = new Point(22, 84),
            Size = new Size(436, 48),
            Text = "3D 시뮬레이션에서 여러 컨트롤러를 동시에 연결할 수 있습니다.\n연결 주소: ws://127.0.0.1:5055/ws"
        };
        Button closeButton = new()
        {
            DialogResult = DialogResult.OK,
            Location = new Point(368, 146),
            Size = new Size(90, 30),
            Text = "종료"
        };
        closeButton.Click += (_, _) => Close();

        Controls.AddRange([appIcon, title, version, detail, closeButton]);
        AcceptButton = closeButton;
    }

    private void RestoreFromTray()
    {
        ShowInTaskbar = true;
        Show();
        WindowState = FormWindowState.Normal;
        Activate();
        _trayIcon.Visible = false;
    }

    public void RequestClose()
    {
        if (IsDisposed || Disposing)
            return;
        try
        {
            BeginInvoke((MethodInvoker)Close);
        }
        catch (InvalidOperationException)
        {
            // The window is already closing on the UI thread.
        }
    }
}

internal static class BridgeProtocolRegistrar
{
    private const string ProtocolName = "inorobot-vc-bridge";

    public static void RegisterForCurrentUser()
    {
        string? executablePath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(executablePath))
            return;

        try
        {
            using RegistryKey? protocolKey = Registry.CurrentUser.CreateSubKey(
                $@"Software\Classes\{ProtocolName}");
            protocolKey?.SetValue(string.Empty, "URL:InoRobot Virtual Controller Bridge");
            protocolKey?.SetValue("URL Protocol", string.Empty);
            using RegistryKey? commandKey = protocolKey?.CreateSubKey("shell\\open\\command");
            commandKey?.SetValue(string.Empty, $"\"{executablePath}\" \"%1\"");
        }
        catch (UnauthorizedAccessException)
        {
            // The bridge remains usable when registry policy blocks protocol registration.
        }
    }
}
