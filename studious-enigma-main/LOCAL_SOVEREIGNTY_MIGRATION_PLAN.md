# Local Sovereignty Migration Plan (30 Steps)

This plan assumes a local-first deployment model where the language model is replaceable and stateless, while continuity, identity, memory, orchestration, and governance remain in the Atlantean/HRM stack.

## Phase 1: Local Model Foundation (Steps 1-6)

1. Choose initial local backend target (Ollama, llama.cpp, or vLLM) for baseline hardware.
2. Pin canonical model IDs for baseline, fallback, and stress-test profiles.
3. Finalize provider adapter contracts for input/output normalization and error types.
4. Add health-check endpoint probing for active local model backend.
5. Add startup diagnostics that verify local model reachability before serving queries.
6. Capture baseline latency and token-throughput metrics for the chosen local model.

## Phase 2: Sovereignty Guardrails (Steps 7-12)

7. Enforce outbound network deny-by-default at process/runtime config.
8. Add optional host firewall templates to block unintended egress.
9. Add explicit cloud escalation policy gates with environment-level defaults.
10. Add explicit per-request consent metadata for cloud escalation attempts.
11. Log every escalation decision with reason codes in structured telemetry.
12. Add a policy test suite proving cloud calls are blocked when consent/policy fail.

Status: Implemented in current workspace.
- Runtime policy module: `atlantean_core/sovereignty_policy.py`
- Backend reason-code telemetry and generation metadata: `atlantean_backend.py`
- Policy tests: `tests/test_sovereignty_policy.py`
- Optional firewall template: `ops/firewall/ufw-sovereign-egress.sh`

Validation command:
`python -m unittest tests.test_sovereignty_policy -v`

## Phase 3: Memory and Identity Hardening (Steps 13-18)

13. Encrypt cold-memory artifacts at rest with managed key rotation support.
14. Encrypt sync package exports with passphrase-based envelope encryption.
15. Sign memory ledger events with local identity keys and verify on restore.
16. Add tamper-evidence checks for restored snapshots and replayed events.
17. Add corruption-recovery path for partial snapshot/ledger failures.
18. Add retention controls for memory classes (chat, simulation, telemetry).

Status:
- Step 13 implemented in current workspace.
- Cold-memory Redis artifacts now support keyring encryption with active-key rotation and backward-compatible decrypt.
- Step 14 implemented in current workspace.
- Sync package export/import now uses passphrase envelope encryption with legacy plaintext import compatibility.
- Step 15 implemented in current workspace.
- Snapshot restore and sync merge now enforce signed ledger verification gates before/after state mutation.
- Step 16 implemented in current workspace.
- Snapshot restore verifies stored payload hash, and replay proof verifies head-hash consistency.
- Step 17 implemented in current workspace.
- Added `POST /api/atlantean/recovery/repair` to recover from partial snapshot/ledger metadata corruption.
- Step 18 implemented in current workspace.
- Added retention controls for chat/simulation/telemetry memory classes with policy flags and manual apply endpoint.
- Step 19 implemented in current workspace.
- Added provider capability registry (context window, streaming, tool-call support) with routing resolution endpoint.
- Step 20 implemented in current workspace.
- Query orchestration now selects capability-bound strategy paths instead of branching directly on provider names.
- Step 21 implemented in current workspace.
- Query lifecycle now enforces multi-cycle symbolic reasoning budgets per query class (simple/analytical/deep/file_assisted).
- Step 22 implemented in current workspace.
- Symbolic/governance cycle triggers are now emitted into query lifecycle telemetry (start/cycle/summary/complete).
- Step 23 implemented in current workspace.
- Per-request HRMComputeAllocator now gates HRM/RCM symbolic passes against per-query and per-window compute caps; budget state is included in query response metadata.
- Step 24 implemented in current workspace.
- Dynamic model tier selector chooses light/standard/heavy model by query class and HRM resource pressure; tier selection result emitted as telemetry and returned in query responses.
- Step 25 implemented in current workspace.
- Routing controls (model tier preference, local backend hint) exposed in Operator Profile settings; forwarded per query; honoured by backend tier selector; GET /api/atlantean/routing/settings endpoint exposes runtime config.
- Step 26 implemented in current workspace.
- RoutingIndicatorBar component added to AtlanteanStatusPanel; shows live provider, backend, policy state (cloud/outbound/consent badges), HRM budget, and reasoning cycle counts fetched from /api/atlantean/routing/settings.
- Step 27 implemented in current workspace.
- GET /api/atlantean/diagnostics/export bundles routing config, ledger integrity, replay proof, recent telemetry, hot-memory stats, HRM state, and runtime environment into a single JSON file; Export Diagnostics Bundle button added to AtlanteanStatusPanel.
- Step 28 implemented in current workspace.
- End-to-end sovereignty mode tests exercise the full decision chain (sovereignty_policy → provider_capabilities → orchestration_strategy → model_tier_selector → hrm_compute_budget → query_reasoning_budget → query_lifecycle_telemetry) across local-only, consented-cloud, and offline modes with 31 test cases.
- Step 29 implemented in current workspace.
- Hardware scaling matrix defines three deployment tiers (small_quantized/medium/multi_agent) with model IDs, context windows, HRM compute caps, reasoning cycles, and concurrent session limits; GET /api/atlantean/hardware/scaling-matrix endpoint exposes the matrix and active tier.
- Step 30 implemented in current workspace.
- Production readiness drill passes 39 tests across 5 test classes (cold start, failover, recovery, audit replay, completion criteria), validating the full sovereignty decision chain end-to-end.

