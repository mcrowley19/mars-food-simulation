import boto3
from botocore.exceptions import ClientError
from decimal import Decimal

TABLE_NAME = "greenhouse-state"
REGION = "us-west-2"

INITIAL_STATE = {
    "key": "current",
    "mission_day": 1,
    "crops": [],
    "environment": {
        "temp_c": 22,
        "co2_ppm": 800,
        "humidity_pct": 65,
        "light_hours": 12,
        "light_intensity": Decimal("1.0"),
    },
    "resources": {
        "water_l": 0,
        "nutrients_kg": 0,
    },
    "harvest_schedule": [],
    "alerts": [],
    "active_events": [],
    "agent_last_actions": {},
    "water_l": 0,
    "fertilizer_kg": 0,
    "soil_kg": 0,
    "floor_space_m2": 0,
    "mission_days": 0,
    "astronaut_count": 0,
    "seed_amounts": {},
    "setup_complete": False,
    "setup_mode": "NONE",
    "ai_setup_reasoning": "NONE",
}


def create_table(dynamodb):
    try:
        dynamodb.describe_table(TableName=TABLE_NAME)
        print(f"Table '{TABLE_NAME}' already exists — skipping creation.")
        return
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise

    print(f"Creating table '{TABLE_NAME}'...")
    dynamodb.create_table(
        TableName=TABLE_NAME,
        KeySchema=[{"AttributeName": "key", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "key", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )

    waiter = dynamodb.get_waiter("table_exists")
    waiter.wait(TableName=TABLE_NAME)
    print("Table is active.")


def seed_table():
    table = boto3.resource("dynamodb", region_name=REGION).Table(TABLE_NAME)
    table.put_item(Item=INITIAL_STATE)
    print("Seeded initial greenhouse state (mission_day=1).")


if __name__ == "__main__":
    client = boto3.client("dynamodb", region_name=REGION)
    create_table(client)
    seed_table()
    print("Done.")
