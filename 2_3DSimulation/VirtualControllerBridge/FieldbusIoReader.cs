using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;

namespace InoRobotVirtualControllerBridge;

internal sealed record FieldbusIoSnapshot(byte[]? Inputs, byte[]? Outputs);

// Read assembly data explicitly. Do not open an IO owner connection or write
// assembly 100: an existing tester/PLC must retain control of the robot inputs.
internal sealed class FieldbusIoReader
{
    private CancellationTokenSource? _cancellation;
    private FieldbusIoSnapshot _snapshot = new(null, null);
    public FieldbusIoSnapshot Snapshot => Volatile.Read(ref _snapshot);

    public void Start(string address)
    {
        Stop();
        _cancellation = new CancellationTokenSource();
        _ = RunAsync(address, _cancellation.Token);
    }

    public void Stop()
    {
        _cancellation?.Cancel();
        _cancellation?.Dispose();
        _cancellation = null;
        Volatile.Write(ref _snapshot, new(null, null));
    }

    private async Task RunAsync(string address, CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            try
            {
                using var client = new TcpClient(AddressFamily.InterNetwork) { NoDelay = true };
                if (IPAddress.TryParse(address, out var ip) && IPAddress.IsLoopback(ip))
                    client.Client.Bind(new IPEndPoint(ip, 0));
                await client.ConnectAsync(address, 44818, token).AsTask().WaitAsync(TimeSpan.FromSeconds(2), token);
                using NetworkStream stream = client.GetStream();
                byte[] registered = await ExchangeAsync(stream, 0x65, 0, new byte[] { 1, 0, 0, 0 }, token);
                uint session = BinaryPrimitives.ReadUInt32LittleEndian(registered.AsSpan(4));
                if (session == 0) throw new InvalidDataException("Empty EtherNet/IP session.");
                while (!token.IsCancellationRequested)
                {
                    byte[]? inputs = await ReadAssemblyAsync(stream, session, 100, token);
                    byte[]? outputs = await ReadAssemblyAsync(stream, session, 101, token);
                    token.ThrowIfCancellationRequested();
                    FieldbusIoSnapshot previous = Snapshot;
                    Volatile.Write(ref _snapshot, new(inputs ?? previous.Inputs, outputs ?? previous.Outputs));
                    await Task.Delay(inputs is null && outputs is null ? 2000 : 50, token);
                }
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested) { return; }
            catch
            {
                // Optional on virtual controllers. Keep joint feedback running
                // and retry independently when EtherNet/IP is unavailable.
            }
            try { await Task.Delay(2000, token); }
            catch (OperationCanceledException) { return; }
        }
    }

    private static async Task<byte[]?> ReadAssemblyAsync(NetworkStream stream, uint session, byte instance, CancellationToken token)
    {
        byte[] body = { 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0xB2, 0, 8, 0,
            0x0E, 3, 0x20, 4, 0x24, instance, 0x30, 3 };
        byte[] reply = await ExchangeAsync(stream, 0x6F, session, body, token);
        if (reply.Length < 32) return null;
        int count = BinaryPrimitives.ReadUInt16LittleEndian(reply.AsSpan(30));
        int offset = 32;
        for (int i = 0; i < count && offset + 4 <= reply.Length; i++)
        {
            int type = BinaryPrimitives.ReadUInt16LittleEndian(reply.AsSpan(offset));
            int length = BinaryPrimitives.ReadUInt16LittleEndian(reply.AsSpan(offset + 2));
            offset += 4;
            if (offset + length > reply.Length) return null;
            if (type == 0xB2)
            {
                if (length < 4 || reply[offset] != 0x8E || reply[offset + 2] != 0) return null;
                int dataOffset = offset + 4 + reply[offset + 3] * 2;
                if (offset + length - dataOffset != 256) return null;
                return reply.AsSpan(dataOffset, 256).ToArray();
            }
            offset += length;
        }
        return null;
    }

    private static async Task<byte[]> ExchangeAsync(NetworkStream stream, ushort command, uint session, byte[] body, CancellationToken token)
    {
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(token);
        deadline.CancelAfter(1000);
        byte[] request = new byte[24 + body.Length];
        BinaryPrimitives.WriteUInt16LittleEndian(request, command);
        BinaryPrimitives.WriteUInt16LittleEndian(request.AsSpan(2), checked((ushort)body.Length));
        BinaryPrimitives.WriteUInt32LittleEndian(request.AsSpan(4), session);
        body.CopyTo(request, 24);
        await stream.WriteAsync(request, deadline.Token);
        byte[] header = new byte[24];
        await stream.ReadExactlyAsync(header, deadline.Token);
        int length = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(2));
        if (BinaryPrimitives.ReadUInt16LittleEndian(header) != command
            || BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8)) != 0
            || length > 4096) throw new InvalidDataException("Invalid EtherNet/IP response.");
        byte[] reply = new byte[24 + length];
        header.CopyTo(reply, 0);
        await stream.ReadExactlyAsync(reply.AsMemory(24), deadline.Token);
        return reply;
    }
}
