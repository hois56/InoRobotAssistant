using System.ComponentModel;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;

namespace InoRobotVirtualControllerBridge;

internal sealed class NativeRobotClient : IDisposable
{
    private const int CommunicationId = 0;
    private const string NativeLibraryName = "IMC100API.dll";
    private const string EmbeddedLibraryName = "InoRobotVirtualControllerBridge.IMC100API.dll";
    private readonly object _sync = new();
    private bool _nativeSessionOpen;
    private bool _disposed;

    public bool IsConnected { get; private set; }

    public static void PrepareNativeLibrary()
    {
        string directory = GetWritableNativeLibraryDirectory();
        string nativePath = Path.Combine(directory, NativeLibraryName);

        using Stream? resource = Assembly.GetExecutingAssembly().GetManifestResourceStream(EmbeddedLibraryName);
        if (resource is null)
            throw new InvalidOperationException($"Embedded resource {EmbeddedLibraryName} was not found.");

        bool writeLibrary = !File.Exists(nativePath) || new FileInfo(nativePath).Length != resource.Length;
        if (writeLibrary)
        {
            string temporaryPath = nativePath + ".tmp";
            using (FileStream output = File.Create(temporaryPath))
                resource.CopyTo(output);
            File.Move(temporaryPath, nativePath, true);
        }

        NativeLibrary.SetDllImportResolver(typeof(NativeRobotClient).Assembly, (libraryName, _, _) =>
        {
            // The single-file host can normalize a DllImport name before it
            // reaches the resolver (for example, dropping the .dll suffix).
            // Match by file name so the embedded API is loaded in both the
            // framework-dependent and published bridge builds.
            string requestedName = Path.GetFileNameWithoutExtension(libraryName);
            string expectedName = Path.GetFileNameWithoutExtension(NativeLibraryName);
            if (!string.Equals(requestedName, expectedName, StringComparison.OrdinalIgnoreCase))
                return IntPtr.Zero;

            // IMC100API.dll is an older native Windows library. On some
            // systems NativeLibrary.Load uses a LoadLibraryEx search policy
            // that makes this library fail with E_ACCESSDENIED even though
            // the same file loads normally. Use the explicit Win32 loader so
            // the embedded dependency is resolved from its absolute path.
            IntPtr handle = LoadLibrary(nativePath);
            if (handle == IntPtr.Zero)
            {
                int error = Marshal.GetLastWin32Error();
                throw new DllNotFoundException(
                    $"Unable to load {nativePath}: {new Win32Exception(error).Message} (0x{error:X8}).");
            }

            return handle;
        });
    }

    private static string GetWritableNativeLibraryDirectory()
    {
        string preferredDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Inovance",
            "3DSimulationBridge");
        string fallbackDirectory = Path.Combine(
            Path.GetTempPath(),
            "InoRobotVirtualControllerBridge",
            Environment.UserName);

        foreach (string directory in new[] { preferredDirectory, fallbackDirectory })
        {
            try
            {
                Directory.CreateDirectory(directory);
                string nativePath = Path.Combine(directory, NativeLibraryName);
                using FileStream probe = new(
                    nativePath,
                    FileMode.OpenOrCreate,
                    FileAccess.ReadWrite,
                    FileShare.Read);
                return directory;
            }
            catch (UnauthorizedAccessException)
            {
                // A previous elevated installation can leave the preferred
                // cache unreadable. Continue with the per-user temp cache.
            }
            catch (IOException)
            {
                // The cache may be locked by another installation. Continue
                // with the fallback location instead of breaking the bridge.
            }
        }

