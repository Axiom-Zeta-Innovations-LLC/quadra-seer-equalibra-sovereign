# learning.py
import torch


def _deterministic_modulation(field: torch.Tensor) -> torch.Tensor:
    """
    Build a deterministic spatial modulation map in [0.5, 1.5].

    This replaces stochastic noise so updates are replayable across runs.
    """
    h, w = field.shape
    rows = torch.arange(h, dtype=field.dtype, device=field.device).unsqueeze(1)
    cols = torch.arange(w, dtype=field.dtype, device=field.device).unsqueeze(0)
    # Bounded periodic pattern; no RNG involved.
    return 1.0 + 0.5 * torch.sin((rows + 1.0) * 0.17) * torch.cos((cols + 1.0) * 0.11)

def apply_learning_signal(hot_memory, signal_strength: float):
    """
    Apply a learning signal to the Atlantean hot memory fields.
    
    CRITICAL PRINCIPLE:
    Learning happens ONLY here, never in the LLM.
    
    The signal_strength comes from:
    - Interaction outcomes (did the response help?)
    - User feedback (explicit corrections, confirmations)
    - Coherence measures (did predictions hold?)
    - Relevance scores (did retrieval match intent?)
    
    NOT from:
    ❌ LLM internal states
    ❌ Prompt engineering
    ❌ Conversation context
    ❌ Hidden agent memory
    
    Args:
        hot_memory: AtlanteanHotMemory instance to modify
        signal_strength: Float in range [-1, 1]
            Positive = reinforce current patterns
            Negative = destabilize/forget current patterns
            
    Side effects:
        - Modulates φ₅ (plasticity field)
        - Reshapes φ₁ (decision topology)
        - Stabilizes Φ (global meaning)
        - Increments version counter
    """
    # Reinforce plasticity field with deterministic modulation.
    # This preserves replayability and cryptographic verifiability.
    modulation = _deterministic_modulation(hot_memory.phi5)
    hot_memory.phi5 += signal_strength * modulation * 0.01

    # Decision topology slowly reshapes based on plasticity
    # Strong plasticity → decision boundaries adapt
    hot_memory.phi1 += 0.001 * torch.tanh(hot_memory.phi5)

    # Global meaning potential stabilizes toward signal
    # This is the "does this make sense overall?" pressure
    hot_memory.Phi = 0.95 * hot_memory.Phi + 0.05 * torch.tensor([signal_strength])

    # Mark that learning occurred (required for sync)
    hot_memory.apply_local_update()


def apply_contradiction_signal(hot_memory, location_mask=None):
    """
    Apply a contradiction signal to destabilize incorrect patterns.
    
    When the intelligence is corrected or contradicted:
    - Reduce plasticity in the contradicted region
    - Flatten decision topology to allow re-learning
    - Slightly decrease global coherence
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        location_mask: Optional torch.Tensor mask indicating where contradiction occurred
                      If None, applies globally with small magnitude
    """
    if location_mask is None:
        # Global small destabilization
        hot_memory.phi5 *= 0.98
        hot_memory.phi1 *= 0.99
    else:
        # Localized strong destabilization
        hot_memory.phi5 = torch.where(location_mask, hot_memory.phi5 * 0.9, hot_memory.phi5)
        hot_memory.phi1 = torch.where(location_mask, hot_memory.phi1 * 0.95, hot_memory.phi1)
    
    # Reduce global coherence (uncertainty increased)
    hot_memory.Phi *= 0.95
    
    hot_memory.apply_local_update()


def apply_relevance_signal(hot_memory, relevance_score: float, spatial_focus=None):
    """
    Apply a relevance signal based on retrieval success.
    
    When cold memory retrieval succeeds:
    - Reinforce plasticity in relevant areas
    - This biases future attention toward similar patterns
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        relevance_score: Float in [0, 1] indicating retrieval quality
        spatial_focus: Optional indices or mask for localized reinforcement
    """
    if spatial_focus is None:
        # Global reinforcement
        hot_memory.phi5 += relevance_score * 0.02
    else:
        # Localized reinforcement
        hot_memory.phi5[spatial_focus] += relevance_score * 0.05
    
    # Clamp to prevent runaway
    hot_memory.phi5 = torch.clamp(hot_memory.phi5, min=0.01, max=1.0)
    
    hot_memory.apply_local_update()


def apply_outcome_signal(hot_memory, predicted: bool, actual: bool):
    """
    Apply learning signal based on prediction vs reality.
    
    If intelligence made a prediction/simulation and we now know the outcome:
    - Reinforce if correct
    - Destabilize if incorrect
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        predicted: What the intelligence predicted would happen
        actual: What actually happened
    """
    if predicted == actual:
        # Correct prediction → reinforce
        apply_learning_signal(hot_memory, signal_strength=0.3)
    else:
        # Incorrect prediction → destabilize
        apply_contradiction_signal(hot_memory)


# ========== Learning Economics ==========

def compute_learning_capacity(hot_memory):
    """
    Compute how much "room to learn" the current state has.
    
    High plasticity = high capacity
    Saturated fields = low capacity
    
    Returns:
        Float in [0, 1] indicating learning headroom
    """
    avg_plasticity = hot_memory.phi5.mean().item()
    saturation = (hot_memory.phi1.abs() > 0.9).float().mean().item()
    
    capacity = avg_plasticity * (1 - saturation)
    return float(torch.clamp(torch.tensor(capacity), 0, 1))


def should_consolidate(hot_memory, threshold=0.1):
    """
    Determine if memory should be consolidated (plasticity reduced).
    
    After extensive learning, plasticity should decrease to "lock in" patterns.
    
    Returns:
        bool: True if consolidation recommended
    """
    capacity = compute_learning_capacity(hot_memory)
    return capacity < threshold


def consolidate_memory(hot_memory, strength=0.9):
    """
    Consolidate learned patterns by reducing plasticity.
    
    This "hardens" the current decision topology.
    Use sparingly - makes future learning harder.
    
    Args:
        hot_memory: AtlanteanHotMemory instance
        strength: How much to consolidate (0=none, 1=full freeze)
    """
    hot_memory.phi5 *= (1 - strength)
    hot_memory.phi5 = torch.clamp(hot_memory.phi5, min=0.01)
    
    hot_memory.apply_local_update()
