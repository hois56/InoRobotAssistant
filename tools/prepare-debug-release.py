#!/usr/bin/env python3
"""InoRobot Assistant 디버깅 ZIP 배포 준비. Python 3.10+, 외부 패키지 없음.
검증을 마친 ZIP만 명시적으로 선택한다. 사이트 원본과 인터넷은 건드리지 않는다.
사용 예: py prepare-debug-release.py --site "D:/경로/InoRobotAssistant"
  --tool communicationTester --current 4.0 --version 5.0 --zip "D:/경로/검증본.zip"
  --sha256 <검증기록의 SHA256> --tag communication-tester-v5.0
  --date 2026-11-21 --note "사용자에게 보이는 변경" --out "D:/release/comm-5.0"
실제 실행할 땐 예시를 한 줄로 입력한다. --tag는 GitHub 릴리스 도구에만 사용한다.
변경 후보 적용·공개 전에 review.diff와 release-plan.json을 확인한다.
"""
import argparse
import datetime
import difflib
import hashlib
import json
from pathlib import Path
import re
import stat
import shutil
import tempfile
import zipfile

ROOT = "7_DebuggingTool"
REPO = "hois56/InoRobotAssistant"
GH = f"https://github.com/{REPO}/releases/download/"
MANIFEST = "downloads/release-assets.json"
TOOLS = {
    "communicationTester": ("CommunicationTester", "InoRobot_Comm_Test", True),
    "labelGenerator": ("InoRobotLabelGen", "InoRobot_Label_Gen", False),
    "trace": ("Trace", "InoRobotTrace", False),
    "logAnalyzer": ("InoRobotLogAnalyzer", "InoDiagAnalyzer", True),
    "projectCompare": ("ProjectCompare", "InoRobot_Compare_Project", False),
    "cadLightweight": ("CADLightweight", "CAD_Lightweight", True),
}
VER = r"(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){1,2}"

def check(condition, why):
    if not condition:
        raise ValueError(why)

def version(v):
    check(re.fullmatch(VER, v), f"버전 형식 오류: {v}")
    return tuple(int(c) for c in (v.split(".") + ["0"])[:3])

def read(path):
    return path.read_bytes().decode("utf-8")

def hash_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

def verify_zip(path):
    check(path.is_file() and path.suffix.lower() == ".zip", "ZIP 파일이 필요함")
    with zipfile.ZipFile(path) as z:
        seen, exes, size = set(), [], 0
        for entry in z.infolist():
            name = entry.orig_filename
            parts = name.rstrip("/").split("/")
            check(name == entry.filename and not re.search(r'[\\:\x00-\x1f]', name)
                  and all(p not in {"", ".", ".."} and p == p.rstrip(" .") for p in parts),
                  f"안전하지 않은 ZIP 경로: {name!r}")
            key = name.rstrip("/").casefold()
            check(key not in seen and not stat.S_ISLNK(entry.external_attr >> 16)
                  and not entry.flag_bits & 1, f"중복/링크/암호화 ZIP 항목: {name}")
            seen.add(key)
            size += entry.file_size
            if not entry.is_dir() and key.endswith(".exe"):
                exes.append(entry)
        check(0 < size <= 2_000_000_000, "지원 범위를 넘는 ZIP 크기")
        check(len(exes) == 1, "EXE가 하나인 배포 ZIP만 지원. 여러 EXE 구성은 별도 검토")
        with z.open(exes[0]) as f:
            check(f.read(2) == b"MZ", "EXE 형식 확인 실패")
        check(z.testzip() is None, "ZIP 무결성 확인 실패")
        return exes[0].filename