Validation command for Step 13:
- `python -m unittest tests.test_at_rest_encryption -v`

Validation command for Step 14:
- `npm run test -- syncEnvelope ChatInterface.sync`

Validation command for Step 15:
- `python -m unittest tests.test_ledger_verification -v`

Validation command for Step 16:
- `python -m unittest tests.test_tamper_evidence -v`

Validation command for Step 17:
- `python -m unittest tests.test_corruption_recovery -v`

Validation command for Step 18:
- `python -m unittest tests.test_retention_policy -v`

Validation command for Step 19:
- `python -m unittest tests.test_provider_capabilities -v`

Validation command for Step 20:
- `python -m unittest tests.test_orchestration_strategy -v`

Validation command for Step 21:
- `python -m unittest tests.test_query_reasoning_budget -v`

Validation command for Step 22:
- `python -m unittest tests.test_query_lifecycle_telemetry -v`

Validation command for Step 23:
- `python -m unittest tests.test_hrm_compute_budget -v`

Validation command for Step 24:
- `python -m unittest tests.test_model_tier_selector -v`

Validation command for Step 25:
- `python -m unittest tests.test_routing_settings -v`

Validation command for Step 26:
- `npm run build` (TypeScript compile + bundle check)

Validation command for Step 27:
- `python -m unittest tests.test_diagnostics_bundle -v`

Validation command for Step 28:
- `python -m unittest tests.test_e2e_sovereignty_modes -v`

Validation command for Step 29:
- `python -m unittest tests.test_hardware_scaling_matrix -v`

Validation command for Step 30:
- `python -m unittest tests.test_production_readiness_drill -v`

## Migration Status: COMPLETE

All 30 steps of the Local Sovereignty Migration Plan have been implemented and validated.

## Phase 4: Orchestration and Cognitive Layers (Steps 19-24)

19. Add provider capability registry (context window, streaming, tool-call support).
20. Bind orchestration strategy to capability registry instead of provider names.
21. Implement multi-cycle reasoning budget controls per query class.
22. Integrate symbolic/governance cycle triggers into query lifecycle telemetry.
23. Add compute budget allocator for HRM/RCM symbolic passes.
24. Add dynamic model tier selection by query complexity and resource pressure.

## Phase 5: Tooling and Runtime UX (Steps 25-27)

25. Expose runtime routing controls in profile/settings with local default.
26. Add operator dashboard indicators for provider, backend, and policy state.
27. Add one-click diagnostics bundle export for troubleshooting local deployments.

## Phase 6: Validation and Scale-Up (Steps 28-30)

28. Build end-to-end tests for local-only mode, consented cloud mode, and offline mode.
29. Define hardware scaling matrix (small quantized, medium, multi-agent tiers).
30. Run a production readiness drill: cold start, failover, recovery, and audit replay.

## Completion Criteria

- Local inference is default and operational without internet.
- Cloud escalation is impossible without policy enablement and explicit consent.
- Memory, identity, and orchestration remain authoritative and provider-agnostic.
- HRM/RCM compute is budgeted, observable, and deterministic under constraints.
