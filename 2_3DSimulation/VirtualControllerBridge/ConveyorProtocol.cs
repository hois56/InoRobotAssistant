using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace InoRobotVirtualControllerBridge;

// Same little-endian ABI as K14 tools/conveyor/web_protocol.h.
internal static class ConveyorProtocol
{
    public const uint Magic = 0x34314B43;
    public const int HeaderSize = 152;
    public const int ReplySize = 48;
    public const int MaxBytes = 60000;
    public sealed record Request(byte[] Bytes, string Session, int Conveyor, ulong Sequence);
    public sealed record Reply(uint Status, uint Flags, ulong Sequence, ulong EventId, long Encoder, uint Objects, uint Sensors);

    private static long Integer(JsonElement root, string key, long minimum, long maximum)
    {
        if (!root.TryGetProperty(key, out JsonElement item) || !item.TryGetInt64(out long value)
            || value < minimum || value > maximum) throw new ArgumentException($"Invalid conveyor {key}.");
        return value;
    }
    private static int SensorAddress(JsonElement sensor)
    {
        int address = (int)Integer(sensor, "address", 0, 2559);
        if (address > 64 && address < 512) throw new ArgumentException("Invalid conveyor sensor address.");
        return address;
    }
    private static double Number(JsonElement root, string key, double minimum, double maximum)
    {
        if (!root.TryGetProperty(key, out JsonElement item) || !item.TryGetDouble(out double value)
            || !double.IsFinite(value) || value < minimum || value > maximum) throw new ArgumentException($"Invalid conveyor {key}.");
        return value;
    }
    private static long Encoder(JsonElement root, double position, double scale)
    {
        if (!root.TryGetProperty("encoder", out JsonElement value) || value.ValueKind != JsonValueKind.String
            || !Regex.IsMatch(value.GetString() ?? "", @"^-?(0|[1-9][0-9]{0,15})$")
            || !long.TryParse(value.GetString(), NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out long count)
            || Math.Abs((double)count) > 9007199254740991 || Math.Abs(position * scale - count) > 1.01)
            throw new ArgumentException("Conveyor encoder/position mismatch.");
        return count;
    }
    private static JsonElement Array(JsonElement root, string key, int maximum)
    {
        if (!root.TryGetProperty(key, out JsonElement array) || array.ValueKind != JsonValueKind.Array || array.GetArrayLength() > maximum)
            throw new ArgumentException($"Invalid conveyor {key}.");
        return array;
    }

