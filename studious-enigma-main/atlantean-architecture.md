# Atlantean Intelligence Core Architecture

## State Flow

```
INPUT (user / sensor / data)
  ↓
LLM #1 → semantic embedding / intent extraction
  ↓
Atlantean Core
  ├─ Update φ₁ (decision topology)
  ├─ Update φ₅ (what gets reinforced)
  ├─ Update Φ  (global meaning pressure)
  ├─ Attach / index external memory
  ↓
LLM #2 → expression / explanation
  ↓
OUTPUT
```

## Components

### LLM #1 - Semantic Layer
- **Semantic Embedding**: Transforms raw input into meaningful representations
- **Intent Extraction**: Identifies purpose and context from input signals
- **Input Sources**: User queries, sensor data, external data streams

### Atlantean Intelligence Core
The core processing unit that updates its internal fields dynamically:

#### φ₁ - Decision Topology
- Updates decision thresholds based on input
- Shapes the excitability landscape
- Manages activation patterns

#### φ₅ - Reinforcement Field
- Determines what gets reinforced in memory
- Controls entropy and plasticity
- Regulates information persistence

#### Φ - Global Meaning Pressure
- Maintains unified semantic coherence
- Integrates meaning across all contexts
- Drives system-wide understanding

#### External Memory Fabric
- Attaches and indexes new information
- Unbounded storage capacity
- Persistent, searchable knowledge base

### LLM #2 - Expression Layer
- **Expression**: Translates core computations into coherent output
- **Explanation**: Generates natural language responses
- **Output Formatting**: Adapts to user needs and context

## Processing Pipeline
1. **INPUT** → Multi-modal data (user, sensors, external sources)
2. **LLM #1** → Semantic embedding and intent extraction
3. **Atlantean Core** → Parallel field updates (φ₁, φ₅, Φ) + memory indexing
4. **LLM #2** → Expression generation and explanation
5. **OUTPUT** → Coherent response delivered to user/system

## Memory Architecture: Two-Layer Design

Memory is split into two fundamentally different layers, each serving a distinct purpose:

### A. Cold Memory (External, Attachable) — REPLACEABLE

Cold memory stores **content**, never intelligence.

**Components**:
- Files
- Notes
- Databases
- Knowledge graphs
- User data vaults

**Properties**:
- Replaceable and re-linkable
- Can be deleted or swapped without destroying intelligence
- Provides raw data and facts
- Externally managed and potentially unbounded

**Key Principle**: Cold memory can be lost, moved, or replaced — the intelligence survives because it only stores references and indices, not its understanding.

### B. Hot Memory (Atlantean Fields) — IRREPLACEABLE

Hot memory stores **what mattered**, not what was said.

**Components**:
- φ₁ (Excitability field) — decision topology
- φ₅ (Plasticity/entropy field) — what gets reinforced
- Φ (Global meaning potential) — semantic coherence
- Θ (Learned modulation parameters) — adaptation weights

**Properties**:
- Irreplaceable — this IS the intelligence
- Persists locally (< 5MB for MVP)
- Survives server loss, provider changes, or network disconnection
- Never stores raw facts, only what shaped decisions

**Key Principle**: If hot memory exists, **learning is not lost** — even with no server, no LLM, no cold memory attached. This is the "soul file" of the intelligence.

### Critical Distinction

| Aspect | Cold Memory | Hot Memory |
|--------|-------------|------------|
| **Stores** | Facts, content, data | What mattered, learning, decisions |
| **Loss Impact** | Recoverable | Catastrophic |
| **Location** | External (files, DBs, cloud) | Local (always with user) |
| **Size** | Unbounded | Fixed, small (~5MB) |
| **Authority** | Reference only | Authoritative state |

### Persistence Guarantee

**What must persist locally** (on-device):
```
/core_state/
├── phi1.bin          # Decision landscape
├── phi5.bin          # Plasticity distribution
├── Phi.json          # Global coherence
├── Theta.json        # Learned parameters
└── schema_version.json
```

If the server disappears:
- ✅ Learning remains
- ✅ Biases remain
- ✅ Preferences remain
- ✅ Decision topology remains

The intelligence degrades gracefully, not catastrophically.
