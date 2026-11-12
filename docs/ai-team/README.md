# Apply the AI team setup

**Current repository:** configured in `AGENTS.md`, `.codex/config.toml`, four `.codex/agents/*.toml` roles, and two `.agents/skills/*/SKILL.md` workflows. These are configuration files, not proof that multi-agent execution has happened.

**Start in Codex:** open this repository on the authorized Preview branch and ask:
> Use the ai-dev-team skill. Have planner propose an evidence-based plan for [goal], reviewer independently challenge it, developer implement only the reviewed scope, and qa run objective acceptance tests. Keep existing PMS loop states untouched and report what was actually verified.

**For a defect:** "Use bug-investigation and independent reviewer/qa agents to reproduce [symptom], review the cause and minimal fix, then retest."

**Reuse in other repositories:** copy `docs/ai-team/TEAM-STANDARD.md`, `.codex/agents/`, and `.agents/skills/ai-dev-team/` (+ bug-investigation if needed). In each repo, add a short pointer in its `AGENTS.md` and adapt branch, scripts, architecture, and deployment protections. Do not copy PMS-specific loop limits.

**Across all local Codex projects (optional, separate user-level action):** put only generic rules in `~/.codex/AGENTS.md` and shared custom agents in `~/.codex/agents/`, shared skills in `~/.agents/skills/`. Repository GitHub changes cannot set those local files or ChatGPT Project Instructions.

**Verification:** use a real Codex session to check custom agent discovery and delegation. The files alone cannot guarantee runtime access/permissions, actual browser tests, or unattended activity. No Production deployment is part of this setup.
