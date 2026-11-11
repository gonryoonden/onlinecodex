# Personal Magic Studio autonomous loop

For the editing-engine task, read `docs/loop-engineering/PRD.md`, `tasks.md`, `state.json` and the last attempt log before continuing. Run `python scripts/pms-loop.py status`; recover interrupted attempts with `recover`. Preserve consumed attempts and checkpoints. Use existing app AGENTS.md and tests. Make a verified commit per successful stage and update checkpoint on the next stage. Stop at 24 attempts or three consecutive failures of the same cause. Never mark an unmet gate passed. Saved real Gemini responses are replay evidence, not fresh API calls; manual inventories and synthetic cases are separate. Only the authorized Preview branch may be pushed; main/production, credentials, protection and paid API scope stay unchanged.

## Authorized UX-quality follow-up (2026-11-11)
The latest user request authorizes a separate maximum 12-attempt loop from f5db094.
Read ux-PRD.md, ux-tasks.md and ux-state.json in docs/loop-engineering.
Use `python scripts/pms-ux-loop.py` with the same reserve/recover/three-failures rules.
Keep old state.json and old logs immutable. UX logs are evidence/studio/ux-loop.
