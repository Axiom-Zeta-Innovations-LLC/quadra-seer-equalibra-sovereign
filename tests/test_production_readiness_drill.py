"""Production readiness drill (Step 30).

Simulates four critical scenarios for local-first deployment validation:

  1. Cold Start  – system initialises from scratch with no prior state.
  2. Failover    – graceful degradation when the local LLM endpoint is
                   unreachable, including mock fallback and policy blocks.
  3. Recovery    – corruption recovery handles partial snapshot/ledger failures
                   and produces a deterministic repair plan.
  4. Audit Replay– replay integrity proof correctly validates and rejects
                   event-ledger chains.

All scenarios run without external dependencies or real network calls.
"""

import hashlib
import json
import time
import unittest
from typing import Any, Dict, List

# ── Core sovereignty and routing modules ──────────────────────────────────────
from atlantean_core.sovereignty_policy import (
    evaluate_cloud_escalation,
    evaluate_local_url_policy,
)
from atlantean_core.provider_capabilities import (
    build_provider_capability_registry,
    normalize_provider_name,
    resolve_provider_capability,
)
from atlantean_core.orchestration_strategy import select_orchestration_strategy

# ── Compute / reasoning modules ───────────────────────────────────────────────
from atlantean_core.hrm_compute_budget import (
    HRMComputeAllocator,
    build_hrm_compute_budget_policy,
)
from atlantean_core.model_tier_selector import (
    ModelTierSelector,
    build_model_tier_config,
)
from atlantean_core.query_reasoning_budget import (
    build_query_reasoning_budget,
    classify_query_class,
)

# ── Hardware scaling ──────────────────────────────────────────────────────────
from atlantean_core.hardware_scaling_matrix import (
    get_scaling_matrix,
    get_tier,
    get_tier_or_default,
)

# ── Integrity / recovery modules ──────────────────────────────────────────────
from atlantean_core.tamper_evidence import (
    snapshot_hash,
    verify_replay_head,
    verify_snapshot_hash,
)
from atlantean_core.corruption_recovery import (
    evaluate_snapshot_record,
    plan_snapshot_recovery,
)
from atlantean_core.ledger_verification import evaluate_ledger_gate


# ── helpers ───────────────────────────────────────────────────────────────────

def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def _canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _make_event(seq: int, prev_hash: str, state_hash: str) -> Dict[str, Any]:
    """Build a minimal signed-event-style dict for replay tests."""
    unsigned = {
        "seq": seq,
        "prev_hash": prev_hash,
        "state_hash": state_hash,
        "payload": {"seq": seq},
    }
    event_hash = _sha256(_canonical_json(unsigned))
    return {**unsigned, "event_hash": event_hash, "signature": None}


def _make_event_chain(length: int) -> List[Dict[str, Any]]:
    """Build a clean hash-linked event chain of the given length."""
    events = []
    prev_hash = ""
    state_hash = _sha256("initial_state")
    for i in range(1, length + 1):
        event = _make_event(i, prev_hash, state_hash)
        prev_hash = event["event_hash"]
        state_hash = _sha256(f"state_{i}")
        events.append(event)
    return events


