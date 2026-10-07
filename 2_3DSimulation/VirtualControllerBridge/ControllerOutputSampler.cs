namespace InoRobotVirtualControllerBridge;

// Spread optional IO reads across position samples instead of delaying one
// sample with a complete scan. Published dictionaries are immutable snapshots.
internal sealed class ControllerOutputSampler
{
    private const long ReadIntervalMs = 3;
    private long _nextReadAt;
    private int _nextIndex;
    private Dictionary<int, int> _values = new();

    public IReadOnlyDictionary<int, int> Values => _values;

    public void Update(long now, Func<int, int?> read)
    {
        if (now < _nextReadAt)
            return;

        int index = _nextIndex;
        _nextIndex = (index + 1) % 17;
        _nextReadAt = now + ReadIntervalMs;
        try
        {
            int? result = read(index);
            if (result is null)
                return;
            int value = result.Value == 0 ? 0 : 1;
            if (_values.TryGetValue(index, out int previous) && previous == value)
                return;
            _values = new Dictionary<int, int>(_values) { [index] = value };
        }
        catch
        {
            // Retain the last known value when optional IO feedback fails.
        }
    }

    public void Reset()
    {
        _nextReadAt = 0;
        _nextIndex = 0;
        _values = new();
    }
}
