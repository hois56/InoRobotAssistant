using InoRobotVirtualControllerBridge;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
}

var sampler = new ControllerOutputSampler();
var indices = new List<int>();
int? Read(int index) { indices.Add(index); return index % 2; }
sampler.Update(0, Read);
var firstSnapshot = sampler.Values;
sampler.Update(1, Read);
sampler.Update(2, Read);
Check(indices.Count == 1, "IO polling must respect its interval");
for (int frame = 1; frame < 17; frame++)
{
    int before = indices.Count;
    sampler.Update(frame * 4, Read);
    Check(indices.Count == before + 1, "A position frame must read only one output");
}
Check(indices.SequenceEqual(Enumerable.Range(0, 17)), "Every mapped output must be read, including Out16");
Check(sampler.Values.Count == 17 && sampler.Values[0] == 0 && sampler.Values[1] == 1, "Both OFF and ON feedback must survive");
Check(firstSnapshot.Count == 1, "Earlier frame snapshots must not be modified");
sampler.Update(68, _ => null);
sampler.Update(72, _ => throw new IOException("Optional read failed"));
Check(sampler.Values[0] == 0 && sampler.Values[1] == 1, "Failed reads must retain last feedback");
sampler.Update(10000, Read);
Check(indices.Count == 18 && indices[^1] == 2, "A late frame must not catch up with a burst scan");
sampler.Reset();
Check(sampler.Values.Count == 0, "Reconnect must clear stale IO feedback");
sampler.Update(0, Read);
Check(indices[^1] == 0 && sampler.Values.Count == 1, "Reconnect must restart at Out0");
Console.WriteLine("Output scheduling checks passed");
