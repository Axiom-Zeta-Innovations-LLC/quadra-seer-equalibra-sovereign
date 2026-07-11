# Phase 7 Operator Runbook

## Purpose

This runbook covers the production-hardened Phase 7 operator workflow for Quadra Seer with Atlantean diagnostics, sync, and telemetry enabled.

## Startup Checklist

1. Start the frontend and backend with the project-standard commands.
2. Confirm the backend is healthy before sending queries.
3. Open the UI and verify the status badge reaches `Sync: Ready`.
4. Confirm the sidebar shows `Diagnostics`, `Status`, and `Archives`.
5. On first launch, dismiss the onboarding overlay after verifying the surfaced capabilities.

## Pre-Flight Validation

Run these checks before release or before handing the environment to an operator:

1. `npm run test`
2. `npm run build`
3. `./.venv/bin/python tests/run_validation.py`

Expected result:
- frontend tests pass
- production build completes
- backend validation suite passes under `.venv`

## Status Tab Checks

Open the `Status` tab and verify:

1. `Atlantean Core Active` is visible.
2. Replay integrity is not reporting an unexpected error state.
3. `Refresh Performance` is present.
4. Status refresh and field refresh metrics show non-zero timing after the application has been active.
5. `Sync Metadata` shows expected merge history after device import/export operations.
6. Heatmaps and trendlines render without blank sections.

## Sync Workflow

### Export

1. Open the profile modal.
2. Use `Export Sync Package`.
3. Confirm a success toast appears with timing information.
4. Confirm the inline sync status text reports successful export.
5. Store the downloaded JSON package in the approved handoff location.

### Import

1. Open the profile modal.
2. Use `Import And Merge`.
3. Select a valid JSON sync package.
4. Confirm a success toast appears with timing information.
5. Confirm the inline sync status text reports successful merge.
6. Re-check the `Status` tab to verify updated sync counters and merge metadata.

### Failure Handling

If export or import fails:

1. Read the toast message first; it is the canonical non-blocking operator error surface.
2. Compare the inline sync status text in the profile modal with the toast.
3. If the import payload is invalid, regenerate the package from the source device.
4. If bridge operations are failing broadly, use the backend validation command and inspect backend availability.

## Telemetry Interpretation

### Refresh Performance

Use `Refresh Performance` to watch UI-side fetch health:

1. `Last` indicates the most recent refresh duration.
2. `Avg` indicates rolling average duration for that refresh path.
3. `Runs` indicates how often the path has executed.
4. A sudden jump in field refresh latency with stable status latency usually suggests field payload or backend field computation pressure.
5. A jump across both refresh paths suggests broader backend or environment pressure.

### Replay Integrity

1. `REPLAY OK` indicates recorded event state and replayed state align.
2. `NO HISTORY` is acceptable before the first meaningful interaction.
3. `REPLAY ERR` or `REPLAY MISMATCH` should block release sign-off until investigated.

## Release Sign-Off

Ship readiness for this phase requires all of the following:

1. Frontend tests green.
2. Frontend build green.
3. Backend validation green under `.venv`.
4. Onboarding overlay verified once on a clean local storage state.
5. Status tab verified for refresh metrics, replay indicator, and sync metadata.
6. Sync export/import tested with operator-visible success toasts.
7. No unresolved editor diagnostics in touched frontend files.

## Known Guardrails

1. Use `.venv` for Python validation; system Python may not have required dependencies.
2. Treat toast errors as operator-facing signals, but still use validation commands for root-cause confirmation.
3. Prefer small sync packages from known-good devices during release verification.
