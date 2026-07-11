# llm_interface.py
"""
Stateless LLM Interface

ENFORCED PRINCIPLE: The LLM has NO memory, NO history, NO state.

This module provides a strict interface to LLM APIs that prevents:
❌ System prompts with memory
❌ Conversation replay
❌ Agent scratchpads
❌ Tool memory
❌ Hidden context accumulation

The LLM is a PURE FUNCTION:
    Input (text) → Output (text)
    
Every call is independent. No state carries over.

All "learning" comes from post-hoc signals applied to hot memory,
NEVER from the LLM itself.
"""

from typing import Optional, Dict, Any
import logging

logger = logging.getLogger(__name__)


def call_llm(prompt: str, **kwargs) -> str:
    """
    Call LLM API with ZERO state.
    
    No memory.
    No history.
    No conversation context.
    No system prompt with accumulated knowledge.
    
    Every call is independent.
    
    Args:
        prompt: The input text (self-contained)
        **kwargs: Optional API parameters (temperature, max_tokens, etc.)
                  NOT for memory/context
        
    Returns:
        str: LLM response
        
    Note:
        If you need context, encode it in the hot memory fields
        and pass it as part of the prompt explicitly.
        Do NOT rely on conversation history.
    """
    # Import your LLM provider here
    # Examples: OpenAI, Anthropic, local models, etc.
    
    # CRITICAL: No conversation history, no system prompt with memory
    response = _llm_api_call(prompt, **kwargs)
    
    # Log the call for debugging, but don't store it
    logger.debug(f"LLM call: {len(prompt)} chars in, {len(response)} chars out")
    
    return response


def call_llm_with_context(prompt: str, hot_memory, **kwargs) -> str:
    """
    Call LLM with hot memory state encoded as context.
    
    This is the CORRECT way to provide context:
    1. Extract relevant info from hot memory
    2. Encode it explicitly in the prompt
    3. Call LLM (still stateless)
    4. Discard the prompt after response
    
    The LLM never sees the same prompt twice.
    The hot memory carries the state.
    
    Args:
        prompt: User input
        hot_memory: AtlanteanHotMemory instance
        **kwargs: LLM parameters
        
    Returns:
        str: LLM response
    """
    # Extract context from hot memory fields
    context = _encode_hot_memory_context(hot_memory)
    
    # Build self-contained prompt
    full_prompt = f"{context}\n\nUser: {prompt}"
    
    # Call LLM (stateless)
    response = call_llm(full_prompt, **kwargs)
    
    # IMPORTANT: We do NOT store this prompt or response
    # They are ephemeral. State lives in hot memory only.
    
    return response


def _encode_hot_memory_context(hot_memory) -> str:
    """
    Convert hot memory state into text context for LLM.
    
    This is HOW we provide "memory" without storing conversation history.
    
    The fields (φ₁, φ₅, Φ) encode what matters.
    We translate that into natural language.
    
    Returns:
        str: Text context derived from field state
    """
    import torch
    
    # Example: Extract high-level signals from fields
    avg_excitability = hot_memory.phi1.mean().item()
    avg_plasticity = hot_memory.phi5.mean().item()
    global_meaning = hot_memory.Phi.item()
    
    # Translate to natural language context
    context_parts = []
    
    if avg_excitability > 0.5:
        context_parts.append("Context: High decision confidence.")
    elif avg_excitability < -0.5:
        context_parts.append("Context: Uncertain state, needs clarification.")
    
    if avg_plasticity > 0.5:
        context_parts.append("Currently in learning mode.")
    elif avg_plasticity < 0.2:
        context_parts.append("Operating with established patterns.")
    
    if global_meaning > 0.7:
        context_parts.append("Strong semantic coherence.")
    elif global_meaning < 0.3:
        context_parts.append("Exploring new concepts.")
    
    # Include learned parameters if relevant
    if hot_memory.Theta:
        context_parts.append(f"Active parameters: {list(hot_memory.Theta.keys())}")
    
    return "\n".join(context_parts) if context_parts else "No specific context."


def _llm_api_call(prompt: str, **kwargs) -> str:
    """
    Actual LLM API call implementation.
    
    Replace this with your chosen provider:
    - OpenAI API
    - Anthropic API
    - Local model (llama.cpp, etc.)
    - Any other LLM
    
    MUST be stateless - no session, no history.
    """
    # Example: OpenAI
    # import openai
    # response = openai.ChatCompletion.create(
    #     model="gpt-4",
    #     messages=[{"role": "user", "content": prompt}],
    #     **kwargs
    # )
    # return response.choices[0].message.content
    
    # Example: Anthropic
    # import anthropic
    # client = anthropic.Client()
    # response = client.messages.create(
    #     model="claude-3-opus-20240229",
    #     messages=[{"role": "user", "content": prompt}],
    #     **kwargs
    # )
    # return response.content[0].text
    
    # Placeholder for now
    return f"[LLM response to: {prompt[:50]}...]"


# ========== Anti-Patterns (DO NOT USE) ==========

def _ANTI_PATTERN_conversation_history(messages: list) -> str:
    """
    ❌ DO NOT USE THIS
    
    This accumulates conversation history and sends it to the LLM.
    This violates the stateless principle.
    
    Instead: Encode state in hot memory, context in prompt.
    """
    raise NotImplementedError("Conversation history is not allowed in Atlantean architecture")


def _ANTI_PATTERN_system_prompt_with_memory(system: str, user: str) -> str:
    """
    ❌ DO NOT USE THIS
    
    System prompts with accumulated knowledge violate statelessness.
    
    Instead: Derive context from hot memory fields dynamically.
    """
    raise NotImplementedError("System prompts with memory are not allowed")


def _ANTI_PATTERN_agent_scratchpad(scratchpad: str, prompt: str) -> str:
    """
    ❌ DO NOT USE THIS
    
    Agent scratchpads that accumulate across calls are state.
    
    Instead: Use hot memory fields. Clear ephemeral data after each interaction.
    """
    raise NotImplementedError("Agent scratchpads are not allowed")


# ========== The Correct Pattern ==========

"""
Correct usage:

1. User provides input
   ↓
2. Extract context from hot_memory.phi1, phi5, Phi
   ↓
3. Build self-contained prompt
   ↓
4. Call LLM (stateless)
   ↓
5. Get response
   ↓
6. Apply learning signal to hot_memory based on outcome
   ↓
7. Discard prompt and response (don't store)
   ↓
8. Hot memory now contains updated state
   ↓
9. Next interaction starts fresh

The LLM never learns.
The hot memory learns.
The LLM is a translation function.
The hot memory is the intelligence.
"""


# ========== Usage Example ==========

"""
from llm_interface import call_llm_with_context
from learning import apply_learning_signal

# User provides input
user_input = "What should I do next?"

# Call LLM with hot memory context (stateless)
response = call_llm_with_context(user_input, hot_memory)

# Present to user
print(response)

# User confirms it was helpful → apply learning signal
apply_learning_signal(hot_memory, signal_strength=0.5)

# Save updated hot memory
hot_memory.save("core_state.bin")

# Note: We did NOT store:
# - The user input
# - The LLM response
# - Any conversation history

# We DID store:
# - Updated phi1, phi5, Phi fields
# - Learning signal effect on plasticity

This is the Atlantean way.
"""
