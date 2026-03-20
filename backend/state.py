import os
import boto3
from decimal import Decimal
from contextvars import ContextVar

TABLE_NAME = os.environ.get("DYNAMODB_TABLE", "greenhouse-state")
REGION = os.environ.get("DYNAMODB_REGION", "us-west-2")

_table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
_SESSION_KEY_CTX: ContextVar[str] = ContextVar("session_key", default="current")


def normalize_session_key(raw: str | None) -> str:
    if not raw:
        return "current"
    safe = "".join(ch for ch in str(raw) if ch.isalnum() or ch in ("-", "_", "."))
    return safe[:96] or "current"


def set_request_session(session_key: str):
    return _SESSION_KEY_CTX.set(normalize_session_key(session_key))


def reset_request_session(token):
    _SESSION_KEY_CTX.reset(token)


def _resolve_session_key(explicit_key: str | None = None) -> str:
    if explicit_key is not None:
        return normalize_session_key(explicit_key)
    return normalize_session_key(_SESSION_KEY_CTX.get())


def _blank_state_for_session(session_key: str) -> dict:
    from setup_modes import _blank_state
    state = _blank_state()
    state["key"] = session_key
    return state


def _decimals_to_native(obj):
    """Convert DynamoDB Decimal types back to int/float and 'NONE' to None."""
    if obj == "NONE":
        return None
    if isinstance(obj, list):
        return [_decimals_to_native(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _decimals_to_native(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    return obj


def _native_to_decimals(obj):
    """Convert float/int to Decimal and None to 'NONE' for DynamoDB."""
    if obj is None:
        return "NONE"
    if isinstance(obj, bool):
        return obj
    if isinstance(obj, list):
        return [_native_to_decimals(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _native_to_decimals(v) for k, v in obj.items()}
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def get_state(session_key: str | None = None) -> dict:
    key = _resolve_session_key(session_key)
    resp = _table.get_item(Key={"key": key})
    item = resp.get("Item")
    if not item:
        fresh = _blank_state_for_session(key)
        update_state(fresh, session_key=key)
        return fresh
    return _decimals_to_native(item)


def update_state(state: dict, session_key: str | None = None):
    key = _resolve_session_key(session_key)
    state["key"] = key
    _table.put_item(Item=_native_to_decimals(state))


def delete_state(session_key: str | None = None) -> None:
    """Remove this session's item from DynamoDB (no-op if it does not exist)."""
    key = _resolve_session_key(session_key)
    _table.delete_item(Key={"key": key})


def append_alert(alert: dict, session_key: str | None = None):
    state = get_state(session_key=session_key)
    state["alerts"].append(alert)
    update_state(state, session_key=session_key)
