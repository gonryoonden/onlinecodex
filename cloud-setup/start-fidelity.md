Use the existing /workspace/onlinecodex checkout; each task is isolated. Do not create a worktree unless explicitly requested.
Select the fidelity-v2 branch (or its published snapshot) before starting. Check .agents/skills/image-to-editable-ppt/FIDELITY_VERSION.
Run bash cloud-setup/install-image-to-editable-ppt.sh if the CLI is missing, then source /workspace/.venvs/editppt/bin/activate.
Read .agents/skills/image-to-editable-ppt/SKILL.md and references/fidelity-v2.md for conversions.
Run bash cloud-setup/test-fidelity.sh for code changes. No background services required.
Never replace this checkout's skill with the upstream installation script. Version rollback: extract vendor/upstream/image-to-editable-ppt-b7be494.tar.gz into a separate directory and install its cli in a separate venv; do not overwrite local changes. v1 output/result.pptx remains unchanged. New-task restoration has not yet been verified.
