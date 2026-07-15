# InoRobot Assistant translation guide

The site supports Korean, English, Simplified Chinese, and Vietnamese. The current translations are an initial working draft and can be revised without changing page code.

## Route and locale mapping

| Language | Landing route | Locale code |
| --- | --- | --- |
| Korean canonical | / | ko |
| Korean alternate | /kr/ | ko |
| English | /en/ | en |
| Simplified Chinese | /cn/ | zh-CN |
| Vietnamese | /vn/ | vi |

Tool pages use the numbered folders shown on the home page. A landing page stores the chosen locale in sessionStorage under inorobot.locale. Opening a tool page directly without a valid session value uses Korean.

## Files to edit

All translator-facing source files and generated landing pages are grouped under the correctly spelled `Language` directory. Each locale has its own subdirectory:

- ui.json: common text, page metadata, card text, filters, and short UI labels.
- project.json: Project Generator instructions, option help, chart labels, and preview UI.
- robot-tools.json: Robot Select, generated configuration PDF, Tool Selector, and Zero Calibration text.
- content-centers.json: Manual, Software, 3D Viewer, password prompts, and user-facing error messages.
- history.md: home-card update history.
- debug-history.md: debugging-tool version history.

Korean UI text is the source language. UPDATE_HISTORY.md and each debugging tool's existing Korean update-history file are the canonical Korean version records. The files in `Language/ko` preserve the same locale-file layout used by translators.

The shared browser runtime is in `Language/runtime`, and the common landing template is in `Language/templates`.

## Numbered tool folders

| Order | Website name | Folder |
| --- | --- | --- |
| 1 | Robot Model Select | `1_RobotModelSelect` |
| 2 | Robot 3D Viewer | `2_Robot3DViewer` |
| 3 | Tool Selector | `3_ToolSelector` |
| 4 | Project Generator | `4_ProjectGenerator` |
| 5 | Software | `5_Software` |
| 6 | Document | `6_Document` |
| 7 | Debugging Tool | `7_DebuggingTool` |

## Editing rules

1. Edit translation values only. Do not change JSON keys.
2. Preserve variables such as {count}, {model}, and {version} exactly.
3. Keep technical identifiers unchanged: model codes, protocol names, API names, filenames, extensions, order codes, Tool, Work Object, and robot code.
4. Preserve the headings in history.md exactly as Robot Model Select, Robot 3D Viewer, Robot Tool Selector, Project Generator, Software, Document, and Debugging Tool. The page uses them as section identifiers.
5. Preserve the debug-history.md section keys communicationTester, labelGenerator, trace, and projectCompare.
6. JSON files must remain UTF-8 and valid JSON. Markdown files must remain UTF-8.
7. Images, downloadable PDF/XLSX/ZIP/EXE files, and generated robot code are not translated. Translate their surrounding captions and alternative text only.

## Build and validation

Run:

    node tools/build-localized-site.cjs
    node tools/validate-localized-site.cjs

The build validates key shapes, data types, and variables before generating browser locale data, five landing pages, metadata, and sitemap.xml.

Do not edit these generated files directly:

- Language/runtime/locales-data.js
- Language/ko/index.html
- Language/kr/index.html
- Language/en/index.html
- Language/zh-CN/index.html
- Language/vi/index.html
- sitemap.xml

After editing a locale source, run both commands and commit the source and generated output together.
