using System.Buffers.Binary;
using System.IO.Pipes;
using System.Net;
using System.Security.Principal;

namespace InoRobotVirtualControllerBridge;

internal static class StandardInputPipeClient
{
    internal const int LastAddress = 64;
    internal static byte[] Encode(int address, int? value, bool snapshot = false)
    {
        if (address is < 0 or > LastAddress || value is < 0 or > 1 || snapshot && (address != 0 || value.HasValue))
            throw new ArgumentException("Standard input address must be 0..64 and value 0/1.");
        byte[] bytes = new byte[32];
        BinaryPrimitives.WriteUInt32LittleEndian(bytes, 0x314f4944);
        BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(4), 2);
        BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(8), snapshot ? 2 : value.HasValue ? 1 : 0);
        BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(12), address);
        BinaryPrimitives.WriteInt32LittleEndian(bytes.AsSpan(16), value ?? 0);
        return bytes;
    }
    internal static int Decode(byte[] bytes, byte[] request)
    {
        if (bytes.Length != 32 || !bytes.AsSpan(0, 16).SequenceEqual(request.AsSpan(0, 16)))
            throw new IOException("Invalid K14 standard input reply.");
        uint status = BinaryPrimitives.ReadUInt32LittleEndian(bytes.AsSpan(20));
        int value = BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(16));
        if (status != 0 || value is < 0 or > 1
            || request[8] != 2 && BinaryPrimitives.ReadUInt64LittleEndian(bytes.AsSpan(24)) != 0)
            throw new IOException($"K14 standard inputs unavailable ({status}).");
        return value;
    }
    internal static Dictionary<int,int> DecodeSnapshot(byte[] bytes, byte[] request)
    {
        if (request[8] != 2) throw new ArgumentException("Snapshot request required.");
        int last = Decode(bytes, request);
        ulong bits = BinaryPrimitives.ReadUInt64LittleEndian(bytes.AsSpan(24));
        var result = new Dictionary<int,int>(65);
        for (int i = 0; i < 64; i++) result[i] = (int)((bits >> i) & 1);
        result[64] = last;
        return result;
    }
    private static async Task<byte[]> Exchange(string ip, byte[] request, CancellationToken cancellation)
    {
        if (!IPAddress.TryParse(ip, out IPAddress? parsed) || !IPAddress.IsLoopback(parsed)
            || parsed.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
            throw new ArgumentException("Standard input injection requires a local virtual controller.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(1000);
        using var pipe = new NamedPipeClientStream(".", "InoRobot.K14.StandardInput." + parsed,
            PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
        await pipe.ConnectAsync(750, deadline.Token);
        await pipe.WriteAsync(request, deadline.Token);
        byte[] reply = new byte[32];
        await pipe.ReadExactlyAsync(reply, deadline.Token);
        return reply;
    }
    public static async Task<int> ExchangeAsync(string ip, int address, int? value, CancellationToken cancellation)
    {
        byte[] request = Encode(address, value);
        return Decode(await Exchange(ip, request, cancellation), request);
    }
    public static async Task<Dictionary<int,int>> ReadAsync(string ip, CancellationToken cancellation)
    {
        byte[] request = Encode(0, null, true);
        return DecodeSnapshot(await Exchange(ip, request, cancellation), request);
    }
}
