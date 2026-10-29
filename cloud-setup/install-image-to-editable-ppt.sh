#!/usr/bin/env bash
set -euo pipefail
cd /workspace/onlinecodex
skill=.agents/skills/image-to-editable-ppt
# Fidelity v2 is maintained in this repository. Never fetch/copy the upstream skill here.
test -f "$skill/FIDELITY_VERSION" || { echo 'Select fidelity-v2 branch or restore the prepared snapshot; refusing upstream replacement.' >&2; exit 1; }
venv=/workspace/.venvs/editppt
if [ ! -x "$venv/bin/python" ]; then python3 -m venv "$venv"; fi
"$venv/bin/python" -m pip install -e "$skill/cli"
"$venv/bin/python" -m pip check
"$venv/bin/editppt" fidelity --help
"$venv/bin/python" -m unittest discover -s tests -p test_fidelity.py
