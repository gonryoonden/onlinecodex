# Independent release review — BLOCK
Reviewer: actual separate agent `/root/release_review`, after concurrent remote AI-team policy merge. Read-only source/evidence review. No tests/builds/API/deploy calls were performed by this reviewer.

- P1 required full real edit/save/export/restore regression, optimized build and optimized-browser gates have not run. Existing partial browser evidence cannot satisfy release gates. Keep Preview application unchanged.
- P1 `apps/studio/src/store/canvas-view.ts:11` allows8x; `canvas/StudioCanvas.tsx:34` allocates the full scaled document Stage. Supported8000×8000 document is64M pixels at100%,64000×64000 pixels at8x. No viewport/allocation cap. This is a source-level risk, not a reproduced crash.
- P2 `selectionBounds` rotates every object around top-left; rendered ellipses/stars rotate around their center. Selection-fit may target the wrong bounds.
- P2 oversized cached model streams throw before the cache eviction branch. Repeated retry can read the same invalid cached item rather than downloading anew.

Confirmed: current app src/public/package files equal410d3c3. Layout3 and processing4 browser tests, unit122 and actual screenshots support limited accomplishments. Retaining failures6/7/8 and reverting unsuccessful typography changes is appropriate.

Recommendation: preserve local checkpoints/report, stop implementation, leave Preview app unchanged. Findings are for a future explicitly resumed task, not permission to bypass the halt rule. Lead accepted BLOCK.