def _replay_events(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Minimal deterministic replay: returns head_hash and validity."""
    prev_hash = ""
    issues = []
    for idx, event in enumerate(events):
        unsigned = {k: v for k, v in event.items() if k not in ("event_hash", "signature")}
        recomputed = _sha256(_canonical_json(unsigned))
        if event.get("event_hash") != recomputed:
            issues.append({"index": idx, "type": "hash_mismatch"})
            break
        if unsigned.get("prev_hash") != prev_hash:
            issues.append({"index": idx, "type": "chain_mismatch"})
            break
        prev_hash = event["event_hash"]
    return {"head_hash": prev_hash, "valid": len(issues) == 0, "issues": issues}


# ── 1. Cold Start ─────────────────────────────────────────────────────────────

class TestColdStart(unittest.TestCase):
    """Verify all sovereignty modules initialise cleanly from zero state."""

    def test_provider_capabilities_registry_boots(self):
        caps = build_provider_capability_registry(
            local_backend="ollama",
            local_model="llama3.1:8b-q4",
            local_context_window=8192,
        )
        self.assertIn("local", caps)
        self.assertIn("gemini", caps)
        self.assertIn("mock", caps)

    def test_provider_normalisation_works_from_cold(self):
        self.assertEqual(normalize_provider_name("ollama"), "local")
        self.assertEqual(normalize_provider_name("local"), "local")
        self.assertEqual(normalize_provider_name(None), "")

    def test_sovereignty_policy_defaults_to_deny_cloud(self):
        result = evaluate_cloud_escalation(
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        self.assertFalse(result["allowed"])

    def test_hrm_compute_allocator_cold_init(self):
        policy = build_hrm_compute_budget_policy(
            enabled=True,
            hrm_max_ms_per_query=20.0,
            rcm_max_ms_per_query=20.0,
            max_total_ms_per_window=200.0,
            window_seconds=60,
        )
        alloc = HRMComputeAllocator(policy=policy)
        decision = alloc.allocate("hrm", "simple")
        self.assertTrue(decision.allowed)
        self.assertEqual(decision.reason, "allowed")

    def test_model_tier_selector_cold_init(self):
        cfg = build_model_tier_config(
            light_model="tiny",
            standard_model="medium",
            heavy_model="large",
        )
        sel = ModelTierSelector(config=cfg)
        result = sel.select("simple")
        self.assertEqual(result.selected_tier, "light")
        self.assertFalse(result.downgraded)

    def test_hardware_scaling_matrix_loads_all_tiers(self):
        matrix = get_scaling_matrix()
        self.assertIn("small_quantized", matrix["tiers"])
        self.assertIn("medium", matrix["tiers"])
        self.assertIn("multi_agent", matrix["tiers"])

    def test_hardware_default_tier_is_medium(self):
        spec = get_tier_or_default("", default="medium")
        self.assertEqual(spec.tier_id, "medium")

    def test_reasoning_budget_plans_from_cold(self):
        plan = build_query_reasoning_budget(
            "simple",
            enabled=True,
            cycles_by_class={"simple": 0, "analytical": 1, "deep": 2, "file_assisted": 2},
        )
        self.assertTrue(plan["enabled"])
        self.assertEqual(plan["max_cycles"], 0)

    def test_query_classification_works_from_cold(self):
        self.assertEqual(classify_query_class("Hi", has_files=False), "simple")
        self.assertEqual(classify_query_class("", has_files=True), "file_assisted")


# ── 2. Failover ───────────────────────────────────────────────────────────────

class TestFailover(unittest.TestCase):
    """Graceful degradation when local LLM is unavailable."""

    def _local_policy(self, url: str, allow_outbound: bool = False) -> Dict[str, Any]:
        return evaluate_local_url_policy(url=url, allow_outbound_network=allow_outbound)

    def test_non_loopback_url_blocked_without_outbound_permission(self):
        result = self._local_policy("http://192.168.10.5:11434/api/generate")
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason_code"], "OUTBOUND_BLOCKED_NON_LOOPBACK")

    def test_loopback_always_allowed_without_outbound_permission(self):
        for url in (
            "http://127.0.0.1:11434/api/generate",
            "http://localhost:11434/api/generate",
        ):
            result = self._local_policy(url)
            self.assertTrue(result["allowed"], f"Should be allowed: {url}")

    def test_outbound_permission_enables_non_loopback(self):
        result = self._local_policy(
            "http://10.0.0.5:11434/api/generate",
            allow_outbound=True,
        )
        self.assertTrue(result["allowed"])
        self.assertEqual(result["reason_code"], "OUTBOUND_ALLOWED_BY_POLICY")

    def test_mock_fallback_strategy_always_reachable(self):
        caps = build_provider_capability_registry(
            local_backend="ollama", local_model="test", local_context_window=4096
        )
        resolution = resolve_provider_capability("mock", caps, default_provider="mock")
        strategy = select_orchestration_strategy(
            resolution.get("capability", {}),
            cloud_escalation_allowed=False,
        )
        self.assertEqual(strategy["execution_path"], "mock_fallback")

    def test_cloud_blocked_in_failover_even_with_consent(self):
        result = evaluate_cloud_escalation(
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=True,
        )
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason_code"], "CLOUD_ESCALATION_DISABLED_BY_POLICY")

    def test_strategy_degrades_to_policy_blocked_without_consent(self):
        caps = build_provider_capability_registry(
            local_backend="ollama", local_model="test", local_context_window=8192
        )
        resolution = resolve_provider_capability("gemini", caps, default_provider="local")
        strategy = select_orchestration_strategy(
            resolution.get("capability", {}),
            cloud_escalation_allowed=False,  # policy blocked
        )
        self.assertIn(
            strategy["execution_path"],
            ("cloud_policy_blocked", "mock_fallback"),
        )

    def test_hrm_budget_allocator_survives_multiple_passes(self):
        policy = build_hrm_compute_budget_policy(
            enabled=True,
            hrm_max_ms_per_query=5.0,
            rcm_max_ms_per_query=5.0,
            max_total_ms_per_window=200.0,
            window_seconds=60,
        )
        alloc = HRMComputeAllocator(policy=policy)
        # Exhaust per-query budget (simple cap = 5.0 * 0.5 = 2.5ms)
        alloc.record_elapsed("hrm", 3.0)
        second = alloc.allocate("hrm", "simple")
        self.assertFalse(second.allowed)
        self.assertEqual(second.reason, "query-compute-cap-exceeded")


# ── 3. Recovery ───────────────────────────────────────────────────────────────

class TestRecovery(unittest.TestCase):
    """Corruption recovery produces correct repair plans."""

    def _make_snapshot(self, seed: str = "ok") -> Dict[str, Any]:
        return {"phi1": [1, 2, 3], "Phi": 0.5, "version": 1, "seed": seed}

    def test_valid_snapshot_is_recoverable(self):
        snap = self._make_snapshot()
        h = snapshot_hash(snap)
        record = {"id": "snap-1", "snapshot_sha256": h}
        result = evaluate_snapshot_record(record, snap, verify_hash=True)
        self.assertTrue(result["recoverable"])
        self.assertEqual(result["reason_code"], "SNAPSHOT_RECOVERABLE")

    def test_missing_payload_not_recoverable(self):
        record = {"id": "snap-2", "snapshot_sha256": "abc"}
        result = evaluate_snapshot_record(record, None, verify_hash=True)
        self.assertFalse(result["recoverable"])
        self.assertEqual(result["reason_code"], "SNAPSHOT_PAYLOAD_MISSING")

    def test_hash_mismatch_not_recoverable(self):
        snap = self._make_snapshot()
        record = {"id": "snap-3", "snapshot_sha256": "aaaa1111"}
        result = evaluate_snapshot_record(record, snap, verify_hash=True)
        self.assertFalse(result["recoverable"])
        self.assertEqual(result["reason_code"], "SNAPSHOT_HASH_MISMATCH")

    def test_missing_id_not_recoverable(self):
        snap = self._make_snapshot()
        result = evaluate_snapshot_record({}, snap, verify_hash=False)
        self.assertFalse(result["recoverable"])
        self.assertEqual(result["reason_code"], "SNAPSHOT_ID_MISSING")

    def test_recovery_plan_prunes_invalid_keeps_valid(self):
        snap_ok = self._make_snapshot("ok")
        snap_bad = self._make_snapshot("bad")
        h_ok = snapshot_hash(snap_ok)
        records = [
            {"id": "a", "snapshot_sha256": h_ok},
            {"id": "b", "snapshot_sha256": "wrong_hash"},
        ]
        payloads = {"a": snap_ok, "b": snap_bad}
        plan = plan_snapshot_recovery(records, payloads, verify_hash=True)
        self.assertIn("a", plan["recoverable_snapshot_ids"])
        self.assertIn("b", plan["prune_snapshot_ids"])

    def test_ledger_gate_allows_empty_ledger(self):
        ledger_report = {"valid": True, "issues": [], "events_verified": 0}
        replay_proof = {"valid": True, "replay_state_hash": None, "match": False, "issues": []}
        decision = evaluate_ledger_gate(ledger_report, replay_proof, require_replay_match=False)
        self.assertTrue(decision["allowed"])

    def test_ledger_gate_blocks_invalid_chain(self):
        ledger_report = {"valid": False, "issues": [{"type": "chain_mismatch"}]}
        replay_proof = {"valid": True, "replay_state_hash": "abc", "match": True, "issues": []}
        decision = evaluate_ledger_gate(ledger_report, replay_proof)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_CHAIN_INVALID")

    def test_ledger_gate_blocks_state_mismatch_when_required(self):
        ledger_report = {"valid": True, "issues": []}
        replay_proof = {
            "valid": True,
            "replay_state_hash": "aaa",
            "live_state_hash": "bbb",
            "match": False,
            "issues": [],
        }
        decision = evaluate_ledger_gate(ledger_report, replay_proof, require_replay_match=True)
        self.assertFalse(decision["allowed"])
        self.assertEqual(decision["reason_code"], "LEDGER_REPLAY_STATE_MISMATCH")

    def test_hardware_tier_unknown_falls_back_to_medium(self):
        spec = get_tier_or_default("nonexistent_hardware_tier")
        self.assertEqual(spec.tier_id, "medium")


# ── 4. Audit Replay ───────────────────────────────────────────────────────────

class TestAuditReplay(unittest.TestCase):
    """Deterministic replay proof validates and detects tampered event chains."""

    def test_empty_ledger_is_valid(self):
        result = _replay_events([])
        self.assertTrue(result["valid"])
        self.assertEqual(result["head_hash"], "")

    def test_clean_chain_is_valid(self):
        events = _make_event_chain(5)
        result = _replay_events(events)
        self.assertTrue(result["valid"])
        self.assertNotEqual(result["head_hash"], "")

    def test_tampered_hash_detected(self):
        events = _make_event_chain(4)
        # Corrupt event 2's hash
        events[2] = {**events[2], "event_hash": "deadbeef" * 8}
        result = _replay_events(events)
        self.assertFalse(result["valid"])
        self.assertTrue(any(i["type"] == "hash_mismatch" for i in result["issues"]))

    def test_broken_chain_link_detected(self):
        events = _make_event_chain(4)
        # Break the prev_hash link at event 3
        events[3] = {**events[3], "prev_hash": "00000000" * 8}
        # Recompute hash for the modified unsigned part
        unsigned = {k: v for k, v in events[3].items() if k not in ("event_hash", "signature")}
        events[3]["event_hash"] = _sha256(_canonical_json(unsigned))
        result = _replay_events(events)
        self.assertFalse(result["valid"])
        self.assertTrue(any(i["type"] == "chain_mismatch" for i in result["issues"]))

    def test_replay_head_matches_stored_head(self):
        events = _make_event_chain(3)
        result = _replay_events(events)
        stored_head = events[-1]["event_hash"]
        self.assertTrue(verify_replay_head(result["head_hash"], stored_head))

    def test_replay_head_mismatch_detected(self):
        events = _make_event_chain(3)
        result = _replay_events(events)
        self.assertFalse(verify_replay_head(result["head_hash"], "wrong_head"))

    def test_snapshot_hash_mutation_detected(self):
        snap = {"phi1": [1.0, 2.0], "Phi": 0.5, "version": 1}
        h = snapshot_hash(snap)
        snap_mutated = {**snap, "Phi": 0.9}
        self.assertFalse(verify_snapshot_hash(snap_mutated, h))
        self.assertTrue(verify_snapshot_hash(snap, h))

    def test_audit_full_pipeline_no_issues(self):
        """Cold-start → 5 events → replay validates → ledger gate allows."""
        events = _make_event_chain(5)
        replay = _replay_events(events)
        stored_head = events[-1]["event_hash"]
        head_ok = verify_replay_head(replay["head_hash"], stored_head)

        ledger_report = {
            "valid": True,
            "issues": [],
            "events_verified": len(events),
            "head_hash": replay["head_hash"],
        }
        replay_proof = {
            "valid": replay["valid"],
            "replay_state_hash": "state_5",
            "live_state_hash": "state_5",
            "match": True,
            "issues": [],
            "head_consistent": head_ok,
        }
        gate = evaluate_ledger_gate(ledger_report, replay_proof, require_replay_match=True)
        self.assertTrue(gate["allowed"])
        self.assertIn(
            gate["reason_code"],
            ("LEDGER_VERIFIED_WITH_REPLAY", "LEDGER_VERIFIED_EMPTY_OR_NO_REPLAY_BASELINE"),
        )


# ── Completion criteria summary ───────────────────────────────────────────────

class TestCompletionCriteria(unittest.TestCase):
    """Verify the four completion criteria from the migration plan are satisfied."""

    def test_local_inference_default_and_operational(self):
        """Local inference is default and operational without internet."""
        caps = build_provider_capability_registry(
            local_backend="ollama", local_model="llama3.1:8b-q4", local_context_window=8192
        )
        resolution = resolve_provider_capability("local", caps, default_provider="local")
        self.assertEqual(resolution["provider_selected"], "local")
        strategy = select_orchestration_strategy(
            resolution["capability"], cloud_escalation_allowed=False
        )
        self.assertEqual(strategy["execution_path"], "local_direct")

    def test_cloud_impossible_without_policy(self):
        """Cloud escalation is impossible without policy enablement."""
        for consent in (True, False):
            result = evaluate_cloud_escalation(
                allow_cloud_escalation=False,
                require_cloud_escalation_consent=True,
                explicit_consent=consent,
            )
            self.assertFalse(result["allowed"])

    def test_cloud_impossible_without_consent_when_required(self):
        """Cloud escalation is impossible without explicit consent when required."""
        result = evaluate_cloud_escalation(
            allow_cloud_escalation=True,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        self.assertFalse(result["allowed"])
        self.assertEqual(result["reason_code"], "CLOUD_ESCALATION_CONSENT_REQUIRED")

    def test_hrm_compute_is_budgeted(self):
        """HRM/RCM compute is budgeted and deterministic under constraints."""
        policy = build_hrm_compute_budget_policy(
            enabled=True, hrm_max_ms_per_query=5.0, rcm_max_ms_per_query=5.0,
            max_total_ms_per_window=100.0, window_seconds=60
        )
        alloc = HRMComputeAllocator(policy=policy)
        alloc.record_elapsed("hrm", 3.0)
        snap = alloc.snapshot()
        self.assertAlmostEqual(snap["passes"]["hrm"]["query_consumed_ms"], 3.0, places=2)

    def test_hardware_scaling_matrix_complete(self):
        """Hardware scaling matrix covers all three tiers."""
        matrix = get_scaling_matrix()
        self.assertEqual(len(matrix["tiers"]), 3)
        self.assertIn("small_quantized", matrix["tiers"])

    def test_sovereignty_decision_chain_is_deterministic(self):
        """Same inputs always produce the same policy outcome."""
        kwargs = dict(
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        results = [evaluate_cloud_escalation(**kwargs) for _ in range(3)]
        self.assertTrue(all(r == results[0] for r in results))


if __name__ == "__main__":
    unittest.main()
