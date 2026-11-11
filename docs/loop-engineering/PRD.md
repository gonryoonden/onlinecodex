# Personal Magic Studio — bounded autonomous editing loop

Base: `115b8ec`, branch `preview/pms-beta-d42d824-20261110`. User goal: Gemini candidates become independently editable native text/shapes and alpha images, with separate background restoration, correction, ZIP and exports. Existing preserve/redraw modes, project schemaVersion 1, authentication and production remain compatible.

## Invariants

- Extraction must not drop candidates merely because background repair fails. Every input ID has exactly one recorded outcome: generated, merged, correction-needed, separation-failed, or user-excluded. Merged IDs reference canonical IDs; containment is distinct from duplication.
- Never label an opaque crop/unchanged raster as successful segmentation. Image alpha requires a model/manual mask or measured flat-background keying, with method and warnings. Ambiguous images remain correction-needed.
- Unrepaired extracted layers are saved as hidden review candidates, not silently overlaid on an unchanged original or counted as ready layers. Existing manual correction promotes them after preview. Drafts remain explicitly review-required.
- Background edits are separate, bounded, and source pixels outside repair masks stay unchanged. Approximate fills get quality warnings; complex texture restoration is not claimed.
- No paid services/new billable API use, credentials changes, auth removal, main/production mutation. No subagents are required.

## Sequential gates

1. Governance: inspect AGENTS.md, code, retained analysis evidence; establish baseline; runner selftests demonstrate 24-budget, 3-consecutive-cause stop, prerequisite checks and restart recovery. Commit PRD/tasks/state/runner.
2. Candidate contract: native text/shapes survive repair rejection; stable duplicate and containment relationships; complete per-ID outcomes persisted through project validation; regression tests/typecheck pass.
3. Alpha extraction: reuse Google gray masks/polygons and local mask/brush code; no opaque crops in independent mode; background keying must pass existing flat-perimeter checks; empty/opaque masks do not become successful extractions. Tests/typecheck pass.
4. Restoration: independent repair plan; original-outside-mask equality; original ink not retained inside approved patches; unresolved/overlapping regions flagged and candidates preserved. Tests/typecheck and browser check pass.
5. Acceptance: real images >=3, recorded REAL Gemini response replay separately from human inventories; browser text/shape edits, image movement/delete, ghost pixels, ZIP reopen, PNG/PPTX. Synthetic and recorded responses cannot count as live AI. Complete only if actual data coverage and mandatory assertions pass; missing Gemini responses/host access = blocked, not completed.
6. Preview: verified changes only, exact Preview ref, build READY, protected capability HTTP check, production/main unchanged. End-to-end product PASS requires gate 5. If gate 5 is externally blocked but technical regression checks pass, a restricted Preview checkpoint is allowed and explicitly marked partial; never a completed beta.

## Execution/restart

`python scripts/pms-loop.py status` prints the next phase and consumed budget. `run PHASE GATE --cause ROOT_CAUSE --hypothesis TEXT` reserves an attempt atomically before executing fixed checks; stores log and result; incomplete attempts become interrupted on `recover`. `pass PHASE` requires passed verification and prior complete phases. `block PHASE --reason TEXT` records an external limit. `checkpoint` records current Git SHA. No automatic retry, model invocation or deployment is performed by the runner. The coding agent reads the result, investigates the cause, edits and calls the next bounded verification. State is in `docs/loop-engineering/state.json`; immutable attempt logs are in `evidence/studio/loop/`. Every successful phase has a commit, then a checkpoint in the next commit.

Stop at >=24 attempts, 3 consecutive failed attempts with the same cause, unmet prerequisite, or external blocker that cannot be resolved in authorized scope. On interruption inspect `git status`, `recover`, and last verified checkpoint; do not reset budget or discard work. A success requires executed gate evidence, not just a status edit.

## ec29b63 후속 검증

[SEGMENTATION-PLAN.md](SEGMENTATION-PLAN.md)와 사용자 통합 마스터 요청을 적용했다. 모델 실행·마스크/복원 분리·실제 3종 편집·PNG/PDF/PPTX·복구를 기존 24회 한도 내에서 검증했다. 현재 결과와 미충족 품질은 [RESUME-REPORT.md](RESUME-REPORT.md)에 기록한다. 기존 1~13회 기준과 기록을 유지한다.
