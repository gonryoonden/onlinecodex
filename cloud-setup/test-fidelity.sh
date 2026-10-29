#!/usr/bin/env bash
set -euo pipefail
cd /workspace/onlinecodex
python=/workspace/.venvs/editppt/bin/python
fixture=$(mktemp -d /tmp/editppt-regression.XXXXXX)
trap 'rm -rf "$fixture"' EXIT
mkdir -p "$fixture/skills"
cp -r .agents/skills/image-to-editable-ppt "$fixture/skills/"
cp -r tests/upstream "$fixture/tests"
# Script inventory scans these optional root docs.
printf '# Test fixture\n' > "$fixture/README.md"
printf '# Test fixture\n' > "$fixture/README_en.md"
"$python" -m unittest discover -s "$fixture/tests"
"$python" -m unittest discover -s tests -p test_fidelity.py
