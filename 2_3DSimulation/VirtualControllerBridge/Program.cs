using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace InoRobotVirtualControllerBridge;

internal static class Program
{
    private const int BridgePort = 5055;
    private const int DefaultSampleIntervalMs = 4;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public static async Task Main(string[] args)
    {
        using Mutex singleInstance = new(true, "Local\\InoRobotVirtualControllerBridge", out bool ownsMutex);
        if (!ownsMutex)
            return;

        NativeRobotClient.PrepareNativeLibrary();
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls($"http://127.0.0.1:{BridgePort}");
        builder.Services.AddSingleton<NativeRobotClient>();

        WebApplication app = builder.Build();
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });
        app.MapGet("/api/health", (NativeRobotClient robot) => Results.Json(new
        {
            service = "InoRobotVirtualControllerBridge",
            connected = robot.IsConnected,
            sampleIntervalMs = DefaultSampleIntervalMs
        }, JsonOptions));
        app.Map("/ws", HandleWebSocketAsync);
        await app.RunAsync();
    }

    private static async Task HandleWebSocketAsync(HttpContext context)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }

        NativeRobotClient robot = context.RequestServices.GetRequiredService<NativeRobotClient>();
        using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
        using CancellationTokenSource sessionCancellation =
            CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        using SemaphoreSlim sendLock = new(1, 1);
        int streaming = 0;
        int sampleIntervalMs = DefaultSampleIntervalMs;

        async Task SendAsync(object payload)
        {
            if (socket.State != WebSocketState.Open)
                return;
            byte[] bytes = JsonSerializer.SerializeToUtf8Bytes(payload, JsonOptions);
            await sendLock.WaitAsync(sessionCancellation.Token);
            try
            {
                if (socket.State == WebSocketState.Open)
                    await socket.SendAsync(bytes, WebSocketMessageType.Text, true, sessionCancellation.Token);
            }
            finally
            {
                sendLock.Release();
            }
        }

        async Task ReceiveCommandsAsync()
        {
            byte[] receiveBuffer = new byte[4096];
            using MemoryStream messageBuffer = new();
            while (!sessionCancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result = await socket.ReceiveAsync(receiveBuffer, sessionCancellation.Token);
                if (result.MessageType == WebSocketMessageType.Close)
                    break;
                messageBuffer.Write(receiveBuffer, 0, result.Count);
                if (!result.EndOfMessage)
                    continue;

                string json = Encoding.UTF8.GetString(messageBuffer.GetBuffer(), 0, checked((int)messageBuffer.Length));
                messageBuffer.SetLength(0);
                try
                {
                    using JsonDocument document = JsonDocument.Parse(json);
                    JsonElement root = document.RootElement;
                    string type = root.TryGetProperty("type", out JsonElement typeElement)
                        ? typeElement.GetString() ?? string.Empty
                        : string.Empty;
                    if (type == "connect")
                    {
                        string ip = root.TryGetProperty("ip", out JsonElement ipElement)
                            ? ipElement.GetString() ?? "127.0.0.1"
                            : "127.0.0.1";
                        (bool success, string message) = robot.Connect(ip);
                        await SendAsync(new { type = "connectResult", success, message });
                    }
                    else if (type is "startStream" or "startTrace")
                    {
                        int requestedInterval = root.TryGetProperty("interval", out JsonElement intervalElement)
                            && intervalElement.TryGetInt32(out int parsedInterval)
                                ? parsedInterval
                                : DefaultSampleIntervalMs;
                        sampleIntervalMs = Math.Clamp(requestedInterval, 1, 1000);
                        Interlocked.Exchange(ref streaming, robot.IsConnected ? 1 : 0);
                        await SendAsync(new
                        {
                            type = "streamStartResult",
                            success = robot.IsConnected,
                            interval = sampleIntervalMs
                        });
                    }
                    else if (type is "stopStream" or "stopTrace")
                    {
                        Interlocked.Exchange(ref streaming, 0);
                        await SendAsync(new { type = "streamStopResult", success = true });
                    }
                    else if (type == "disconnect")
                    {
                        Interlocked.Exchange(ref streaming, 0);
                        robot.Disconnect();
                        await SendAsync(new { type = "disconnectResult", success = true });
                    }
                    else if (type == "status")
                    {
                        await SendAsync(new
                        {
                            type = "status",
                            robotConnected = robot.IsConnected,
                            streamRunning = Volatile.Read(ref streaming) == 1
                        });
                    }
                }
                catch (JsonException)
                {
                    await SendAsync(new { type = "error", message = "Invalid command." });
                }
            }
        }

        async Task StreamRobotStateAsync()
        {
            long sequence = 0;
            while (!sessionCancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
            {
                long cycleStart = Environment.TickCount64;
                if (Volatile.Read(ref streaming) == 1)
                {
                    RobotState? state = robot.ReadState(
                        Interlocked.Increment(ref sequence),
                        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                    if (state is not null)
                        await SendAsync(new { type = "robotState", data = state });
                }

                int remaining = sampleIntervalMs - checked((int)Math.Min(int.MaxValue, Environment.TickCount64 - cycleStart));
                if (remaining > 0)
                    await Task.Delay(remaining, sessionCancellation.Token);
                else
                    await Task.Yield();
            }
        }

        try
        {
            await SendAsync(new { type = "bridgeReady", sampleIntervalMs = DefaultSampleIntervalMs });
            Task receiveTask = ReceiveCommandsAsync();
            Task streamTask = StreamRobotStateAsync();
            await Task.WhenAny(receiveTask, streamTask);
        }
        catch (OperationCanceledException)
        {
        }
        catch (WebSocketException)
        {
        }
        finally
        {
            sessionCancellation.Cancel();
            Interlocked.Exchange(ref streaming, 0);
            robot.Disconnect();
            if (socket.State == WebSocketState.Open)
            {
                try
                {
                    await socket.CloseAsync(
                        WebSocketCloseStatus.NormalClosure,
                        "3D simulation disconnected",
                        CancellationToken.None);
                }
                catch
                {
                }
            }
        }
    }
}
