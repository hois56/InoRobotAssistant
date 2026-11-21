"""Offline smoke tests for the debugger release wrapper. All ZIP executables are fake."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent
SHELL = shutil.which("pwsh") or shutil.which("powershell")
BASE = "https://github.com/hois56/InoRobotAssistant/releases/download/"
TOOLS = {
    "communicationTester": ("CommunicationTester", "InoRobot_Comm_Test", True),
    "labelGenerator": ("InoRobotLabelGen", "InoRobot_Label_Gen", False),
    "trace": ("Trace", "InoRobotTrace", False),
    "logAnalyzer": ("InoRobotLogAnalyzer", "InoDiagAnalyzer", True),
    "projectCompare": ("ProjectCompare", "InoRobot_Compare_Project", False),
    "cadLightweight": ("CADLightweight", "CAD_Lightweight", True),
}


@unittest.skipUnless(SHELL, "PowerShell is required to test the release wrapper")
class StageReleaseTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="debug-stage-test-")
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        self.site = self.root / "fixture site #1"
        self.debug = self.site / "7_DebuggingTool"
        html = []
        assets = []
        for tool, (folder, prefix, remote) in TOOLS.items():
            old_zip = f"{prefix}_V1.0.zip"
            href = f"{BASE}old-{tool}/{old_zip}" if remote else f"{folder}/{old_zip}"
            html.append(
                f'<div><span class="version">V1.0</span><button data-debug-history="{tool}" '
                f'data-current-version="V1.0">History</button></div>'
                f'<a href="{href}" class="download-button">Download</a>\n'
            )
            history = "업데이트기록.md" if tool == "labelGenerator" else "업데이트_기록.md"
            p = self.debug / folder / history
            p.parent.mkdir(parents=True)
            p.write_text("## History\n\n### Ver 1.0 (2026.11.01)\n\n- Old\n", encoding="utf-8")
            if remote:
                assets.append({
                    "paths": [f"7_DebuggingTool/{folder}/{old_zip}"],
                    "fileName": old_zip, "url": href, "size": 123, "sha256": "1" * 64,
                })
        (self.debug / "index.html").write_text("".join(html), encoding="utf-8")
        manifest = self.site / "downloads" / "release-assets.json"
        manifest.parent.mkdir()
        manifest.write_text(json.dumps({
            "schemaVersion": 1, "repository": "hois56/InoRobotAssistant",
            "tag": "migration-tag", "assets": assets,
        }), encoding="utf-8")
        self.input = self.root / "verified build #1.zip"
        self.fixture_tools = self.site / "tools"
        self.fixture_tools.mkdir()
        for name in ("Stage-DebugRelease.ps1", "prepare-debug-release.py"):
            shutil.copyfile(HERE / name, self.fixture_tools / name)

    def snapshot(self):
        return {p.relative_to(self.site): p.read_bytes() for p in self.site.rglob("*") if p.is_file()}

    def make_zip(self, tool, exe_version="2.1.3", extra=None, sdk=True):
        with zipfile.ZipFile(self.input, "w") as z:
            prefix = TOOLS[tool][1]
            z.writestr(f"{prefix}_V{exe_version}/{prefix}_V{exe_version}.exe", b"MZ_fake_exe")
            if tool == "trace" and sdk:
                z.writestr(f"{prefix}_V{exe_version}/IMC100API.dll", b"fake_sdk")
            if extra:
                z.writestr(extra, b"malformed fixture")
        return hashlib.sha256(self.input.read_bytes()).hexdigest()

    def call_stage(self, tool, digest, out, current="1.0", tag=None):
        args = [
            SHELL, "-NoProfile", "-NonInteractive", "-File", str(self.fixture_tools / "Stage-DebugRelease.ps1"),
            "-Tool", tool, "-CurrentVersion", current, "-Version", "2.1.3", "-Zip", str(self.input),
            "-Sha256", digest, "-Date", "2026-11-21", "-Note", "Synthetic change only",
            "-Out", str(out), "-PythonPath", sys.executable,
        ]
        if tag is not None:
            args += ["-Tag", tag]
        return subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30)

    def test_stages_all_six_without_changing_sources(self):
        before = self.snapshot()
        for tool, (folder, prefix, remote) in TOOLS.items():
            with self.subTest(tool=tool):
                digest = self.make_zip(tool)
                out = self.root / tool
                result = self.call_stage(tool, digest, out, tag=f"new-{tool}" if remote else None)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                plan = json.loads((out / "release-plan.json").read_text(encoding="utf-8"))
                self.assertEqual(plan["status"], "LOCAL_CANDIDATE_ONLY")
                self.assertEqual(plan["sha256"], digest)
                self.assertEqual((out / plan["stagedArtifact"]).read_bytes(), self.input.read_bytes())
                candidate = out / "site-candidate"
                card = (candidate / "7_DebuggingTool" / "index.html").read_text(encoding="utf-8")
                self.assertEqual(card.count('data-current-version="V2.1.3"'), 1)
                self.assertIn(plan["href"], card)
                self.assertIn(f"{prefix}_V2.1.3.zip", (out / "review.diff").read_text(encoding="utf-8"))
                manifest = candidate / "downloads" / "release-assets.json"
                if remote:
                    revised = json.loads(manifest.read_text(encoding="utf-8"))
                    self.assertEqual(revised["tag"], "migration-tag")
                    self.assertEqual(revised["assets"][-1]["sha256"], digest)
                    self.assertEqual(revised["assets"][-1]["url"], plan["href"])
                else:
                    self.assertFalse(manifest.exists())
                    self.assertIn(f"site-candidate/7_DebuggingTool/{folder}/", plan["stagedArtifact"])
        self.assertEqual(self.snapshot(), before)

    def test_rejects_wrong_artifact_identity_and_missing_dependency(self):
        samples = (
            ("trace", self.make_zip("trace", sdk=False), "IMC100API.dll"),
            ("projectCompare", None, "must contain exactly one executable"),
            ("logAnalyzer", None, "SHA-256 does not match"),
        )
        for tool, digest, reason in samples:
            with self.subTest(tool=tool):
                if tool == "projectCompare":
                    digest = self.make_zip(tool, exe_version="2.1.4")
                if tool == "logAnalyzer":
                    self.make_zip(tool)
                    digest = "0" * 64
                out = self.root / f"rejected-{tool}"
                result = self.call_stage(tool, digest, out)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(reason, result.stdout + result.stderr)
                self.assertFalse(out.exists())

    def test_rejects_unsafe_zip_paths(self):
        for i, member in enumerate(("../escape.txt", "app/NUL.txt")):
            with self.subTest(member=member):
                digest = self.make_zip("labelGenerator", extra=member)
                out = self.root / f"unsafe-{i}"
                self.assertNotEqual(self.call_stage("labelGenerator", digest, out).returncode, 0)
                self.assertFalse(out.exists())

    def test_rejects_catalog_drift_and_wrong_tag(self):
        tool = "cadLightweight"
        digest = self.make_zip(tool)
        out = self.root / "rejected"
        self.assertNotEqual(self.call_stage(tool, digest, out, current="1.1", tag="new").returncode, 0)
        self.assertNotEqual(self.call_stage(tool, digest, out).returncode, 0)
        self.assertFalse(out.exists())

    def test_rejects_existing_or_live_site_output(self):
        tool = "labelGenerator"
        digest = self.make_zip(tool)
        live = self.site / "forbidden"
        self.assertNotEqual(self.call_stage(tool, digest, live).returncode, 0)
        self.assertFalse(live.exists())
        existing = self.root / "existing"
        existing.mkdir()
        (existing / "marker").write_text("preserved", encoding="utf-8")
        self.assertNotEqual(self.call_stage(tool, digest, existing).returncode, 0)
        self.assertEqual(sorted(p.name for p in existing.iterdir()), ["marker"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
