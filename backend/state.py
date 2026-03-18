import boto3
from decimal import Decimal

TABLE_NAME = "greenhouse-state"
REGION = "us-west-2"

_table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)


def _decimals_to_native(obj):
    """Convert DynamoDB Decimal types back to int/float."""
    if isinstance(obj, list):
        return [_decimals_to_native(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _decimals_to_native(v) for k, v in obj.items()}
    if isinstance(obj, Decimal):
        return int(obj) if obj == int(obj) else float(obj)
    return obj


def _native_to_decimals(obj):
    """Convert float/int to Decimal for DynamoDB."""
    if isinstance(obj, list):
        return [_native_to_decimals(i) for i in obj]
    if isinstance(obj, dict):
        return {k: _native_to_decimals(v) for k, v in obj.items()}
    if isinstance(obj, float):
        return Decimal(str(obj))
    return obj


def get_state() -> dict:
    resp = _table.get_item(Key={"key": "current"})
    return _decimals_to_native(resp["Item"])


def update_state(state: dict):
    state["key"] = "current"
    _table.put_item(Item=_native_to_decimals(state))


def append_alert(alert: dict):
    state = get_state()
    state["alerts"].append(alert)
    update_state(state)
