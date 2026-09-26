import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from event_normalization import (  # noqa: E402
    normalize_disconnect_reason,
    normalize_learning_event_payload,
)


VOICE_SESSION_END_EVENT = 'voice_session_end'
SIMULATION_COMPLETE_EVENT = 'simulation_complete'


class TestLearningEventNormalization(unittest.TestCase):
    def test_disconnect_reason_normalizes_aliases_and_missing_values(self):
        self.assertEqual(normalize_disconnect_reason(None), 'unknown')
        self.assertEqual(normalize_disconnect_reason(''), 'unknown')
        self.assertEqual(normalize_disconnect_reason('legacy'), 'unknown')
        self.assertEqual(normalize_disconnect_reason('manual disconnect'), 'user_disconnect')
        self.assertEqual(normalize_disconnect_reason('socket-close'), 'protocol_close')
        self.assertEqual(normalize_disconnect_reason('network_error'), 'protocol_error')
        self.assertEqual(normalize_disconnect_reason('init_failed'), 'initialization_failed')
        self.assertEqual(normalize_disconnect_reason('something_new'), 'unknown')

    def test_voice_payload_normalizes_legacy_keys(self):
        payload = normalize_learning_event_payload(
            VOICE_SESSION_END_EVENT,
            {'reason': 'manual', 'duration_seconds': 12.0},
            VOICE_SESSION_END_EVENT,
        )
        self.assertEqual(payload['disconnect_reason'], 'user_disconnect')
        self.assertEqual(payload['duration_seconds'], 12.0)

    def test_non_voice_payload_is_unchanged(self):
        payload = normalize_learning_event_payload(
            SIMULATION_COMPLETE_EVENT,
            {'outcome': 'success', 'coherence': 0.91},
            VOICE_SESSION_END_EVENT,
        )
        self.assertEqual(payload, {'outcome': 'success', 'coherence': 0.91})


if __name__ == '__main__':
    unittest.main()
