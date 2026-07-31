using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;

namespace InoRobotVirtualControllerBridge;

internal static class Program
{
    private const int BridgePort = 5055;
    private const int ControllerPort = 2222;
    private const int DefaultSampleIntervalMs = 4;
    private const int MaxMessageBytes = 64 * 1024;
    private const int MaxMessagesPerSecond = 100;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly string PairingToken = GetPairingToken();
    private static readonly HashSet<string> AllowedOrigins = ParseOrigins();
    private static readonly bool AllowRealController = !string.Equals(
        Environment.GetEnvironmentVariable("INOROBOT_ALLOW_REAL_CONTROLLER")?.Trim(),
        "false",
        StringComparison.OrdinalIgnoreCase);
    private static int activeClient;

    [STAThread]
    public static async Task Main(string[] args)
    {
        using Mutex singleInstance = new(true, "Local\\InoRobotVirtualControllerBridge", out bool ownsMutex);
        if (!ownsMutex)
            return;

        BridgeProtocolRegistrar.RegisterForCurrentUser();
        NativeRobotClient.PrepareNativeLibrary();
        WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
        builder.Logging.ClearProviders();
        builder.WebHost.UseUrls($"http://127.0.0.1:{BridgePort}");
        builder.Services.AddSingleton<NativeRobotClient>();

        await using WebApplication app = builder.Build();
        app.Use(async (context, next) =>
        {
            context.Response.Headers["X-Content-Type-Options"] = "nosniff";
            context.Response.Headers["Referrer-Policy"] = "no-referrer";
            context.Response.Headers["Cache-Control"] = "no-store";
            string? origin = context.Request.Headers.Origin.FirstOrDefault();
            if (HttpMethods.IsOptions(context.Request.Method))
            {
                if (!IsAllowedOrigin(origin))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return;
                }
                AddCorsHeaders(context.Response, origin!);
                context.Response.StatusCode = StatusCodes.Status204NoContent;
                return;
            }
            if (origin is not null && !IsAllowedOrigin(origin))
            {
                context.Response.StatusCode = StatusCodes.Status403Forbidden;
                return;
            }
            if (origin is not null)
                AddCorsHeaders(context.Response, origin);
            await next();
        });
        app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(15) });
        app.MapGet("/api/health", (HttpContext context, NativeRobotClient robot) =>
        {
            if (!IsAllowedOrigin(context.Request.Headers.Origin.FirstOrDefault()))
                return Results.StatusCode(StatusCodes.Status403Forbidden);
            if (string.IsNullOrWhiteSpace(PairingToken) || AllowedOrigins.Count == 0)
                return Results.Json(new { service = "InoRobotVirtualControllerBridge", configured = false }, statusCode: StatusCodes.Status503ServiceUnavailable, options: JsonOptions);
            return Results.Json(new
            {
                service = "InoRobotVirtualControllerBridge",
                configured = true,
                connected = robot.IsConnected,
                controllerPort = ControllerPort,
                sampleIntervalMs = DefaultSampleIntervalMs,
                pairingToken = PairingToken
            }, JsonOptions);
        });
        app.Map("/ws", context => HandleWebSocketAsync(context, app.Lifetime));

        try
        {
            await app.StartAsync();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                $"전용 브리지를 시작할 수 없습니다.\n\n{exception.Message}",
                "InoRobot Virtual Controller Bridge",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        ApplicationConfiguration.Initialize();
        using BridgeWindow bridgeWindow = new();
        using CancellationTokenRegistration stoppingRegistration =
            app.Lifetime.ApplicationStopping.Register(bridgeWindow.RequestClose);
        Application.Run(bridgeWindow);
        await app.StopAsync();
    }

    private static HashSet<string> ParseOrigins()
    {
        string configuredOrigins = Environment.GetEnvironmentVariable("INOROBOT_BRIDGE_ORIGINS") ?? string.Empty;
        string originList = string.IsNullOrWhiteSpace(configuredOrigins)
            ? "https://inovancerobot.com,https://www.inovancerobot.com,http://127.0.0.1:8765,http://localhost:8765,http://127.0.0.1:5173,http://localhost:5173"
            : configuredOrigins;
        return originList
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(origin => origin.TrimEnd('/'))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static string GetPairingToken()
    {
        string configuredToken = Environment.GetEnvironmentVariable("INOROBOT_BRIDGE_TOKEN")?.Trim() ?? string.Empty;
        return string.IsNullOrWhiteSpace(configuredToken)
            ? Convert.ToHexString(RandomNumberGenerator.GetBytes(32))
            : configuredToken;
    }

    private static bool IsAllowedOrigin(string? origin) =>
        !string.IsNullOrWhiteSpace(origin) && AllowedOrigins.Contains(origin.TrimEnd('/'));

    private static void AddCorsHeaders(HttpResponse response, string origin)
    {
        response.Headers["Access-Control-Allow-Origin"] = origin;
        response.Headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
        response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
        response.Headers["Vary"] = "Origin";
    }

    private static async Task HandleWebSocketAsync(
        HttpContext context,
        IHostApplicationLifetime applicationLifetime)
    {
        string? origin = context.Request.Headers.Origin.FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(origin) && !IsAllowedOrigin(origin))
        {
            context.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }
        if (string.IsNullOrWhiteSpace(PairingToken) || AllowedOrigins.Count == 0)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            return;
        }
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = StatusCodes.Status400BadRequest;
            return;
        }
        if (Interlocked.CompareExchange(ref activeClient, 1, 0) != 0)
        {
            context.Response.StatusCode = StatusCodes.Status409Conflict;
            return;
        }

        NativeRobotClient robot = context.RequestServices.GetRequiredService<NativeRobotClient>();
        using WebSocket socket = await context.WebSockets.AcceptWebSocketAsync();
        using CancellationTokenSource sessionCancellation =
            CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        using SemaphoreSlim sendLock = new(1, 1);
        int streaming = 0;
        int controllerReconnectEnabled = 0;
        int sampleIntervalMs = DefaultSampleIntervalMs;
        string controllerIp = string.Empty;
        bool robotConnectedByThisSession = false;
        bool realControllerByThisSession = false;

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

        try
        {
            string? helloJson = await ReceiveMessageAsync(
                socket,
                sessionCancellation.Token,
                TimeSpan.FromSeconds(10));
            if (!AuthenticateHello(helloJson))
            {
                await CloseForPolicyAsync(socket, WebSocketCloseStatus.PolicyViolation, "Pairing required");
                return;
            }

            await SendAsync(new { type = "bridgeReady", sampleIntervalMs = DefaultSampleIntervalMs });
            Task receiveTask = ReceiveCommandsAsync();
            Task streamTask = StreamRobotStateAsync();
            await Task.WhenAny(receiveTask, streamTask);

            async Task ReceiveCommandsAsync()
            {
                Queue<long> messageTimes = new();
                while (!sessionCancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    string? json = await ReceiveMessageAsync(socket, sessionCancellation.Token);
                    if (json is null) break;
                    long now = Environment.TickCount64;
                    while (messageTimes.Count > 0 && now - messageTimes.Peek() >= 1000) messageTimes.Dequeue();
                    messageTimes.Enqueue(now);
                    if (messageTimes.Count > MaxMessagesPerSecond)
                    {
                        await SendAsync(new { type = "error", message = "Command rate limit exceeded." });
                        break;
                    }

                    try
                    {
                        using JsonDocument document = JsonDocument.Parse(json);
                        JsonElement root = document.RootElement;
                        if (root.ValueKind != JsonValueKind.Object
                            || !root.TryGetProperty("type", out JsonElement typeElement)
                            || typeElement.ValueKind != JsonValueKind.String)
                        {
                            await SendAsync(new { type = "error", message = "Command type is required." });
                            continue;
                        }

                        string type = typeElement.GetString() ?? string.Empty;
                        if (type == "connect")
                        {
                            string ip = root.TryGetProperty("ip", out JsonElement ipElement)
                                ? ipElement.GetString() ?? string.Empty
                                : string.Empty;
                            if (!IPAddress.TryParse(ip, out _))
                            {
                                await SendAsync(new { type = "connectResult", success = false, message = "A valid controller IP address is required." });
                                continue;
                            }
                            string controllerKind = root.TryGetProperty("controllerKind", out JsonElement kindElement)
                                ? kindElement.GetString()?.Trim().ToLowerInvariant() ?? "virtual"
                                : "virtual";
                            bool requestedRealController = controllerKind == "real";
                            if (controllerKind is not ("virtual" or "real"))
                            {
                                await SendAsync(new
                                {
                                    type = "connectResult",
                                    success = false,
                                    message = "Controller kind must be virtual or real."
                                });
                                continue;
                            }
                            if (requestedRealController && !AllowRealController)
                            {
                                Interlocked.Exchange(ref controllerReconnectEnabled, 0);
                                robot.Disconnect();
                                robotConnectedByThisSession = false;
                                realControllerByThisSession = false;
                                await SendAsync(new
                                {
                                    type = "connectResult",
                                    success = false,
                                    message = "Real controller access is disabled by local policy."
                                });
                                continue;
                            }
                            controllerIp = ip;
                            (bool success, string message) = robot.Connect(ip, ControllerPort);
                            Interlocked.Exchange(ref controllerReconnectEnabled, success ? 1 : 0);
                            robotConnectedByThisSession = success;
                            realControllerByThisSession = success;
                            await SendAsync(new { type = "connectResult", success, message });
                        }
                        else if (type == "readInterferenceZone")
                        {
                            int zoneNumber = ReadBoundedInt(root, "zoneNumber", 0, 255);
                            InterferenceZoneReadResult result = realControllerByThisSession
                                ? robot.ReadInterferenceZone(zoneNumber)
                                : InterferenceZoneReadResult.Disconnected(zoneNumber);
                            await SendAsync(new { type = "interferenceZoneReadResult", result });
                        }
                        else if (type == "readInterferenceTool")
                        {
                            int toolNumber = ReadBoundedInt(root, "toolNumber", 0, 255);
                            InterferenceToolReadResult result = realControllerByThisSession
                                ? robot.ReadInterferenceTool(toolNumber)
                                : InterferenceToolReadResult.Disconnected(toolNumber);
                            await SendAsync(new { type = "interferenceToolReadResult", result });
                        }
                        else if (type is "startStream" or "startTrace")
                        {
                            sampleIntervalMs = ReadBoundedInt(root, "interval", 1, 1000, DefaultSampleIntervalMs);
                            Interlocked.Exchange(ref streaming, robot.IsConnected ? 1 : 0);
                            await SendAsync(new { type = "streamStartResult", success = robot.IsConnected, interval = sampleIntervalMs });
                        }
                        else if (type is "stopStream" or "stopTrace")
                        {
                            Interlocked.Exchange(ref streaming, 0);
                            await SendAsync(new { type = "streamStopResult", success = true });
                        }
                        else if (type == "disconnect")
                        {
                            Interlocked.Exchange(ref controllerReconnectEnabled, 0);
                            Interlocked.Exchange(ref streaming, 0);
                            robot.Disconnect();
                            robotConnectedByThisSession = false;
                            realControllerByThisSession = false;
                            await SendAsync(new { type = "disconnectResult", success = true });
                        }
                        else if (type == "shutdown")
                        {
                            if (!root.TryGetProperty("allowShutdown", out JsonElement permission) || permission.ValueKind != JsonValueKind.True)
                            {
                                await SendAsync(new { type = "shutdownResult", success = false, message = "Explicit shutdown permission is required." });
                                continue;
                            }
                            Interlocked.Exchange(ref controllerReconnectEnabled, 0);
                            Interlocked.Exchange(ref streaming, 0);
                            robot.Disconnect();
                            robotConnectedByThisSession = false;
                            realControllerByThisSession = false;
                            await SendAsync(new { type = "shutdownResult", success = true });
                            applicationLifetime.StopApplication();
                            break;
                        }
                        else if (type == "status")
                        {
                            await SendAsync(new { type = "status", robotConnected = robot.IsConnected, streamRunning = Volatile.Read(ref streaming) == 1 });
                        }
                        else
                        {
                            await SendAsync(new { type = "error", message = $"Unsupported command: {type}" });
                        }
                    }
                    catch (JsonException)
                    {
                        await SendAsync(new { type = "error", message = "Invalid command JSON." });
                    }
                    catch (ArgumentOutOfRangeException)
                    {
                        await SendAsync(new { type = "error", message = "Command value is out of range." });
                    }
                }
            }

            async Task StreamRobotStateAsync()
            {
                long sequence = 0;
                int reconnectAttempt = 0;
                bool connectionLossReported = false;
                while (!sessionCancellation.IsCancellationRequested && socket.State == WebSocketState.Open)
                {
                    long cycleStart = Environment.TickCount64;
                    if (Volatile.Read(ref streaming) == 1)
                    {
                        RobotState? state = robot.ReadState(
                            Interlocked.Increment(ref sequence),
                            DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
                        if (state is not null)
                        {
                            reconnectAttempt = 0;
                            connectionLossReported = false;
                            await SendAsync(new { type = "robotState", data = state });
                        }
                        else if (Volatile.Read(ref controllerReconnectEnabled) == 1
                            && !string.IsNullOrWhiteSpace(controllerIp))
                        {
                            if (!connectionLossReported)
                            {
                                connectionLossReported = true;
                                await SendAsync(new { type = "controllerConnectionLost", message = "Controller feedback was interrupted. Reconnecting..." });
                            }

                            int retryDelay = 250 * (1 << Math.Min(reconnectAttempt, 4));
                            reconnectAttempt = Math.Min(reconnectAttempt + 1, 4);
                            await Task.Delay(retryDelay, sessionCancellation.Token);
                            if (Volatile.Read(ref controllerReconnectEnabled) == 1
                                && !sessionCancellation.IsCancellationRequested)
                            {
                                (bool success, string message) = robot.Connect(controllerIp, ControllerPort, 3000);
                                if (success)
                                {
                                    reconnectAttempt = 0;
                                    connectionLossReported = false;
                                    robotConnectedByThisSession = true;
                                    realControllerByThisSession = true;
                                    await SendAsync(new { type = "controllerReconnected", success = true, message });
                                }
                            }
                        }
                    }
                    int remaining = sampleIntervalMs - checked((int)Math.Min(int.MaxValue, Environment.TickCount64 - cycleStart));
                    if (remaining > 0) await Task.Delay(remaining, sessionCancellation.Token);
                    else await Task.Yield();
                }
            }
        }
        catch (OperationCanceledException)
        {
        }
        catch (WebSocketException)
        {
        }
        catch (InvalidDataException exception)
        {
            try { await SendAsync(new { type = "error", message = exception.Message }); } catch { }
        }
        finally
        {
            sessionCancellation.Cancel();
            Interlocked.Exchange(ref streaming, 0);
            if (robotConnectedByThisSession) robot.Disconnect();
            Interlocked.Exchange(ref activeClient, 0);
            if (socket.State == WebSocketState.Open)
            {
                try { await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "3D simulation disconnected", CancellationToken.None); }
                catch { }
            }
        }
    }

    private static bool AuthenticateHello(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return false;
        try
        {
            using JsonDocument document = JsonDocument.Parse(json);
            JsonElement root = document.RootElement;
            return root.ValueKind == JsonValueKind.Object
                && root.TryGetProperty("type", out JsonElement type)
                && type.GetString() == "hello"
                && root.TryGetProperty("token", out JsonElement token)
                && token.GetString() == PairingToken;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static int ReadBoundedInt(JsonElement root, string propertyName, int minimum, int maximum, int fallback = -1)
    {
        if (!root.TryGetProperty(propertyName, out JsonElement value))
        {
            if (fallback >= 0) return fallback;
            throw new ArgumentOutOfRangeException(propertyName);
        }
        if (!value.TryGetInt32(out int parsed) || parsed < minimum || parsed > maximum)
            throw new ArgumentOutOfRangeException(propertyName);
        return parsed;
    }

    private static async Task<string?> ReceiveMessageAsync(
        WebSocket socket,
        CancellationToken cancellationToken,
        TimeSpan? timeout = null)
    {
        byte[] receiveBuffer = new byte[4096];
        using MemoryStream messageBuffer = new();
        using CancellationTokenSource? timeoutSource = timeout is null
            ? null
            : CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        if (timeoutSource is not null)
            timeoutSource.CancelAfter(timeout.GetValueOrDefault());
        CancellationToken receiveToken = timeoutSource?.Token ?? cancellationToken;
        while (true)
        {
            WebSocketReceiveResult result = await socket.ReceiveAsync(receiveBuffer, receiveToken);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            if (result.MessageType != WebSocketMessageType.Text) throw new InvalidDataException("Only text WebSocket commands are supported.");
            if (messageBuffer.Length + result.Count > MaxMessageBytes) throw new InvalidDataException("Command message is too large.");
            messageBuffer.Write(receiveBuffer, 0, result.Count);
            if (result.EndOfMessage) return Encoding.UTF8.GetString(messageBuffer.ToArray());
        }
    }

    private static async Task CloseForPolicyAsync(WebSocket socket, WebSocketCloseStatus status, string description)
    {
        if (socket.State != WebSocketState.Open) return;
        try { await socket.CloseAsync(status, description, CancellationToken.None); }
        catch { }
    }
}
