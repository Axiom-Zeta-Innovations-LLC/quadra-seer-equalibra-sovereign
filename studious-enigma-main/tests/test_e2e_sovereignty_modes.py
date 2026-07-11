"""End-to-end sovereignty mode tests (Step 28).

Tests the complete query-routing decision chain across three operational modes:
  1. local-only     – local provider, loopback URL, cloud blocked by policy
  2. consented-cloud– cloud escalation enabled and consent granted
  3. offline        – outbound network blocked, non-loopback URL, mock fallback

Each scenario exercises the layered sovereignty stack:
  sovereignty_policy → provider_capabilities → orchestration_strategy →
  model_tier_selector → hrm_compute_budget → query_reasoning_budget →
  query_lifecycle_telemetry
"""

import unittest
from typing import Any, Dict, List

# ── local imports ─────────────────────────────────────────────────────────────
from atlantean_core.sovereignty_policy import (
    evaluate_cloud_escalation,
    evaluate_local_url_policy,
)
from atlantean_core.provider_capabilities import (
    build_provider_capability_registry,
    resolve_provider_capability,
)
from atlantean_core.orchestration_strategy import select_orchestration_strategy
from atlantean_core.model_tier_selector import (
    ModelTierConfig,
    ModelTierSelector,
    build_model_tier_config,
)
from atlantean_core.hrm_compute_budget import (
    HRMComputeAllocator,
    HRMComputeBudgetPolicy,
    build_hrm_compute_budget_policy,
)
from atlantean_core.query_reasoning_budget import (
    build_query_reasoning_budget,
    classify_query_class,
)
from atlantean_core.query_lifecycle_telemetry import (
    build_cycle_trigger_payload,
    build_query_lifecycle_payload,
)


# ── helper: simulate full query routing pipeline ──────────────────────────────

def _simulate_query_pipeline(
    *,
    user_input: str,
    provider_name: str,
    local_backend: str = "ollama",
    local_model: str = "llama3.1:8b-q4",
    local_llm_url: str = "http://127.0.0.1:11434/api/generate",
    allow_outbound_network: bool = False,
    allow_cloud_escalation: bool = False,
    require_cloud_escalation_consent: bool = True,
    explicit_consent: bool = False,
    reasoning_cycles_by_class: Dict[str, int] | None = None,
    operator_tier_preference: str | None = None,
) -> Dict[str, Any]:
    """Drive the full sovereignty decision chain and return a result dict."""
    if reasoning_cycles_by_class is None:
        reasoning_cycles_by_class = {
            "simple": 0,
            "analytical": 1,
            "deep": 2,
            "file_assisted": 2,
        }

    # 1. Sovereignty – URL and cloud escalation policy
    url_policy = evaluate_local_url_policy(
        url=local_llm_url,
        allow_outbound_network=allow_outbound_network,
    )
    cloud_policy = evaluate_cloud_escalation(
        allow_cloud_escalation=allow_cloud_escalation,
        require_cloud_escalation_consent=require_cloud_escalation_consent,
        explicit_consent=explicit_consent,
    )

    # 2. Provider capability resolution
    capabilities = build_provider_capability_registry(
        local_backend=local_backend,
        local_model=local_model,
        local_context_window=8192,
    )
    resolution = resolve_provider_capability(
        provider_name,
        capabilities,
        default_provider="local",
    )
    capability = resolution.get("capability", {})

    # 3. Orchestration strategy
    strategy = select_orchestration_strategy(
        capability,
        cloud_escalation_allowed=bool(cloud_policy.get("allowed", False)),
    )
    execution_path = str(strategy.get("execution_path", "mock_fallback"))

    # 4. HRM compute budget allocation
    hrm_policy = build_hrm_compute_budget_policy(
        enabled=True,
        hrm_max_ms_per_query=20.0,
        rcm_max_ms_per_query=20.0,
        max_total_ms_per_window=200.0,
        window_seconds=60,
    )
    hrm_allocator = HRMComputeAllocator(policy=hrm_policy)
    hrm_decision = hrm_allocator.allocate("hrm", "simple")
    hrm_allocator.record_elapsed("hrm", 1.5)
    hrm_budget_snap = hrm_allocator.snapshot()

    # 5. Query class + reasoning budget
    has_files = False
    query_class = classify_query_class(user_input, has_files=has_files)
    budget_plan = build_query_reasoning_budget(
        query_class,
        enabled=True,
        cycles_by_class=reasoning_cycles_by_class,
    )

    # 6. Model tier selection
    tier_cfg = build_model_tier_config(
        light_model=local_model,
        standard_model=local_model,
        heavy_model=local_model,
    )
    tier_sel = ModelTierSelector(config=tier_cfg)
    tier_result = tier_sel.select(
        query_class,
        hrm_budget_snapshot=hrm_budget_snap,
        operator_preference=operator_tier_preference,
    )

    # 7. Lifecycle telemetry payloads (just build, don't emit)
    lifecycle_start = build_query_lifecycle_payload(
        session_id="e2e-test",
        stage="start",
        query_class=query_class,
        reasoning_budget=budget_plan,
        provider_selected=resolution.get("provider_selected", "mock"),
    )
    lifecycle_complete = build_query_lifecycle_payload(
        session_id="e2e-test",
        stage="complete",
        query_class=query_class,
        reasoning_budget=budget_plan,
        provider_selected=resolution.get("provider_selected", "mock"),
    )

    # 8. Decide whether the pipeline would succeed
    can_execute = False
    block_reason = None
    if execution_path == "local_direct":
        can_execute = bool(url_policy.get("allowed", False))
        if not can_execute:
            block_reason = str(url_policy.get("reason_code"))
    elif execution_path == "cloud_escalated":
        can_execute = bool(cloud_policy.get("allowed", False))
        if not can_execute:
            block_reason = str(cloud_policy.get("reason_code"))
    elif execution_path == "cloud_policy_blocked":
        block_reason = "STRATEGY_CLOUD_POLICY_BLOCKED"
    else:
        # mock_fallback always succeeds
        can_execute = True

    return {
        "url_policy": url_policy,
        "cloud_policy": cloud_policy,
        "execution_path": execution_path,
        "strategy": strategy,
        "query_class": query_class,
        "budget_plan": budget_plan,
        "hrm_budget": hrm_budget_snap,
        "tier": tier_sel.snapshot(tier_result),
        "lifecycle_start": lifecycle_start,
        "lifecycle_complete": lifecycle_complete,
        "can_execute": can_execute,
        "block_reason": block_reason,
        "provider_selected": resolution.get("provider_selected", "mock"),
        "fallback_used": bool(resolution.get("fallback_used", False)),
    }


