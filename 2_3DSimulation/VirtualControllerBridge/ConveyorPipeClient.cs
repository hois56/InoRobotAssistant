using System.IO.Pipes;
using System.Net;
using System.Security.Principal;

namespace InoRobotVirtualControllerBridge;

internal sealed class ConveyorPipeClient : IDisposable
{
    private NamedPipeClientStream? pipe;
    private string address = "";

    public async Task<ConveyorProtocol.Reply> ExchangeAsync(string ip, ConveyorProtocol.Request request, CancellationToken cancellation)
    {
        if (!IPAddress.TryParse(ip, out IPAddress? parsed) || !IPAddress.IsLoopback(parsed)
            || parsed.AddressFamily != System.Net.Sockets.AddressFamily.InterNetwork)
            throw new ArgumentException("K14 conveyor input requires a local software controller.");
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation);
        deadline.CancelAfter(1500);
        try
        {
            if (pipe is null || !pipe.IsConnected || address != parsed.ToString())
            {
                Dispose(); address = parsed.ToString();
                pipe = new NamedPipeClientStream(".", "InoRobot.K14.Conveyor." + address,
                    PipeDirection.InOut, PipeOptions.Asynchronous, TokenImpersonationLevel.Identification);
                await pipe.ConnectAsync(1000, deadline.Token);
            }
            await pipe.WriteAsync(request.Bytes, deadline.Token);
            byte[] reply = new byte[ConveyorProtocol.ReplySize];
            await pipe.ReadExactlyAsync(reply, deadline.Token);
            return ConveyorProtocol.Decode(reply);
        }
        catch { Dispose(); throw; }
    }

    public void Dispose() { pipe?.Dispose(); pipe = null; address = ""; }
}
