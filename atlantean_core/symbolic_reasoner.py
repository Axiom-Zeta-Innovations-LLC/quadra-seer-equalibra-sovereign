"""Compute-bounded symbolic reasoning module for QUADRA."""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Sequence, Tuple


_STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "if",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "then",
    "to",
    "was",
    "were",
    "with",
}


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _extract_symbols(text: str) -> List[str]:
    tokens = re.findall(r"[a-z0-9_]+", _normalize_text(text))
    out = [t for t in tokens if t not in _STOPWORDS and len(t) > 1]
    return out[:16]


def _parse_polarity(raw: str) -> Tuple[str, bool]:
    s = _normalize_text(raw)
    neg_prefixes = ("not ", "no ", "never ")
    for prefix in neg_prefixes:
        if s.startswith(prefix):
            return (s[len(prefix) :].strip(), False)
    return (s, True)


def _parse_rule(raw: str) -> Tuple[List[str], str] | None:
    text = _normalize_text(raw)
    if not text.startswith("if ") or " then " not in text:
        return None
    cond_text, cons_text = text[3:].split(" then ", 1)
    conditions = [c.strip() for c in cond_text.split(" and ") if c.strip()]
    consequence = cons_text.strip()
    if not conditions or not consequence:
        return None
    return conditions, consequence


@dataclass
class _InferenceNode:
    node_id: int
    proposition: str
    rule: str
    parents: List[int]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": int(self.node_id),
            "proposition": self.proposition,
            "rule": self.rule,
            "parents": list(self.parents),
        }


@dataclass
class SymbolicResult:
    summary: str
    rules_fired: List[str]
    confidence: float
    assertions: List[str]
    memory_hits: List[str]
    inferred: List[str]
    contradictions: List[Dict[str, Any]]
    resolved_assertions: List[str]
    inference_tree: List[Dict[str, Any]]
    schedule: List[str]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "rules_fired": list(self.rules_fired),
            "confidence": float(self.confidence),
            "assertions": list(self.assertions),
            "memory_hits": list(self.memory_hits),
            "inferred": list(self.inferred),
            "contradictions": list(self.contradictions),
            "resolved_assertions": list(self.resolved_assertions),
            "inference_tree": list(self.inference_tree),
            "schedule": list(self.schedule),
        }


