using Microsoft.Win32;

namespace InoRobotVirtualControllerBridge;

internal sealed class BridgeWindow : Form
{
    public BridgeWindow()
    {
        Text = "InoRobot Virtual Controller Bridge";
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = true;
        ShowInTaskbar = true;
        ClientSize = new Size(390, 156);

        Label title = new()
        {
            AutoSize = true,
            Font = new Font("Segoe UI", 9F, FontStyle.Bold),
            Location = new Point(22, 22),
            Text = "가상 컨트롤러 전용 브리지 실행 중"
        };
        Label detail = new()
        {
            AutoSize = false,
            Location = new Point(22, 54),
            Size = new Size(346, 48),
            Text = "3D 시뮬레이션에서 직접 연결할 수 있습니다.\n연결 주소: ws://127.0.0.1:5055/ws"
        };
        Button closeButton = new()
        {
            DialogResult = DialogResult.OK,
            Location = new Point(278, 112),
            Size = new Size(90, 30),
            Text = "종료"
        };
        closeButton.Click += (_, _) => Close();

        Controls.AddRange([title, detail, closeButton]);
        AcceptButton = closeButton;
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
