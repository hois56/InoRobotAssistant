using InoRobot_Project_Gen_for_SDC.Generators;
using InoRobot_Project_Gen_for_SDC.Models;

if (args.Length != 1) throw new ArgumentException("Output folder is required.");

string output = Path.GetFullPath(args[0]);
Directory.CreateDirectory(output);
string data = Path.Combine(output, "Data");
Directory.CreateDirectory(data);

var steps = new List<ProcessStep>
{
    new() { No = 1, WorkType = "Tray", WorkMethod = "Get", ToolType = "Vacuum" },
    new() { No = 2, WorkType = "Stage", WorkMethod = "Put", ToolType = "Vacuum" },
    new() { No = 3, WorkType = "Vision", WorkMethod = "Calibration", ToolType = "Vision (Socket)" }
};
var options = new ProjectOptions();

new ProgramGenerator().GenerateAll(output, "GeneratorSample", steps, options);
new DataFileGenerator().GenerateAll(data, steps);

Console.WriteLine($"Generated: {output}");
Console.WriteLine($"Programs: {Directory.GetFiles(output, "*.pro").Length}");
Console.WriteLine($"Data: {Directory.GetFiles(data).Length}");
