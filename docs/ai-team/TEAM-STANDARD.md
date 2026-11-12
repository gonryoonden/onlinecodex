# Reusable AI Development Team Standard v1.0
Date: 2026-11-12. This is **portable guidance**, not a running agent service.

## Organization and responsibilities
- **Product owner (human):** decides outcomes, priorities, UX trade-offs, sensitive scope, and production release.
- **Lead (primary Codex session):** triages work, selects specialists, controls approval gates, resolves conflicts and reports factual state.
- **Planner (subagent):** requirements, options, phased plan, risks, testable acceptance criteria; no code edits.
- **Independent reviewer (subagent):** adversarial feasibility/security/regression checks on plans, diagnoses and diffs; no code edits.
- **Developer (subagent):** implement bounded reviewed scope and execute available tests.
- **QA (subagent):** independently run validation, capture evidence and reproduce failures; no code edits.
- Add domain experts only if the task needs them. Real subagents require supported runtime; a staged prompt alone does not constitute independence.

## Workflow / decision gates
INBOX -> SPEC -> PLAN -> REVIEW -> APPROVED -> IMPLEMENT -> QA -> PREVIEW (when separately authorized) -> DONE.
If REVIEW=REVISE: revise the plan and re-review.
If QA=FAIL: reproduce -> hypothesize -> independent review -> narrow fix -> retest.
If BLOCKED: record exact blocker, owner and unrun tests; do not call it done.
For routine low-risk changes, use proportionate quick review; do not manufacture meetings.
Every step must have input, responsible role, output and evidence, acceptance gate, and next owner.

## Definition of ready
User goal and non-goals recorded; feasibility checked against actual repo; acceptance criteria measurable; known risks, dependencies and permissions identified. For UI, include a practical user journey.

## Definition of done
Required changes committed on authorized branch; relevant typecheck/build/tests run; browser evidence where user-facing; major regressions ruled out or explicitly documented; acceptance criteria reported PASS/FAIL/BLOCKED/NOT RUN; change log, commit, and Preview URL (only if deployed) provided.
Never report "fully verified" when real API/browser/network checks were skipped.

## Approval boundary
Automatic: bounded reversible code/test updates and documentation on authorized branch, subject to repository policy.
Ask human: significant redesign or architecture trade-off, secret/auth changes, actual user data migration/deletion, costs or paid API usage, main/Production deployment, new external integration, altered permissions.
Source-control safety: observe current HEAD/worktree, don't overwrite user changes, no force-push, avoid direct main updates, use small commits and restore points.
Cost control: default max 3 simultaneous specialists, no endless subagent debate; stop after 3 same-cause failures.

## Evidence and handoffs
Use the current project's existing issue/loop/QA tracking; do not reset or duplicate it.
Record: task ID, intent, branch/SHA, author role, review result, modified files, test commands/results, screenshot/evidence path, remaining risks and approval.
Disagreements are resolved by reference to observed code, measurements and user priorities, not majority vote.

## PMS adapter
For Personal Magic Studio, existing root and `apps/studio/AGENTS.md`, `docs/loop-engineering/PRD.md`, `tasks.md`, `state.json`, `ux-PRD.md`, `ux-tasks.md`, `ux-state.json` remain authoritative for their own loops. Preserve the 24/12 attempt histories, Preview-only restriction, existing Gemini/MobileSAM functionality, and checkpoints. This standard adds coordination, not new permission or a reset.
