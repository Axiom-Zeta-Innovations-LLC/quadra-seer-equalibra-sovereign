from typing import Any, Dict


def normalize_disconnect_reason(value: Any) -> str:
    """Normalize disconnect reason values into stable analytics buckets."""
    normalized = str(value or '').strip().lower().replace('-', '_').replace(' ', '_')
    if normalized in ('', 'none', 'null', 'n/a', 'na', 'legacy', 'missing'):
        return 'unknown'

    alias_map = {
        'user': 'user_disconnect',
        'manual': 'user_disconnect',
        'manual_disconnect': 'user_disconnect',
        'user_cancel': 'user_disconnect',
        'client_close': 'user_disconnect',
        'socket_close': 'protocol_close',
        'remote_close': 'protocol_close',
        'connection_closed': 'protocol_close',
        'error': 'protocol_error',
        'transport_error': 'protocol_error',
        'network_error': 'protocol_error',
        'init_failed': 'initialization_failed',
        'startup_failed': 'initialization_failed',
    }
    normalized = alias_map.get(normalized, normalized)

    allowed = {
        'user_disconnect',
        'protocol_close',
        'protocol_error',
        'initialization_failed',
        'unknown',
    }
    return normalized if normalized in allowed else 'unknown'


def normalize_learning_event_payload(event: str, event_data: Any, voice_session_end_event: str) -> Dict[str, Any]:
    """Normalize incoming learning-event payloads for analytics consistency."""
    normalized: Dict[str, Any] = dict(event_data) if isinstance(event_data, dict) else {}

    if event == voice_session_end_event:
        raw_reason = (
            normalized.get('disconnect_reason')
            or normalized.get('end_reason')
            or normalized.get('reason')
            or normalized.get('disconnectReason')
        )
        normalized['disconnect_reason'] = normalize_disconnect_reason(raw_reason)

    return normalized