def stage(a):
    site, out = Path(a.site).resolve(), Path(a.out).resolve()
    source = Path(a.zip).resolve()
    check(out != site and site not in out.parents and not out.exists(), "사이트 폴더 밖의 새 출력 경로를 지정해")
    check(version(a.version) > version(a.current), "새 버전은 현재보다 높아야 함")
    check(re.fullmatch(r"[0-9a-fA-F]{64}", a.sha256), "검증 기록의 SHA-256 필요")
    check(a.note.strip() and not re.search(r"[\r\n]", a.note), "공개용 변경 사항 한 줄 필요")
    date = datetime.date.fromisoformat(a.date).strftime("%Y.%m.%d")
    folder, prefix, release = TOOLS[a.tool]
    check(bool(a.tag) == release, "GitHub Release 도구에만 --tag 지정")
    if release:
        check(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,100}", a.tag), "릴리스 태그 형식 오류")
    artifact = f"{prefix}_V{a.version}.zip"
    relative = f"{folder}/{artifact}"
    href = f"{GH}{a.tag}/{artifact}" if release else relative
    html_path = f"{ROOT}/index.html"
    html = read(site / html_path)
    pattern = (rf'(<span\b[^>]*>)V({VER})(</span>\s*<button\b[^>]*\bdata-debug-history="{a.tool}"\s+data-current-version=")'
               rf'V({VER})("[^>]*>.*?</button>\s*</div>\s*<a\s+href=")([^"]+)("(?=[^>]*class="download-button"))')
    matches = list(re.finditer(pattern, html, re.S))
    check(len(matches) == 1, "지정 도구의 카드 구조가 예상과 다름")
    m = matches[0]
    check(m[2] == m[4] == a.current, f"현재 버전 불일치: 카드 V{m[2]} / 기록 V{m[4]}")
    old_artifact = f"{prefix}_V{a.current}.zip"
    if release:
        check(re.fullmatch(re.escape(GH) + r"[A-Za-z0-9._-]+/" + re.escape(old_artifact), m[6]), "기존 GitHub 배포 경로 확인 필요")
        check(a.tag != m[6].split("/")[-2], "새 버전용 태그를 사용해")
    else:
        check(m[6] == f"{folder}/{old_artifact}", "기존 상대 다운로드 경로 확인 필요")
        check(not (site / ROOT / relative).exists(), "같은 새 버전 ZIP이 사이트 폴더에 이미 있음")
    html_new = html[:m.start()] + f"{m[1]}V{a.version}{m[3]}V{a.version}{m[5]}{href}{m[7]}" + html[m.end():]
    # The history data generator is run by the existing release workflow after review.
    history_name = "업데이트기록.md" if a.tool == "labelGenerator" else "업데이트_기록.md"
    history_path = f"{ROOT}/{folder}/{history_name}"
    history = read(site / history_path)
    heading = re.search(r"(?m)^### Ver\s+(" + VER + r")\b", history)
    check(heading and version(heading[1]) == version(a.current), "소스 버전 기록과 현재 카드가 다름")
    nl = "\r\n" if "\r\n" in history else "\n"
    history_new = history[:heading.start()] + f"### Ver {a.version} ({date}){nl}{nl}- {a.note.strip()}{nl}{nl}" + history[heading.start():]
    changed = {html_path: (html, html_new), history_path: (history, history_new)}
    exe = verify_zip(source)
    check(hash_file(source) == a.sha256.lower(), "검증 기록과 ZIP SHA-256 불일치")
    old_size = None
    if release:
        before = read(site / MANIFEST)
        manifest = json.loads(before)
        check(manifest["schemaVersion"] == 1 and manifest["repository"] == REPO, "지원하지 않는 배포 목록")
        assets = manifest["assets"]
        old = [it for it in assets if it["url"] == m[6]]
        check(len(old) == 1, "현재 다운로드가 배포 목록에 없음 또는 중복됨")
        old_size = old[0]["size"]
        check(not any(it["url"] == href or f"{ROOT}/{relative}" in it["paths"] for it in assets), "이미 등록된 파일/URL")
        assets.append({"paths": [f"{ROOT}/{relative}"], "fileName": artifact,
                       "size": source.stat().st_size, "sha256": a.sha256.lower(), "url": href})
        after = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        if "\r\n" in before:
            after = after.replace("\n", "\r\n")
        changed[MANIFEST] = (before, after)
    else:
        previous = site / ROOT / m[6]
        if previous.is_file():
            old_size = previous.stat().st_size
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix=".debug-stage-", dir=out.parent))
    try:
        changes = []
        for rel, (before, after) in changed.items():
            dest = tmp / "site-candidate" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(after.encode("utf-8"))
            changes += difflib.unified_diff(before.splitlines(keepends=True), after.splitlines(keepends=True),
                                            fromfile=f"a/{rel}", tofile=f"b/{rel}")
        (tmp / "review.diff").write_bytes("".join(changes).encode("utf-8"))
        target = (tmp / "release-asset" / artifact) if release else (tmp / "site-candidate" / ROOT / relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        check(hash_file(target) == a.sha256.lower(), "복사본 SHA-256 불일치")
        plan = {
            "status": "LOCAL_CANDIDATE_ONLY", "tool": a.tool, "previousVersion": a.current,
            "version": a.version, "href": href, "size": target.stat().st_size, "previousSize": old_size,
            "sha256": a.sha256.lower(), "stagedArtifact": target.relative_to(tmp).as_posix(),
            "exeInZip": exe, "targetSourceFileHashes": {
                rel: hashlib.sha256(before.encode("utf-8")).hexdigest() for rel, (before, _) in changed.items()
            },
            "beforePublishing": [
                ("GitHub draft: upload staged ZIP, verify remote size/digest, then publish via existing procedure."
                 if release else "Existing site-relative delivery: confirm this new ZIP will actually deploy (new ZIPs are git-ignored); do not point the live card at a missing ZIP."),
                "Recheck source hashes before applying reviewed candidate files.",
                "Update debugging-history-data.js cache key and applicable link test fixtures.",
                "Run node tools/sync-debugging-history-data.cjs and node tools/build-version-history.cjs; verify affected checks.",
                "Verify public download hash against the staged ZIP after authorized publish.",
            ],
        }
        (tmp / "release-plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        check(not out.exists(), "출력 경로가 이미 생겼음")
        tmp.rename(out)
    finally:
        if tmp.exists():
            shutil.rmtree(tmp)
    return out

def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--site", required=True)
    p.add_argument("--tool", choices=TOOLS, required=True)
    for key in ("current", "version", "zip", "sha256", "date", "note", "out"):
        p.add_argument("--" + key, required=True)
    p.add_argument("--tag")
    try:
        print(stage(p.parse_args()))
    except (OSError, ValueError, KeyError, TypeError, RuntimeError, zipfile.BadZipFile) as e:
        p.exit(1, f"배포 후보 생성 중단: {e}\n")

if __name__ == "__main__":
    main()
