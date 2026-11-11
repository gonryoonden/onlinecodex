# Gates
1. Audit/checkpoint: per-ID evidence; separate resumable 12 loop, old state immutable.
2. Policy/checkpoint: disjoint A/B/C/failed decisions; measured repair/semantic guards; regression.
3. Auto/checkpoint: consent + cached analyses, automatic model/restoration/page; cancellation and exception review.
4. Integration/checkpoint: 3 actual images, edit/export/restore, correction, annotated subset errors and click/time metrics.
5. Regression/checkpoint: legacy workflows, cancellation and compatibility.
6. Release/checkpoint: production build, protected Preview browser, measured report and immutable main/Production.
Passing a code gate does not certify untested semantic accuracy. Record pending/blocked acceptance explicitly.

## Final status
1 passed attempt1; 2 passed attempt4; 3 passed attempt8; 4 passed attempt10.
5 blocked: measurements passed attempt11, but low-review and full semantic accuracy goals unmet.
6 partial: deployed Preview READY + connector HTTP checks; local optimized browser3 passed attempt12, hosted browser blocked by environment CONNECT403.
12/12 consumed; preserve checkpoints and stop implementation. See ux-REPORT.md and ux-state.json.
