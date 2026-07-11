# hot_memory.py
import torch
import json
import time
import uuid
import hashlib
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

@dataclass
class AtlanteanHotMemory:
    phi1: torch.Tensor   # Excitability field
    phi5: torch.Tensor   # Plasticity / entropy field
    Phi: torch.Tensor    # Global meaning potential
    Theta: Dict          # Learned modulation parameters
    schema_version: int = 1
    identity_fingerprint: Optional[str] = None  # Cryptographic identity
    device_id: Optional[str] = None  # Device/instance identifier
    version: int = 0  # Local version counter for sync
    last_update: float = 0.0  # Timestamp of last modification
    cognitive_signature: str = ""  # Evolving state signature (hash-chain head)
    cognitive_signature_prev: str = ""  # Previous signature hash (for continuity)
    lineage_depth: int = 0  # Number of signature evolutions
    lineage_event: str = "genesis"  # Last lineage event label
    lineage_signature_hex: Optional[str] = None  # Optional cryptographic signature over cognitive_signature

    @staticmethod
    def initialize(grid_size=(32, 32), identity=None, device_id=None):
        """
        Initialize a new Atlantean hot memory instance.
        
        Args:
            grid_size: Tuple of (height, width) for field grids
            identity: Optional AtlanteanIdentity for cryptographic signing
            device_id: Optional device identifier (auto-generated if not provided)
            
        Returns:
            AtlanteanHotMemory instance
        """
        fingerprint = identity.fingerprint() if identity else None
        device = device_id or str(uuid.uuid4())

        # Deterministic initialization seed allows reproducible replay from genesis.
        seed_source = f"{fingerprint or 'no_identity'}::{device}"
        seed = int.from_bytes(hashlib.sha256(seed_source.encode('utf-8')).digest()[:8], byteorder='big')
        generator = torch.Generator()
        generator.manual_seed(seed)
        
        return AtlanteanHotMemory(
            phi1=torch.randn(grid_size, generator=generator),
            phi5=torch.ones(grid_size) * 0.1,
            Phi=torch.zeros(1),
            Theta={},
            identity_fingerprint=fingerprint,
            device_id=device,
            version=0,
            last_update=time.time()
        )._initialize_lineage()

    def _canonical_state_payload(self) -> Dict:
        """Canonical payload for deterministic state hashing/signing."""
        return {
            "phi1": self.phi1.tolist(),
            "phi5": self.phi5.tolist(),
            "Phi": self.Phi.tolist(),
            "Theta": self.Theta,
            "schema_version": self.schema_version,
            "identity_fingerprint": self.identity_fingerprint,
            "device_id": self.device_id,
            "version": self.version,
        }

    def _state_hash(self) -> str:
        payload = json.dumps(self._canonical_state_payload(), sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _initialize_lineage(self):
        """Ensure a deterministic genesis signature is present."""
        if self.cognitive_signature:
            return self
        genesis_payload = {
            "prev": "",
            "state_hash": self._state_hash(),
            "version": self.version,
            "event": "genesis",
            "device_id": self.device_id,
            "identity_fingerprint": self.identity_fingerprint,
        }
        raw = json.dumps(genesis_payload, sort_keys=True, separators=(",", ":"))
        self.cognitive_signature = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        self.cognitive_signature_prev = ""
        self.lineage_depth = max(1, int(self.lineage_depth or 0))
        self.lineage_event = "genesis"
        return self

    def _advance_cognitive_signature(self, event: str = "local_update", identity=None):
        """Advance hash-chain signature for each meaningful state transition."""
        self._initialize_lineage()
        previous = self.cognitive_signature
        transition_payload = {
            "prev": previous,
            "state_hash": self._state_hash(),
            "version": self.version,
            "event": event,
            "device_id": self.device_id,
            "identity_fingerprint": self.identity_fingerprint,
        }
        raw = json.dumps(transition_payload, sort_keys=True, separators=(",", ":"))
        self.cognitive_signature_prev = previous
        self.cognitive_signature = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        self.lineage_depth = int(self.lineage_depth) + 1
        self.lineage_event = event
        if identity is not None:
            try:
                self.lineage_signature_hex = identity.sign(self.cognitive_signature.encode("utf-8")).hex()
            except Exception:
                self.lineage_signature_hex = None

    @staticmethod
    def validate_continuity(previous_snapshot: Dict, current_snapshot: Dict, allow_equal_version: bool = False) -> Tuple[bool, str]:
        """Validate cognitive state continuity between two snapshots."""
        prev_device = previous_snapshot.get("device_id")
        curr_device = current_snapshot.get("device_id")
        if prev_device and curr_device and prev_device != curr_device:
            return False, "device-mismatch"

        prev_version = int(previous_snapshot.get("version", 0))
        curr_version = int(current_snapshot.get("version", 0))
        if allow_equal_version:
            if curr_version < prev_version:
                return False, "version-regressed"
        elif curr_version <= prev_version:
            return False, "version-not-advanced"

        prev_ts = float(previous_snapshot.get("timestamp", 0.0) or 0.0)
        curr_ts = float(current_snapshot.get("timestamp", 0.0) or 0.0)
        if curr_ts < prev_ts:
            return False, "timestamp-regressed"

        prev_sig = str(previous_snapshot.get("cognitive_signature", "") or "")
        curr_prev_sig = str(current_snapshot.get("cognitive_signature_prev", "") or "")
        if prev_sig and curr_version == (prev_version + 1) and curr_prev_sig != prev_sig:
            return False, "signature-chain-broken"
        if curr_version > prev_version and not str(current_snapshot.get("cognitive_signature", "") or ""):
            return False, "missing-current-signature"

        return True, "ok"

    # ---------- Versioned State Management ----------

    def snapshot(self):
        """
        Create a versioned snapshot of the current state.
        
        This is critical for sync: every snapshot is immutable and timestamped.
        
        Returns:
            Dict with all state + metadata
        """
        self._initialize_lineage()
        return {
            "phi1": self.phi1.clone(),
            "phi5": self.phi5.clone(),
            "Phi": self.Phi.clone(),
            "Theta": self.Theta.copy(),
            "device_id": self.device_id,
            "version": self.version,
            "timestamp": self.last_update,
            "identity_fingerprint": self.identity_fingerprint,
            "schema_version": self.schema_version,
            "cognitive_signature": self.cognitive_signature,
            "cognitive_signature_prev": self.cognitive_signature_prev,
            "lineage_depth": self.lineage_depth,
            "lineage_event": self.lineage_event,
            "lineage_signature_hex": self.lineage_signature_hex,
        }

    def apply_local_update(self, identity=None, event: str = "local_update"):
        """
        Mark that a local update has occurred.
        
        Increments version counter and updates timestamp.
        Call this after any modification to φ₁, φ₅, Φ, or Θ.
        
        CRITICAL: This is how sync knows what changed.
        """
        self.version += 1
        self.last_update = time.time()
        self._advance_cognitive_signature(event=event, identity=identity)

    def update_phi1(self, delta):
        """Update excitability field and increment version."""
        self.phi1 += delta
        self.apply_local_update(event="update_phi1")

    def update_phi5(self, delta):
        """Update plasticity field and increment version."""
        self.phi5 += delta
        self.apply_local_update(event="update_phi5")

    def update_Phi(self, delta):
        """Update global meaning potential and increment version."""
        self.Phi += delta
        self.apply_local_update(event="update_Phi")

    def update_Theta(self, key, value):
        """Update modulation parameters and increment version."""
        self.Theta[key] = value
        self.apply_local_update(event="update_Theta")

    # ---------- Persistence (NON-NEGOTIABLE) ----------

    def save(self, path: str, identity=None):
        """
        Save hot memory state with optional cryptographic signature.
        
        Args:
            path: File path to save to
            identity: Optional AtlanteanIdentity for signing the save
        """
        self._initialize_lineage()
        save_data = {
            "phi1": self.phi1,
            "phi5": self.phi5,
            "Phi": self.Phi,
            "Theta": self.Theta,
            "schema_version": self.schema_version,
            "identity_fingerprint": self.identity_fingerprint,
            "device_id": self.device_id,
            "version": self.version,
            "last_update": self.last_update,
            "cognitive_signature": self.cognitive_signature,
            "cognitive_signature_prev": self.cognitive_signature_prev,
            "lineage_depth": self.lineage_depth,
            "lineage_event": self.lineage_event,
            "lineage_signature_hex": self.lineage_signature_hex,
        }
        
        # Add signature if identity provided
        if identity:
            state_bytes = json.dumps(self._canonical_state_payload(), sort_keys=True).encode('utf-8')
            signature = identity.sign(state_bytes)
            save_data["signature"] = signature
            try:
                save_data["lineage_signature_hex"] = identity.sign(self.cognitive_signature.encode("utf-8")).hex()
            except Exception:
                pass
        
        torch.save(save_data, path)

    @staticmethod
    def load(path: str, verify_identity=None):
        """
        Load hot memory state with optional signature verification.
        
        Args:
            path: File path to load from
            verify_identity: Optional AtlanteanIdentity to verify signature
            
        Returns:
            AtlanteanHotMemory instance
            
        Raises:
            ValueError: If signature verification fails
        """
        data = torch.load(path)
        
        # Verify signature if requested
        if verify_identity and "signature" in data:
            state_bytes = json.dumps({
                "phi1": data["phi1"].tolist(),
                "phi5": data["phi5"].tolist(),
                "Phi": data["Phi"].tolist(),
                "Theta": data["Theta"],
                "schema_version": data.get("schema_version", 1),
                "identity_fingerprint": data.get("identity_fingerprint"),
                "device_id": data.get("device_id"),
                "version": data.get("version", 0),
            }, sort_keys=True).encode('utf-8')
            
            if not verify_identity.verify(state_bytes, data["signature"]):
                raise ValueError("Signature verification failed! Core state may be corrupted.")

            sig_hex = data.get("lineage_signature_hex")
            if sig_hex and not verify_identity.verify(
                str(data.get("cognitive_signature", "")).encode("utf-8"),
                bytes.fromhex(sig_hex),
            ):
                raise ValueError("Lineage signature verification failed! Cognitive lineage may be corrupted.")
        
        loaded = AtlanteanHotMemory(
            phi1=data["phi1"],
            phi5=data["phi5"],
            Phi=data["Phi"],
            Theta=data["Theta"],
            schema_version=data.get("schema_version", 1),
            identity_fingerprint=data.get("identity_fingerprint"),
            device_id=data.get("device_id"),
            version=data.get("version", 0),
            last_update=data.get("last_update", time.time()),
            cognitive_signature=data.get("cognitive_signature", ""),
            cognitive_signature_prev=data.get("cognitive_signature_prev", ""),
            lineage_depth=data.get("lineage_depth", 0),
            lineage_event=data.get("lineage_event", "load"),
            lineage_signature_hex=data.get("lineage_signature_hex"),
        )
        return loaded._initialize_lineage()