    public static Request Encode(JsonElement frame)
    {
        if (frame.ValueKind != JsonValueKind.Object) throw new ArgumentException("Conveyor frame required.");
        Integer(frame, "version", 1, 1);
        string session = frame.GetProperty("session").GetString() ?? "";
        if (!Regex.IsMatch(session, @"^[a-zA-Z0-9_-]{1,64}$")) throw new ArgumentException("Invalid conveyor session.");
        int conveyor = (int)Integer(frame, "conveyor", 0, 3);
        ulong sequence = (ulong)Integer(frame, "sequence", 1, 9007199254740991);
        double time = Number(frame, "time", 0, 1e9), position = Number(frame, "position", -1e9, 1e9);
        double scale = Number(frame, "countsPerMm", 0.00001, 1e9), velocity = Number(frame, "velocity", -5000, 5000);
        long encoder = Encoder(frame, position, scale);
        JsonElement sensors = Array(frame, "sensors", 32), events = Array(frame, "events", 500);
        using MemoryStream buffer = new();
        using BinaryWriter writer = new(buffer, Encoding.UTF8, true);
        writer.Write(Magic); writer.Write(0u); writer.Write((ushort)1); writer.Write((ushort)1); writer.Write(conveyor);
        writer.Write(SHA256.HashData(Encoding.UTF8.GetBytes(session)));
        writer.Write(sequence); writer.Write(time); writer.Write(position); writer.Write(scale); writer.Write(velocity); writer.Write(encoder);
        writer.Write(events.GetArrayLength()); writer.Write(sensors.GetArrayLength());
        JsonElement captureOffset = Array(frame, "captureOffset", 6);
        if (captureOffset.GetArrayLength() != 6) throw new ArgumentException("Conveyor frame needs six coordinates.");
        foreach (JsonElement component in captureOffset.EnumerateArray())
        {
            if (!component.TryGetDouble(out double number) || !double.IsFinite(number) || Math.Abs(number) > 1e9)
                throw new ArgumentException("Invalid conveyor frame coordinate.");
            writer.Write(number);
        }
        HashSet<int> addresses = new();
        foreach (JsonElement sensor in sensors.EnumerateArray())
        {
            int address = SensorAddress(sensor);
            if (!addresses.Add(address)) throw new ArgumentException("Duplicate sensor input.");
            writer.Write(address); writer.Write((uint)Integer(sensor, "value", 0, 1));
        }
        long previousId = 0;
        foreach (JsonElement entry in events.EnumerateArray())
        {
            long id = Integer(entry, "id", previousId + 1, 9007199254740991); previousId = id;
            double eventTime = Number(entry, "time", 0, time);
            double eventPosition = Number(entry, "position", -1e9, 1e9);
            long eventEncoder = Encoder(entry, eventPosition, scale);
            string kind = entry.GetProperty("kind").GetString() ?? "";
            int address = 0, value = 0, count = 0; JsonElement objects = default;
            if (kind == "sensor")
            {
                address = SensorAddress(entry); value = (int)Integer(entry, "value", 0, 1);
                if (!addresses.Contains(address)) throw new ArgumentException("Unmapped sensor event.");
            }
            else if (kind == "vision") { objects = Array(entry, "objects", 500); count = objects.GetArrayLength(); address = (int)Integer(entry, "requestId", 0, int.MaxValue); }
            else throw new ArgumentException("Unknown conveyor event.");
            writer.Write((ulong)id); writer.Write(kind == "sensor" ? 1u : 2u); writer.Write(count);
            writer.Write(eventTime); writer.Write(eventPosition); writer.Write(eventEncoder); writer.Write(address); writer.Write(value);
            if (kind == "vision") foreach (JsonElement item in objects.EnumerateArray())
            {
                writer.Write((uint)Integer(item, "type", 0, 15)); writer.Write(0u);
                JsonElement pose = Array(item, "pose", 6);
                if (pose.GetArrayLength() != 6) throw new ArgumentException("Vision pose needs six coordinates.");
                foreach (JsonElement coordinate in pose.EnumerateArray())
                {
                    if (!coordinate.TryGetDouble(out double number) || !double.IsFinite(number) || Math.Abs(number) > 1e9)
                        throw new ArgumentException("Invalid vision pose.");
                    writer.Write(number);
                }
            }
            if (buffer.Length > MaxBytes) throw new ArgumentException("Conveyor frame exceeds transport capacity.");
        }
        writer.Flush(); buffer.Position = 4; writer.Write((uint)buffer.Length);
        return new(buffer.ToArray(), session, conveyor, sequence);
    }

    public static string RejectionMessage(Reply reply)
    {
        if (reply.Status == 0) return "";
        if (reply.Status == 170) return reply.Flags switch
        {
            1 => "로봇랩의 가상 컨베이어를 정지한 뒤 다시 연동하세요. (170/운전 중)",
            2 => "K14 컨베이어에 이전 대기 물체가 남아 있습니다. 로봇 프로그램의 물체 처리를 마치거나 가상 컨베이어 창에서 물체 큐를 비운 뒤 다시 연동하세요. (170/대기 물체)",
            3 => "로봇이 컨베이어를 추종 중입니다. 추종 동작을 끝낸 뒤 다시 연동하세요. (170/추종 중)",
            4 => "다른 웹 연결이 이 컨베이어를 사용 중입니다. 기존 연동을 해제한 뒤 다시 연결하세요. (170/다른 연결)",
            5 => "선택한 센서 입력을 다른 컨베이어가 사용 중입니다. 센서 입력 번호를 바꾸거나 기존 연동을 해제하세요. (170/입력 중복)",
            6 => "K14의 TCP 비전과 웹 센서 자동 촬영이 동시에 사용 중입니다. 웹의 센서 감지 시 자동 촬영을 해제하거나 K14의 TCP 비전을 끈 뒤 다시 연동하세요. (170/비전 중복)",
            _ => "K14가 컨베이어 연동을 거부했습니다. 가상 컨베이어 운전·대기 물체·추종 상태와 다른 웹/비전 연결을 확인하세요. (170)"
        };
        return $"K14 conveyor rejected the frame ({reply.Status}).";
    }

    public static Reply Decode(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length != ReplySize) throw new InvalidDataException("Incomplete K14 conveyor reply.");
        using var reader = new BinaryReader(new MemoryStream(bytes.ToArray()));
        if (reader.ReadUInt32() != Magic || reader.ReadUInt32() != 1) throw new InvalidDataException("K14 conveyor protocol mismatch.");
        return new(reader.ReadUInt32(), reader.ReadUInt32(), reader.ReadUInt64(), reader.ReadUInt64(), reader.ReadInt64(), reader.ReadUInt32(), reader.ReadUInt32());
    }
}