        throw new InvalidOperationException("A writable directory for IMC100API.dll could not be created.");
    }

    [DllImport("kernel32.dll", EntryPoint = "LoadLibraryW", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadLibrary(string fileName);

    public (bool Success, string Message) Connect(string ipAddress = "127.0.0.1", int port = 2222, int timeoutMs = 1000)
    {
        lock (_sync)
        {
            DisconnectUnsafe();
            try
            {
                IPAddress parsedAddress = IPAddress.Parse(ipAddress);
                byte[] bytes = parsedAddress.GetAddressBytes();
                if (bytes.Length != 4)
                    return (false, "IPv4 address required.");

                uint address = ((uint)bytes[0] << 24)
                    | ((uint)bytes[1] << 16)
                    | ((uint)bytes[2] << 8)
                    | bytes[3];
                int result = NativeApi.IMC100_Init_ETH(address, checked((ushort)port), timeoutMs, CommunicationId);
                if (result < 0)
                {
                    CloseNativeSessionUnsafe();
                    return (false, $"Controller connection failed ({result}).");
                }

                _nativeSessionOpen = true;
                RobJointPosition jointPosition = CreateJointPosition();
                result = NativeApi.IMC100_Get_RobJPosHere(ref jointPosition, CommunicationId);
                if (result < 0)
                {
                    DisconnectUnsafe();
                    return (false, $"Joint position verification failed ({result}).");
                }

                IsConnected = true;
                return (true, "Connected");
            }
            catch (Exception error)
            {
                DisconnectUnsafe();
                return (false, error.Message);
            }
        }
    }

    public RobotState? ReadState(long sequence, long timestamp)
    {
        lock (_sync)
        {
            if (!IsConnected)
                return null;

            RobJointPosition jointPosition = CreateJointPosition();
            try
            {
                int jointResult = NativeApi.IMC100_Get_RobJPosHere(ref jointPosition, CommunicationId);
                if (jointResult < 0)
                {
                    // A failed joint read means the native controller session is no
                    // longer usable. Mark it disconnected so the bridge can recover
                    // instead of leaving the browser in a permanently stale state.
                    DisconnectUnsafe();
                    return null;
                }

                // Joint feedback is sufficient for 3D synchronization. Some controller
                // configurations can report joint feedback before TCP feedback is available,
                // so keep streaming the usable joint state instead of dropping the frame.
                double[] tcp = Array.Empty<double>();
                RobPosition tcpPosition = CreateTcpPosition();
                try
                {
                    int tcpResult = NativeApi.IMC100_Get_RobPosHere(ref tcpPosition, CommunicationId);
                    if (tcpResult >= 0)
                        tcp = tcpPosition.RobotPositionData.ToArray();
                }
                catch
                {
                    // TCP feedback is optional for 3D joint synchronization. Keep
                    // the valid joint sample when a controller does not provide TCP
                    // feedback or its optional call fails transiently.
                }

                return new RobotState(
                    sequence,
                    timestamp,
                    jointPosition.JointData.ToArray(),
                    tcp);
            }
            catch
            {
                // Native API failures must not fault the streaming task. A transient
                // controller/socket failure is handled by the bridge reconnect loop.
                DisconnectUnsafe();
                return null;
            }
        }
    }

    public InterferenceZoneReadResult ReadInterferenceZone(int zoneNumber)
    {
        lock (_sync)
        {
            if (!IsConnected)
                return InterferenceZoneReadResult.Disconnected(zoneNumber);

            if (zoneNumber is < 0 or >= 16)
            {
                return InterferenceZoneReadResult.Failure(
                    zoneNumber,
                    $"간섭영역 번호가 유효하지 않습니다 (zone={zoneNumber})");
            }

            try
            {
                var zone = new InterferenceZone
                {
                    Diagonal = new float[6],
                    PointL = new float[6]
                };

                int returnCode = NativeApi.IMC100_Get_InterferZonePara(
                    zoneNumber,
                    ref zone,
                    CommunicationId);

                if (returnCode < 0)
                {
                    return InterferenceZoneReadResult.Failure(
                        zoneNumber,
                        $"간섭영역 조회 실패 (ret={returnCode})",
                        returnCode);
                }

                return InterferenceZoneReadResult.Successful(
                    zoneNumber,
                    returnCode,
                    new InterferenceZoneReadValues
                    {
                        Input = zone.Input,
                        Output = zone.Output,
                        Scope = zone.Scope,
                        IsAlert = zone.IsAlert,
                        SafeL = zone.SafeL,
                        WobjNum = zone.WobjNum,
                        SetType = zone.SetType,
                        Diagonal = zone.Diagonal ?? Array.Empty<float>(),
                        PointL = zone.PointL ?? Array.Empty<float>()
                    });
            }
            catch (Exception ex)
            {
                return InterferenceZoneReadResult.Failure(
                    zoneNumber,
                    $"간섭영역 조회 중 예외가 발생했습니다: {ex.Message}");
            }
        }
    }

    public InterferenceToolReadResult ReadInterferenceTool(int toolNumber)
    {
        lock (_sync)
        {
            if (!IsConnected)
                return InterferenceToolReadResult.Disconnected(toolNumber);

            if (toolNumber is < 0 or >= 16)
            {
                return InterferenceToolReadResult.Failure(
                    toolNumber,
                    $"Interference Tool number is out of range (tool={toolNumber})");
            }

            try
            {
                var tool = new InterferenceTool
                {
                    MTcpBox = new InterferenceTcpBox
                    {
                        IsUse = new ushort[4],
                        ToolNum = new ushort[4]
                    },
                    SquareBox = new InterferenceSquareBox
                    {
                        Diagonal = new float[6],
                        PointL = new float[6],
                        PointH = new float[13]
                    }
                };

                int returnCode = NativeApi.IMC100_Get_InterferToolPara(
                    toolNumber,
                    ref tool,
                    CommunicationId);

                if (returnCode < 0)
                {
                    return InterferenceToolReadResult.Failure(
                        toolNumber,
                        $"Interference Tool parameter read failed (ret={returnCode})",
                        returnCode);
                }

                return InterferenceToolReadResult.Successful(
                    toolNumber,
                    returnCode,
                    new InterferenceToolReadValues
                    {
                        Type = tool.Type,
                        IsUse = tool.MTcpBox.IsUse ?? Array.Empty<ushort>(),
                        ToolNum = tool.MTcpBox.ToolNum ?? Array.Empty<ushort>(),
                        ZPos = tool.BallBox.ZPos,
                        BallR = tool.BallBox.BallR,
                        SetType = tool.SquareBox.SetType,
                        Diagonal = tool.SquareBox.Diagonal ?? Array.Empty<float>(),
                        PointL = tool.SquareBox.PointL ?? Array.Empty<float>(),
                        PointH = tool.SquareBox.PointH ?? Array.Empty<float>()
                    });
            }
            catch (Exception ex)
            {
                return InterferenceToolReadResult.Failure(
                    toolNumber,
                    $"Interference Tool parameter read threw an exception: {ex.Message}");
            }
        }
    }

    public void Disconnect()
    {
        lock (_sync)
            DisconnectUnsafe();
    }

    private static RobJointPosition CreateJointPosition() => new()
    {
        JointData = new double[8],
        ExternalPositionData = new double[6]
    };

    private static RobPosition CreateTcpPosition() => new()
    {
        RobotPositionData = new double[6],
        ArmParameters = new int[4],
        ExternalPositionData = new double[6]
    };

    private void DisconnectUnsafe()
    {
        if (!IsConnected && !_nativeSessionOpen)
            return;
        CloseNativeSessionUnsafe();
        IsConnected = false;
    }

    private void CloseNativeSessionUnsafe()
    {
        try { NativeApi.IMC100_RemovePermit(CommunicationId); } catch { }
        try { NativeApi.IMC100_Exit_ETH(CommunicationId); } catch { }
        _nativeSessionOpen = false;
    }

    public void Dispose()
    {
        if (_disposed)
            return;
        _disposed = true;
        Disconnect();
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RobPosition
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public double[] RobotPositionData;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
        public int[] ArmParameters;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public double[] ExternalPositionData;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct RobJointPosition
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 8)]
        public double[] JointData;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public double[] ExternalPositionData;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InterferenceZone
    {
        public int Input;
        public int Output;
        public ushort Scope;
        public ushort IsAlert;
        public int SafeL;
        public ushort WobjNum;
        public ushort SetType;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public float[] Diagonal;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public float[] PointL;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InterferenceTcpBox
    {
        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
        public ushort[] IsUse;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 4)]
        public ushort[] ToolNum;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InterferenceBallBox
    {
        public float ZPos;
        public float BallR;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct InterferenceSquareBox
    {
        public ushort SetType;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public float[] Diagonal;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 6)]
        public float[] PointL;

        [MarshalAs(UnmanagedType.ByValArray, SizeConst = 13)]
        public float[] PointH;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi, Pack = 1)]
    private struct InterferenceTool
    {
        public ushort Type;
        public InterferenceTcpBox MTcpBox;
        public InterferenceBallBox BallBox;
        public InterferenceSquareBox SquareBox;
    }

    private static class NativeApi
    {
        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Init_ETH")]
        public static extern int IMC100_Init_ETH(uint ipAddress, ushort port, int timeout, int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Exit_ETH")]
        public static extern int IMC100_Exit_ETH(int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Get_RobPosHere")]
        public static extern int IMC100_Get_RobPosHere(ref RobPosition position, int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Get_RobJPosHere")]
        public static extern int IMC100_Get_RobJPosHere(ref RobJointPosition position, int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Get_InterferZonePara")]
        public static extern int IMC100_Get_InterferZonePara(
            int zoneNumber,
            ref InterferenceZone zone,
            int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_Get_InterferToolPara")]
        public static extern int IMC100_Get_InterferToolPara(
            int toolNumber,
            ref InterferenceTool tool,
            int communicationId);

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_RemovePermit")]
        public static extern int IMC100_RemovePermit(int communicationId);
    }
}

internal sealed record RobotState(long Sequence, long Timestamp, double[] Joints, double[] Tcp);

internal sealed class InterferenceZoneReadResult
{
    public bool Success { get; init; }
    public string Message { get; init; } = string.Empty;
    public int ZoneNumber { get; init; }
    public int ReadReturnCode { get; init; }
    public InterferenceZoneReadValues? Zone { get; init; }

    public static InterferenceZoneReadResult Successful(
        int zoneNumber,
        int returnCode,
        InterferenceZoneReadValues zone) => new()
        {
            Success = true,
            Message = "간섭영역 조회 성공",
            ZoneNumber = zoneNumber,
            ReadReturnCode = returnCode,
            Zone = zone
        };

    public static InterferenceZoneReadResult Disconnected(int zoneNumber) => Failure(
        zoneNumber,
        "실제 컨트롤러에 연결되어 있지 않습니다");

    public static InterferenceZoneReadResult Failure(
        int zoneNumber,
        string message,
        int returnCode = 0) => new()
        {
            Success = false,
            Message = message,
            ZoneNumber = zoneNumber,
            ReadReturnCode = returnCode
        };
}

internal sealed class InterferenceZoneReadValues
{
    public int Input { get; init; }
    public int Output { get; init; }
    public ushort Scope { get; init; }
    public ushort IsAlert { get; init; }
    public int SafeL { get; init; }
    public ushort WobjNum { get; init; }
    public ushort SetType { get; init; }
    public float[] Diagonal { get; init; } = Array.Empty<float>();
    public float[] PointL { get; init; } = Array.Empty<float>();
}

internal sealed class InterferenceToolReadResult
{
    public bool Success { get; init; }
    public string Message { get; init; } = string.Empty;
    public int ToolNumber { get; init; }
    public int ReadReturnCode { get; init; }
    public InterferenceToolReadValues? Tool { get; init; }

    public static InterferenceToolReadResult Successful(
        int toolNumber,
        int returnCode,
        InterferenceToolReadValues tool) => new()
        {
            Success = true,
            Message = "Interference Tool parameters read successfully",
            ToolNumber = toolNumber,
            ReadReturnCode = returnCode,
            Tool = tool
        };

    public static InterferenceToolReadResult Disconnected(int toolNumber) => Failure(
        toolNumber,
        "The real controller is not connected");

    public static InterferenceToolReadResult Failure(
        int toolNumber,
        string message,
        int returnCode = 0) => new()
        {
            Success = false,
            Message = message,
            ToolNumber = toolNumber,
            ReadReturnCode = returnCode
        };
}

internal sealed class InterferenceToolReadValues
{
    public ushort Type { get; init; }
    public ushort[] IsUse { get; init; } = Array.Empty<ushort>();
    public ushort[] ToolNum { get; init; } = Array.Empty<ushort>();
    public float ZPos { get; init; }
    public float BallR { get; init; }
    public ushort SetType { get; init; }
    public float[] Diagonal { get; init; } = Array.Empty<float>();
    public float[] PointL { get; init; } = Array.Empty<float>();
    public float[] PointH { get; init; } = Array.Empty<float>();
}
