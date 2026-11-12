# Personal Magic Studio autonomous loop

For the editing-engine task, read `docs/loop-engineering/PRD.md`, `tasks.md`, `state.json` and the last attempt log before continuing. Run `python scripts/pms-loop.py status`; recover interrupted attempts with `recover`. Preserve consumed attempts and checkpoints. Use existing app AGENTS.md and tests. Make a verified commit per successful stage and update checkpoint on the next stage. Stop at 24 attempts or three consecutive failures of the same cause. Never mark an unmet gate passed. Saved real Gemini responses are replay evidence, not fresh API calls; manual inventories and synthetic cases are separate. Only the authorized Preview branch may be pushed; main/production, credentials, protection and paid API scope stay unchanged.

## Authorized UX-quality follow-up (2026-11-11)
The latest user request authorizes a separate maximum 12-attempt loop from f5db094.
Read ux-PRD.md, ux-tasks.md and ux-state.json in docs/loop-engineering.
Use `python scripts/pms-ux-loop.py` with the same reserve/recover/three-failures rules.
Keep old state.json and old logs immutable. UX logs are evidence/studio/ux-loop.


## Shared AI development team (2026-11-12)
For new feature requests, complex bugs, architectural work, or explicit "AI team" requests,
use `.agents/skills/ai-dev-team/SKILL.md` and `docs/ai-team/TEAM-STANDARD.md`.
The lead agent coordinates planner -> independent reviewer -> implementer -> independent QA.
Use real Codex subagents in `.codex/agents/` when available; never claim separate
agent review without an actual separate review. Keep routine one-step edits lightweight.
For failures follow `.agents/skills/bug-investigation/SKILL.md`.
This is a process layer, **not** permission to restart or rewrite the existing
24-attempt or 12-attempt PMS loops. Existing loop state, checkpoints, test gates,
app-specific AGENTS.md, and Preview-only protections take precedence.
Do not change main/Production, credentials, paid APIs, or user data without
explicit authorization; testing and evidence are mandatory before a completion claim.

## Stopped editor UX prototype (2026-11-12 KST)
Read docs/loop-engineering/editor-state.json and editor-REPORT.md. New editor loop stopped8/12 after three identical text parity failures; no automatic resume. Preview contains reports/evidence only; editor application changes are NOT deployed. Archived bundle/patch preserve local checkpoints. Do not apply or release the prototype without a new explicit task and required regression/build verification. Preserve both previous loop state files.
