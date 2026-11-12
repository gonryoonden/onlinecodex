---
name: bug-investigation
description: Reproduce and diagnose a development defect, obtain a second review of the proposed cause and fix, make the smallest safe change, and independently verify it.
---

# Evidence-first defect resolution

1. **QA/reporter:** capture expected vs actual, exact reproduction, revision/branch, environment, logs/screenshots; distinguish unknown from reproducible.
2. **Developer:** trace entry point and state transitions. Form root-cause hypothesis with evidence and at least one credible alternative. Do not start with blind rewrites.
3. **Reviewer:** independently inspect cause and fix proposal; return PASS/REVISE/BLOCK, regression scenarios, and data-loss/cancellation risks.
4. **Lead:** authorize only the bounded fix, seek user approval if high-risk or scope expands.
5. **Developer:** implement the minimal fix plus a regression test; keep original data and app behavior intact.
6. **QA:** rerun reproduction, regression suite, and browser checks where appropriate; report PASS/FAIL/BLOCKED/NOT RUN with evidence.
7. **Stop rule:** after three consecutive failures of the same root cause, do not silently retry; preserve state and escalate the diagnosis.

A credible fix must pass objective tests, not merely reviewer consensus. Never invent reproduction, benchmarks, screenshots, or deployment results.
