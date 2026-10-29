# image-to-editable-ppt: cloud setup

Installed unmodified from ningzimu/image-to-editable-ppt-skill at commit
b7be494e31a0ed56ef98716891db5474606b8cdf into
`/workspace/onlinecodex/.agents/skills/image-to-editable-ppt`.
All 38 upstream files are included; upstream MIT license is in UPSTREAM-LICENSE.

## Commands

```bash
cd /workspace/onlinecodex
source /workspace/.venvs/editppt/bin/activate
editppt --help
editppt doctor --json
python -m pip check
```

Reinstall: `bash cloud-setup/install-image-to-editable-ppt.sh`.
The same complete script and startup instructions were saved to the environment
configuration draft. Review/save in environment settings, then publish the environment
to retain the prepared filesystem for new tasks. Fresh-task restoration and automatic
skill discovery have not yet been tested. No Git commit or push was made.

## Verification

- 38 source files match upstream SHA-256 hashes (skill-files.sha256).
- 31 Python source files parse successfully.
- CLI help and doctor pass; six required import checks pass.
- pip check passes; repeat installation passes.
- 19 upstream quality-contract tests pass (no input conversion).
- LibreOffice, Poppler, XeLaTeX, ImageMagick, Tesseract executable checks pass.
- No actual image conversion, image generation/editing, OCR upload, or PPT conversion executed.

## Capabilities and alternatives

| Feature | Observed status | Limit or alternative |
| --- | --- | --- |
| Built-in image generation/editing | image_gen.imagegen tool provided | Actual request deliberately untested; recheck in each new task |
| CLI image fallback | Codex OAuth configured according to doctor | Actual API request/allowance untested; use built-in tool first |
| Multi-agent | collaboration spawn/message/wait tools provided | No worker spawned during setup; recheck each task. Without workers use a capable environment or independent single-page runs |
| Offline hints | Python dependencies installed | Geometry only; no recognized text |
| PaddleOCR | No token configured | Optional secure PADDLE_OCR_TOKEN binding and paddleocr.aistudio-app.com network access needed; never supply token in chat |
| Local OCR aid | Tesseract eng/osd installed | Manual aid, not a drop-in PaddleOCR backend; Korean requires kor model |
| Formula rendering | XeLaTeX and ImageMagick present | Not rendered during setup; dvisvgm/pdf2svg absent. Install one for SVG, or request PDF output; PNG PDF-policy behavior untested |

Activate the venv in each shell, or use the absolute editppt executable path.
Agent tools cannot be installed or guaranteed by a Python package. Do not copy runtime
credentials into this repository. No network allowlist changes or new secret requirements
were saved because the optional external backends were not enabled.
