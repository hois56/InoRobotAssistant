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
        string directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Inovance",
            "3DSimulationBridge");
        Directory.CreateDirectory(directory);
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
            string.Equals(libraryName, NativeLibraryName, StringComparison.OrdinalIgnoreCase)
                ? NativeLibrary.Load(nativePath)
                : IntPtr.Zero);
    }

    public (bool Success, string Message) Connect(string ipAddress = "127.0.0.1", int port = 3333, int timeoutMs = 1000)
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
            int jointResult = NativeApi.IMC100_Get_RobJPosHere(ref jointPosition, CommunicationId);
            if (jointResult < 0)
                return null;

            // Joint feedback is sufficient for 3D synchronization. Some controller
            // configurations can report joint feedback before TCP feedback is available,
            // so keep streaming the usable joint state instead of dropping the frame.
            double[] tcp = Array.Empty<double>();
            RobPosition tcpPosition = CreateTcpPosition();
            int tcpResult = NativeApi.IMC100_Get_RobPosHere(ref tcpPosition, CommunicationId);
            if (tcpResult >= 0)
                tcp = tcpPosition.RobotPositionData.ToArray();

            return new RobotState(
                sequence,
                timestamp,
                jointPosition.JointData.ToArray(),
                tcp);
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

        [DllImport(NativeLibraryName, EntryPoint = "IMC100_RemovePermit")]
        public static extern int IMC100_RemovePermit(int communicationId);
    }
}

internal sealed record RobotState(long Sequence, long Timestamp, double[] Joints, double[] Tcp);