class SymbolicReasoner:
    """Deterministic symbolic layer with graph memory and bounded reasoning."""

    def __init__(
        self,
        max_assertions: int = 8,
        max_chain_depth: int = 3,
        max_chain_expansions: int = 48,
        persistence_path: str | None = None,
    ):
        self.max_assertions = max_assertions
        self.max_chain_depth = max_chain_depth
        self.max_chain_expansions = max_chain_expansions
        self.persistence_path = persistence_path or os.getenv(
            "QUADRA_SYMBOLIC_STATE_PATH",
            "/tmp/quadra_symbolic_state.json",
        )
        self._state = self._load_state()

    def _default_state(self) -> Dict[str, Any]:
        return {
            "version": 2,
            "propositions": {},
            "rules": [],
            "edges": [],
            "updated_at": time.time(),
        }

    def _load_state(self) -> Dict[str, Any]:
        if not self.persistence_path:
            return self._default_state()
        try:
            if os.path.exists(self.persistence_path):
                with open(self.persistence_path, "r", encoding="utf-8") as fh:
                    loaded = json.load(fh)
                if isinstance(loaded, dict):
                    out = self._default_state()
                    out.update(loaded)
                    return out
        except Exception:
            pass
        return self._default_state()

    def _persist_state(self) -> None:
        if not self.persistence_path:
            return
        try:
            parent = os.path.dirname(self.persistence_path)
            if parent:
                os.makedirs(parent, exist_ok=True)
            self._state["updated_at"] = time.time()
            with open(self.persistence_path, "w", encoding="utf-8") as fh:
                json.dump(self._state, fh, indent=2, sort_keys=True)
        except Exception:
            # Persistence is best-effort; reasoning stays functional without disk writes.
            return

    def _upsert_proposition(self, raw_text: str, source: str) -> str:
        canonical, polarity = _parse_polarity(raw_text)
        if not canonical:
            return ""
        props = self._state.setdefault("propositions", {})
        bucket = props.setdefault(
            canonical,
            {
                "positive_support": 0,
                "negative_support": 0,
                "sources": [],
                "symbols": _extract_symbols(canonical),
                "last_seen": 0.0,
            },
        )
        if polarity:
            bucket["positive_support"] = int(bucket.get("positive_support", 0)) + 1
        else:
            bucket["negative_support"] = int(bucket.get("negative_support", 0)) + 1
        sources = bucket.setdefault("sources", [])
        if source not in sources:
            sources.append(source)
        bucket["symbols"] = _extract_symbols(canonical)
        bucket["last_seen"] = time.time()
        return canonical

    def _add_edges_from_text(self, raw_text: str, source: str) -> None:
        symbols = _extract_symbols(raw_text)
        if len(symbols) < 2:
            return
        edge_set = {tuple(edge) for edge in self._state.setdefault("edges", []) if isinstance(edge, list) and len(edge) == 3}
        for i in range(len(symbols) - 1):
            key = (symbols[i], symbols[i + 1], source)
            if key not in edge_set:
                edge_set.add(key)
        self._state["edges"] = [[a, b, c] for a, b, c in sorted(edge_set)]

    def _register_rule_if_present(self, raw_fact: str) -> bool:
        parsed = _parse_rule(raw_fact)
        if not parsed:
            return False
        conditions, consequence = parsed
        normalized = {
            "conditions": [_parse_polarity(c)[0] for c in conditions],
            "consequence": _parse_polarity(consequence)[0],
            "source": "context",
        }
        rules = self._state.setdefault("rules", [])
        if normalized not in rules:
            rules.append(normalized)
        return True

    def _retrieve_relevant_memory(self, query: str) -> List[str]:
        query_symbols = set(_extract_symbols(query))
        if not query_symbols:
            return []
        scored: List[Tuple[int, str]] = []
        for prop, payload in self._state.get("propositions", {}).items():
            symbols = set(payload.get("symbols", []))
            overlap = len(query_symbols.intersection(symbols))
            if overlap > 0:
                scored.append((overlap, prop))
        scored.sort(key=lambda t: (-t[0], t[1]))
        return [p for _, p in scored[: self.max_assertions]]

    def _resolve_contradictions(self) -> Tuple[List[Dict[str, Any]], List[str]]:
        contradictions: List[Dict[str, Any]] = []
        resolved: List[str] = []
        for proposition, payload in self._state.get("propositions", {}).items():
            pos = int(payload.get("positive_support", 0))
            neg = int(payload.get("negative_support", 0))
            if pos > 0 and neg > 0:
                winner = "positive" if pos >= neg else "negative"
                contradictions.append(
                    {
                        "proposition": proposition,
                        "positive_support": pos,
                        "negative_support": neg,
                        "winner": winner,
                    }
                )
                if winner == "positive":
                    resolved.append(proposition)
                else:
                    resolved.append(f"not {proposition}")
        return contradictions, resolved

    def _run_forward_chaining(self, seed_facts: Sequence[str], max_depth: int) -> Tuple[List[str], List[Dict[str, Any]]]:
        known = {_parse_polarity(f)[0] for f in seed_facts if _parse_polarity(f)[0]}
        inferred: List[str] = []
        tree_nodes: List[_InferenceNode] = []
        fact_to_node: Dict[str, int] = {}

        next_id = 1
        for fact in sorted(known):
            fact_to_node[fact] = next_id
            tree_nodes.append(_InferenceNode(next_id, fact, "observed", []))
            next_id += 1

        expansions = 0
        for _ in range(max(1, max_depth)):
            changed = False
            for rule in self._state.get("rules", [])[: self.max_chain_expansions]:
                if expansions >= self.max_chain_expansions:
                    break
                conds = [c for c in rule.get("conditions", []) if c]
                cons = rule.get("consequence", "")
                if not cons or not conds:
                    continue
                if all(c in known for c in conds) and cons not in known:
                    known.add(cons)
                    inferred.append(cons)
                    parent_ids = [fact_to_node[c] for c in conds if c in fact_to_node]
                    fact_to_node[cons] = next_id
                    tree_nodes.append(_InferenceNode(next_id, cons, "forward-chain", parent_ids))
                    next_id += 1
                    changed = True
                expansions += 1
            if not changed:
                break

        return inferred[: self.max_assertions], [n.to_dict() for n in tree_nodes[: self.max_chain_expansions]]

    def _build_reasoning_schedule(self, query: str, context_facts: Sequence[str] | None = None) -> List[str]:
        schedule = ["layer-1-grounding", "layer-2-memory-retrieval", "layer-3-rule-chaining", "layer-4-consistency-resolution"]
        text = _normalize_text(query)
        if any(k in text for k in ("why", "because", "cause")):
            schedule.append("layer-5-causal-synthesis")
        if any(k in text for k in ("plan", "steps", "schedule", "roadmap")):
            schedule.append("layer-5-procedural-synthesis")
        if context_facts:
            schedule.append("layer-6-context-grounding")
        return schedule

    def estimate_cost_ms(self, query: str, context_facts: Sequence[str] | None = None) -> float:
        fact_count = len(context_facts) if context_facts else 0
        rule_count = len(self._state.get("rules", []))
        prop_count = len(self._state.get("propositions", {}))
        schedule_cost = 0.35 * len(self._build_reasoning_schedule(query, context_facts))
        memory_cost = min(4.0, 0.05 * prop_count)
        chaining_cost = min(6.0, 0.08 * min(rule_count, self.max_chain_expansions))
        return 0.8 + min(len(query), 512) * 0.012 + fact_count * 0.24 + schedule_cost + memory_cost + chaining_cost

    def reason(self, query: str, context_facts: Sequence[str] | None = None) -> SymbolicResult:
        facts = [f.strip() for f in (context_facts or []) if str(f).strip()]
        text = _normalize_text(query)

        rules_fired: List[str] = []
        assertions: List[str] = []
        inferred: List[str] = []

        schedule = self._build_reasoning_schedule(query, facts)

        # Layer 1: Ground query and facts into persistent proposition graph.
        grounded: List[str] = []
        if text:
            q_prop = self._upsert_proposition(text, source="query")
            if q_prop:
                grounded.append(q_prop)
                self._add_edges_from_text(text, source="query")
        for fact in facts:
            if self._register_rule_if_present(fact):
                rules_fired.append("rule-registration")
            canonical = self._upsert_proposition(fact, source="context")
            if canonical:
                grounded.append(canonical)
                self._add_edges_from_text(fact, source="context")

        # Layer 2: Memory-aware retrieval from graph memory.
        memory_hits = self._retrieve_relevant_memory(text)
        if memory_hits:
            rules_fired.append("memory-retrieval")
            assertions.append(f"Retrieved {len(memory_hits)} relevant symbolic memories.")

        # Layer 3: Rule chaining and inference tree construction.
        chain_seed = list(dict.fromkeys(grounded + memory_hits))
        chain_depth = min(self.max_chain_depth, max(1, len(schedule) // 2))
        inferred, inference_tree = self._run_forward_chaining(chain_seed, max_depth=chain_depth)
        if inferred:
            rules_fired.append("forward-chaining")
            assertions.append(f"Derived {len(inferred)} inferred propositions via chaining.")
            for fact in inferred:
                self._upsert_proposition(fact, source="inference")

        # Layer 4: Contradiction detection and deterministic resolution.
        contradictions, resolved_assertions = self._resolve_contradictions()
        if contradictions:
            rules_fired.append("contradiction-resolution")
            assertions.append(f"Resolved {len(contradictions)} symbolic contradictions by support weighting.")

        if any(k in text for k in ("why", "because", "cause")):
            rules_fired.append("causal-analysis")
            assertions.append("User is requesting causal structure.")

        if any(k in text for k in ("plan", "steps", "schedule", "roadmap")):
            rules_fired.append("procedural-decomposition")
            assertions.append("User likely benefits from ordered steps.")

        if any(k in text for k in ("risk", "safe", "governance", "policy")):
            rules_fired.append("safety-governance")
            assertions.append("Response should include policy and control constraints.")

        if facts:
            rules_fired.append("context-grounding")
            assertions.append(f"Grounded on {len(facts)} explicit context facts.")

        if not rules_fired:
            rules_fired.append("default-interpretation")
            assertions.append("No specialized symbolic rule triggered.")

        assertions = assertions[: self.max_assertions]
        confidence = min(
            0.98,
            0.52
            + 0.06 * len(set(rules_fired))
            + 0.03 * len(inferred)
            + 0.02 * len(memory_hits),
        )
        summary = " | ".join(assertions)

        self._persist_state()

        return SymbolicResult(
            summary=summary,
            rules_fired=list(dict.fromkeys(rules_fired)),
            confidence=confidence,
            assertions=assertions,
            memory_hits=memory_hits,
            inferred=inferred,
            contradictions=contradictions,
            resolved_assertions=resolved_assertions,
            inference_tree=inference_tree,
            schedule=schedule,
        )
