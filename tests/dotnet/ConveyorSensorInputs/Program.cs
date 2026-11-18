using System.Text.Json;
using InoRobotVirtualControllerBridge;

static byte[] Encode(int address, int? eventAddress = null) {
    var frame = new { version = 1, session = "sensor-input", conveyor = 0, sequence = 1, time = .02, position = 20, countsPerMm = 1000, velocity = 1000, encoder = "20000", captureOffset = new double[6],
        sensors = new[] { new { address, value = 0 } },
        events = new[] { new { id = 1, kind = "sensor", time = .008, position = 8, encoder = "8000", address = eventAddress ?? address, value = 1 } } };
    return ConveyorProtocol.Encode(JsonSerializer.SerializeToElement(frame)).Bytes;
}
foreach (int address in new[] { 0, 1, 64, 512, 2559 }) {
    byte[] bytes = Encode(address);
    if (BitConverter.ToInt32(bytes, ConveyorProtocol.HeaderSize) != address || BitConverter.ToInt32(bytes, ConveyorProtocol.HeaderSize + 8 + 40) != address)
        throw new Exception("Sensor address changed during encoding");
}
foreach (int address in new[] { -1, 65, 511, 2560 }) {
    try { Encode(address); throw new Exception("Invalid input accepted"); } catch (ArgumentException) { }
    try { Encode(0, address); throw new Exception("Invalid event input accepted"); } catch (ArgumentException) { }
}
Console.WriteLine("Conveyor sensor input checks passed");

foreach (uint reason in new uint[] { 1, 2, 3, 4, 5, 6 }) {
    string message = ConveyorProtocol.RejectionMessage(new ConveyorProtocol.Reply(170, reason, 0, 0, 0, 0, 0));
    if (!message.Contains("170/") || !message.Contains("하세요") && !message.Contains("뒤")) throw new Exception("Missing actionable rejection reason");
}
if (ConveyorProtocol.RejectionMessage(new ConveyorProtocol.Reply(0, 42, 1, 0, 0, 0, 0)) != "") throw new Exception("Camera request flags interpreted as failure");
Console.WriteLine("Conveyor rejection reason checks passed");