# ── Mode 1: Local-Only ────────────────────────────────────────────────────────

class TestLocalOnlyMode(unittest.TestCase):
    """Full pipeline in local-only sovereign mode (no cloud, loopback URL)."""

    def setUp(self):
        self.base = dict(
            user_input="What is 2 + 2?",
            provider_name="local",
            local_llm_url="http://127.0.0.1:11434/api/generate",
            allow_outbound_network=False,
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )

    def test_local_provider_selects_local_direct(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertEqual(result["execution_path"], "local_direct")

    def test_loopback_url_is_allowed(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertTrue(result["url_policy"]["allowed"])
        self.assertEqual(result["url_policy"]["reason_code"], "OUTBOUND_LOOPBACK_ONLY")

    def test_cloud_escalation_blocked_by_policy(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertFalse(result["cloud_policy"]["allowed"])
        self.assertEqual(
            result["cloud_policy"]["reason_code"],
            "CLOUD_ESCALATION_DISABLED_BY_POLICY",
        )

    def test_pipeline_can_execute(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertTrue(result["can_execute"])
        self.assertIsNone(result["block_reason"])

    def test_simple_query_class_detected(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertEqual(result["query_class"], "simple")

    def test_hrm_budget_allocated(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertIn("passes", result["hrm_budget"])
        self.assertIn("hrm", result["hrm_budget"]["passes"])

    def test_lifecycle_payloads_have_correct_stage(self):
        result = _simulate_query_pipeline(**self.base)
        self.assertEqual(result["lifecycle_start"]["stage"], "start")
        self.assertEqual(result["lifecycle_complete"]["stage"], "complete")

    def test_operator_tier_preference_respected(self):
        result = _simulate_query_pipeline(**self.base, operator_tier_preference="heavy")
        self.assertEqual(result["tier"]["selected_tier"], "heavy")
        self.assertEqual(result["tier"]["reason"], "operator-preference")

    def test_deep_query_gets_more_cycles(self):
        result = _simulate_query_pipeline(
            **{**self.base, "user_input": "Perform multi-step reasoning and derive the architecture tradeoffs for a distributed system"}
        )
        simple_result = _simulate_query_pipeline(**self.base)
        self.assertGreaterEqual(
            result["budget_plan"]["max_cycles"],
            simple_result["budget_plan"]["max_cycles"],
        )


# ── Mode 2: Consented Cloud ───────────────────────────────────────────────────

class TestConsentedCloudMode(unittest.TestCase):
    """Full pipeline in cloud-escalated mode with explicit operator consent."""

    def _cloud_result(self, consent: bool = True, policy_enabled: bool = True):
        return _simulate_query_pipeline(
            user_input="Analyze the architecture tradeoffs of distributed systems",
            provider_name="gemini",
            local_llm_url="http://127.0.0.1:11434/api/generate",
            allow_outbound_network=True,
            allow_cloud_escalation=policy_enabled,
            require_cloud_escalation_consent=True,
            explicit_consent=consent,
        )

    def test_cloud_path_selected_with_consent(self):
        result = self._cloud_result(consent=True)
        self.assertEqual(result["execution_path"], "cloud_escalated")

    def test_cloud_allowed_with_consent(self):
        result = self._cloud_result(consent=True)
        self.assertTrue(result["cloud_policy"]["allowed"])
        self.assertEqual(
            result["cloud_policy"]["reason_code"],
            "CLOUD_ESCALATION_ALLOWED_WITH_CONSENT",
        )

    def test_pipeline_can_execute_with_consent(self):
        result = self._cloud_result(consent=True)
        self.assertTrue(result["can_execute"])

    def test_cloud_blocked_without_consent(self):
        result = self._cloud_result(consent=False)
        self.assertFalse(result["cloud_policy"]["allowed"])
        self.assertEqual(
            result["cloud_policy"]["reason_code"],
            "CLOUD_ESCALATION_CONSENT_REQUIRED",
        )
        self.assertFalse(result["can_execute"])

    def test_cloud_blocked_when_policy_disabled(self):
        result = self._cloud_result(consent=True, policy_enabled=False)
        self.assertFalse(result["cloud_policy"]["allowed"])
        self.assertEqual(
            result["cloud_policy"]["reason_code"],
            "CLOUD_ESCALATION_DISABLED_BY_POLICY",
        )
        self.assertFalse(result["can_execute"])

    def test_execution_path_blocked_without_consent(self):
        result = self._cloud_result(consent=False)
        # Strategy is still cloud_escalated (from capability), but pipeline can't execute
        self.assertIn(result["execution_path"], ("cloud_escalated", "cloud_policy_blocked"))

    def test_deep_query_class_for_complex_input(self):
        result = self._cloud_result(consent=True)
        self.assertIn(result["query_class"], ("deep", "analytical"))

    def test_tier_selector_works_in_cloud_mode(self):
        result = self._cloud_result(consent=True)
        self.assertIn("selected_tier", result["tier"])

    def test_provider_selected_is_gemini(self):
        result = self._cloud_result(consent=True)
        self.assertEqual(result["provider_selected"], "gemini")


# ── Mode 3: Offline ───────────────────────────────────────────────────────────

class TestOfflineMode(unittest.TestCase):
    """Full pipeline in offline mode: outbound blocked, non-loopback URL → mock."""

    def _offline_result(self, url: str = "http://192.168.1.100:11434/api/generate"):
        return _simulate_query_pipeline(
            user_input="Quick summary please",
            provider_name="local",
            local_llm_url=url,
            allow_outbound_network=False,
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )

    def test_non_loopback_url_blocked(self):
        result = self._offline_result()
        self.assertFalse(result["url_policy"]["allowed"])
        self.assertEqual(result["url_policy"]["reason_code"], "OUTBOUND_BLOCKED_NON_LOOPBACK")

    def test_local_direct_cannot_execute_when_url_blocked(self):
        result = self._offline_result()
        self.assertEqual(result["execution_path"], "local_direct")
        self.assertFalse(result["can_execute"])
        self.assertEqual(result["block_reason"], "OUTBOUND_BLOCKED_NON_LOOPBACK")

    def test_loopback_url_allowed_even_in_offline_config(self):
        result = self._offline_result(url="http://127.0.0.1:11434/api/generate")
        self.assertTrue(result["url_policy"]["allowed"])
        self.assertTrue(result["can_execute"])

    def test_mock_fallback_always_executable(self):
        result = _simulate_query_pipeline(
            user_input="Quick query",
            provider_name="mock",
            local_llm_url="http://192.168.1.100:11434/api/generate",
            allow_outbound_network=False,
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        self.assertEqual(result["execution_path"], "mock_fallback")
        self.assertTrue(result["can_execute"])

    def test_cloud_still_blocked_in_offline_mode(self):
        result = _simulate_query_pipeline(
            user_input="Quick query",
            provider_name="gemini",
            local_llm_url="http://192.168.1.100:11434/api/generate",
            allow_outbound_network=False,
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=True,  # consent doesn't override policy
        )
        self.assertFalse(result["cloud_policy"]["allowed"])

    def test_hrm_budget_still_allocated_in_offline_mode(self):
        result = self._offline_result()
        self.assertIn("passes", result["hrm_budget"])

    def test_lifecycle_telemetry_built_in_offline_mode(self):
        result = self._offline_result()
        self.assertEqual(result["lifecycle_start"]["stage"], "start")

    def test_reasoning_budget_still_planned_in_offline_mode(self):
        result = self._offline_result()
        self.assertIn("query_class", result["budget_plan"])
        self.assertIn("max_cycles", result["budget_plan"])


# ── Cross-Mode: consistency guarantees ───────────────────────────────────────

class TestCrossModeConsistency(unittest.TestCase):
    """Invariants that must hold across all three modes."""

    def _pipeline(self, **kwargs):
        defaults = dict(
            user_input="Test query",
            provider_name="local",
            local_llm_url="http://127.0.0.1:11434/api/generate",
            allow_outbound_network=False,
            allow_cloud_escalation=False,
            require_cloud_escalation_consent=True,
            explicit_consent=False,
        )
        return _simulate_query_pipeline(**{**defaults, **kwargs})

    def test_lifecycle_payloads_always_include_session_id(self):
        for mode_kwargs in [
            {},
            dict(allow_cloud_escalation=True, explicit_consent=True, provider_name="gemini"),
            dict(local_llm_url="http://192.168.1.100:11434/api/generate"),
        ]:
            result = self._pipeline(**mode_kwargs)
            self.assertEqual(result["lifecycle_start"]["session_id"], "e2e-test")
            self.assertEqual(result["lifecycle_complete"]["session_id"], "e2e-test")

    def test_hrm_budget_snapshot_always_has_passes(self):
        for mode_kwargs in [
            {},
            dict(allow_cloud_escalation=True, explicit_consent=True, provider_name="gemini"),
            dict(local_llm_url="http://192.168.1.100:11434/api/generate"),
        ]:
            result = self._pipeline(**mode_kwargs)
            self.assertIn("passes", result["hrm_budget"])

    def test_tier_selector_always_returns_valid_tier(self):
        valid_tiers = {"light", "standard", "heavy"}
        for mode_kwargs in [
            {},
            dict(allow_cloud_escalation=True, explicit_consent=True, provider_name="gemini"),
            dict(local_llm_url="http://192.168.1.100:11434/api/generate"),
        ]:
            result = self._pipeline(**mode_kwargs)
            self.assertIn(result["tier"]["selected_tier"], valid_tiers)

    def test_query_class_never_empty(self):
        for user_input in ["hi", "explain this complex architecture tradeoff", ""]:
            result = self._pipeline(user_input=user_input)
            self.assertIn(result["query_class"], ("simple", "analytical", "deep", "file_assisted"))

    def test_sovereignty_policy_cloud_never_leaks_in_local_only(self):
        """Cloud escalation must remain blocked regardless of consent when policy disabled."""
        for consent in (True, False):
            result = self._pipeline(
                allow_cloud_escalation=False,
                allow_outbound_network=False,
                explicit_consent=consent,
            )
            self.assertFalse(result["cloud_policy"]["allowed"])
            self.assertEqual(
                result["cloud_policy"]["reason_code"],
                "CLOUD_ESCALATION_DISABLED_BY_POLICY",
            )


if __name__ == "__main__":
    unittest.main()
