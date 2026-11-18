namespace InoRobotVirtualControllerBridge;

internal static class BridgeInfo
{
    public const string ProductName = "InoRobot Virtual Controller Bridge";
    public static string Version { get; } = typeof(BridgeInfo).Assembly.GetName().Version!.ToString(2);
    public static string DisplayVersion => $"V{Version}";
    public static string DisplayName => $"{ProductName} {DisplayVersion}";
}
