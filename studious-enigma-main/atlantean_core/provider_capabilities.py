from __future__ import annotations

from typing import Any, Dict


def normalize_provider_name(name: str | None) -> str:
    provider = str(name or "").strip().lower()
    if provider in {"ollama", "llama.cpp", "llamacpp", "llama_cpp", "vllm"}:
        return "local"
    if provider in {"local", "gemini", "edenai", "mock"}:
        return provider
    return ""


def build_provider_capability_registry(
    *,
    local_backend: str,
    local_model: str,
    local_context_window: int,
) -> Dict[str, Dict[str, Any]]:
    backend = str(local_backend or "ollama").strip().lower()
    model = str(local_model or "local-model").strip()
    context_window = max(int(local_context_window or 0), 0)

    local_streaming = backend in {"ollama", "vllm", "llama.cpp", "llamacpp", "llama_cpp"}
    local_tool_calls = backend in {"ollama", "vllm"}

    return {
        "local": {
            "provider": "local",
            "inference_scope": "local",
            "context_window": context_window,
            "supports_streaming": local_streaming,
            "supports_tool_calls": local_tool_calls,
            "backend": backend,
            "model": model,
        },
        "gemini": {
            "provider": "gemini",
            "inference_scope": "cloud",
            "context_window": 1_000_000,
            "supports_streaming": True,
            "supports_tool_calls": True,
            "backend": "google-genai",
            "model": "gemini-2.5-flash",
        },
        "edenai": {
            "provider": "edenai",
            "inference_scope": "cloud",
            "context_window": 128_000,
            "supports_streaming": True,
            "supports_tool_calls": False,
            "backend": "edenai-aggregator",
            "model": "provider-dependent",
        },
        "mock": {
            "provider": "mock",
            "inference_scope": "mock",
            "context_window": 4_096,
            "supports_streaming": False,
            "supports_tool_calls": False,
            "backend": "mock",
            "model": "mock",
        },
    }


def resolve_provider_capability(
    provider_requested: str,
    registry: Dict[str, Dict[str, Any]],
    *,
    default_provider: str,
) -> Dict[str, Any]:
    requested = normalize_provider_name(provider_requested)
    default_norm = normalize_provider_name(default_provider) or "local"

    selected = requested if requested in registry else default_norm
    if selected not in registry:
        selected = "local"

    return {
        "provider_requested": requested or str(provider_requested or "").strip().lower(),
        "provider_selected": selected,
        "fallback_used": selected != requested,
        "capability": registry[selected],
    }
