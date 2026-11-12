---
name: ai-dev-team
description: Coordinate a real multi-agent software development team when a user asks to plan, build, review, debug, validate, or run an AI development team. Use the repository's own rules and evidence rather than role-playing unexecuted specialists.
---

# AI development team orchestration

Read `AGENTS.md`, app-level instructions, `docs/ai-team/TEAM-STANDARD.md`, and the current task-specific plan/state first. Preserve all existing checkpoints and loop budgets.

## Routing and sequence
1. **Lead/root agent:** establish repo, branch, worktree, permissions, scope, risk, required approvals, and actual available subagent tools.
2. **Planner:** for nontrivial changes, delegate planning to `planner`; collect requirements, explicit acceptance criteria, architecture options, and milestone plan.
3. **Independent review:** delegate the plan to `reviewer` with the planner's output but require fresh source checks. Iterate if REVISE/BLOCK; do not endlessly debate.
4. **Decision gate:** lead records approved scope and unresolved choices. Request user approval for high-impact architecture, deletion, production, new paid services, secrets, or expanded access.
5. **Implementation:** delegate a bounded slice to `developer`; parallelize only independent files/worktrees. Track touched files, commits and checks.
6. **Independent QA:** delegate to `qa`; compare actual behavior to acceptance criteria, include real test and browser evidence. Never mark an untested gate passed.
7. **Defect loop:** failed acceptance -> `bug-investigation` -> reviewed fix -> implementation -> independent QA. Stop after three consecutive failures of the same cause and escalate.
8. **Handoff:** report achieved, failed, blocked, not-run, changed files, evidence paths, risks and next action. Only validated changes may enter the separately authorized Preview environment.

## Efficient delegation
- Spawn actual subagents only if the runtime supports them; otherwise do sequential explicit roles and label them **not independent subagent reviews**.
- Keep trivial one-file changes in the primary agent. Prefer at most three simultaneous subagents by default.
- Specialist MCP/Figma/UI/browser tools are optional. Verify they are available in the **current runtime** before use; never assume ChatGPT's connectors are present inside Codex.
- Do not start or reset the existing PMS loop counters merely by invoking this skill.
- No hidden background operation is implied by these instructions.

## Required handoff record
State objective, repository/branch, owner role, inputs and evidence, proposed/changed artifacts, acceptance gate, risks and open questions. Record decisions in existing project logs; do not create redundant tracking documents when a task system already exists.
