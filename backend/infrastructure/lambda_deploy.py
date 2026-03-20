#!/usr/bin/env python3
"""Deploy api.py as an AWS Lambda function behind API Gateway."""

import json
import os
import subprocess
import sys
import tempfile
import time
import zipfile

import boto3
from botocore.exceptions import ClientError, NoCredentialsError

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(_SCRIPT_DIR, ".."))
AGENTCORE_ARN_FILE = os.path.join(BACKEND_DIR, ".agentcore-arn.txt")

REGION = os.environ.get("AWS_DEFAULT_REGION", "us-west-2")
# Set in main() after optional .env load — avoids import-time STS and gives clearer credential errors.
ACCOUNT_ID = None


def _load_backend_dotenv():
    env_path = os.path.join(BACKEND_DIR, ".env")
    if not os.path.isfile(env_path):
        return
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path)
    except ImportError:
        pass


def _die_no_credentials():
    print("\nERROR: Unable to locate AWS credentials (NoCredentialsError).\n", file=sys.stderr)
    print("Configure one of the following, then retry:\n", file=sys.stderr)
    print("  1) backend/.env — copy backend/.env.example and set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY", file=sys.stderr)
    print("     (and AWS_SESSION_TOKEN if using temporary credentials).\n", file=sys.stderr)
    print("  2) AWS CLI — run: aws configure\n", file=sys.stderr)
    print("  3) Named profile — export AWS_PROFILE=your-profile", file=sys.stderr)
    print("     (with SSO: aws sso login --profile your-profile)\n", file=sys.stderr)
    sys.exit(1)

FUNCTION_NAME = "mars-greenhouse-api"
ROLE_NAME = "mars-greenhouse-api-lambda-role"
API_NAME = "mars-greenhouse-api"

SKIP_DIRS = {".venv", "__pycache__", ".git", "node_modules", "infrastructure",
             "amplify", ".amplify", "Pipfile", "Pipfile.lock"}
SKIP_FILES = {".env", ".env.example", ".bedrock_agentcore.yaml",
              ".agentcore-arn.txt", ".api-gateway-url.txt", "Dockerfile",
              "test_setup_modes.py"}


def get_agentcore_arn():
    arn_path = os.path.abspath(AGENTCORE_ARN_FILE)
    if not os.path.exists(arn_path):
        print(f"ERROR: {arn_path} not found. Deploy to AgentCore first.")
        sys.exit(1)
    return open(arn_path).read().strip()


def create_deployment_package():
    """Install deps and zip the backend into a Lambda package."""
    print("Building deployment package...")
    tmp = tempfile.mkdtemp()
    pkg_dir = os.path.join(tmp, "package")
    os.makedirs(pkg_dir)

    # Install dependencies for Linux x86_64 Lambda runtime
    subprocess.check_call([
        sys.executable, "-m", "pip", "install",
        "-r", os.path.join(BACKEND_DIR, "requirements.txt"),
        "-t", pkg_dir, "--quiet",
        "--platform", "manylinux2014_x86_64",
        "--implementation", "cp",
        "--python-version", "3.11",
        "--only-binary=:all:"
    ])

    # Copy backend source files
    backend = os.path.abspath(BACKEND_DIR)
    for root, dirs, files in os.walk(backend):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        rel = os.path.relpath(root, backend)
        for f in files:
            if f in SKIP_FILES or f.endswith(".pyc"):
                continue
            src = os.path.join(root, f)
            dst = os.path.join(pkg_dir, rel, f)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(src, "rb") as sf, open(dst, "wb") as df:
                df.write(sf.read())

    # Zip it
    zip_path = os.path.join(tmp, "lambda.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(pkg_dir):
            for f in files:
                fpath = os.path.join(root, f)
                arcname = os.path.relpath(fpath, pkg_dir)
                zf.write(fpath, arcname)

    size_mb = os.path.getsize(zip_path) / (1024 * 1024)
    print(f"  Package size: {size_mb:.1f} MB")
    return zip_path


def ensure_lambda_role(iam):
    """Create IAM role for Lambda if it doesn't exist."""
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole"
        }]
    }

    try:
        resp = iam.get_role(RoleName=ROLE_NAME)
        role_arn = resp["Role"]["Arn"]
        print(f"  Reusing existing role: {role_arn}")
    except ClientError as e:
        if e.response["Error"]["Code"] != "NoSuchEntity":
            raise
        print(f"  Creating IAM role: {ROLE_NAME}")
        resp = iam.create_role(
            RoleName=ROLE_NAME,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Lambda execution role for Mars Greenhouse API"
        )
        role_arn = resp["Role"]["Arn"]

    # Attach policies
    policies = [
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ]
    for p in policies:
        try:
            iam.attach_role_policy(RoleName=ROLE_NAME, PolicyArn=p)
        except Exception:
            pass

    # Inline policy for DynamoDB + AgentCore
    inline_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": ["dynamodb:GetItem", "dynamodb:PutItem",
                           "dynamodb:UpdateItem", "dynamodb:DeleteItem",
                           "dynamodb:Scan", "dynamodb:Query"],
                "Resource": f"arn:aws:dynamodb:{REGION}:{ACCOUNT_ID}:table/greenhouse-state"
            },
            {
                "Effect": "Allow",
                "Action": ["bedrock-agentcore:InvokeAgentRuntime"],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
                "Resource": "*"
            },
            {
                "Effect": "Allow",
                "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                "Resource": "*"
            }
        ]
    }
    iam.put_role_policy(
        RoleName=ROLE_NAME,
        PolicyName="mars-greenhouse-permissions",
        PolicyDocument=json.dumps(inline_policy)
    )

    return role_arn


def upload_to_s3(zip_path):
    """Upload Lambda zip to S3 for large packages."""
    s3 = boto3.client("s3", region_name=REGION)
    bucket = f"mars-greenhouse-lambda-{ACCOUNT_ID}-{REGION}"
    try:
        s3.head_bucket(Bucket=bucket)
    except ClientError:
        print(f"  Creating S3 bucket: {bucket}")
        if REGION == "us-east-1":
            s3.create_bucket(Bucket=bucket)
        else:
            s3.create_bucket(
                Bucket=bucket,
                CreateBucketConfiguration={"LocationConstraint": REGION}
            )
    key = "lambda/mars-greenhouse-api.zip"
    print(f"  Uploading to s3://{bucket}/{key}...")
    s3.upload_file(zip_path, bucket, key)
    return bucket, key


def deploy_lambda(lam, role_arn, zip_path, agentcore_arn):
    """Create or update the Lambda function."""
    bucket, key = upload_to_s3(zip_path)

    env_vars = {
        "AGENTCORE_ARN": agentcore_arn,
        "DYNAMODB_REGION": REGION,
        "DYNAMODB_TABLE": "greenhouse-state",
    }

    try:
        lam.get_function(FunctionName=FUNCTION_NAME)
        print(f"  Updating Lambda function: {FUNCTION_NAME}")
        lam.update_function_code(
            FunctionName=FUNCTION_NAME,
            S3Bucket=bucket,
            S3Key=key
        )
        # Wait for code update to complete
        print("  Waiting for code update to finish...")
        waiter = lam.get_waiter("function_updated_v2")
        waiter.wait(FunctionName=FUNCTION_NAME)
        lam.update_function_configuration(
            FunctionName=FUNCTION_NAME,
            Environment={"Variables": env_vars},
            Timeout=120,
            MemorySize=512
        )
    except ClientError as e:
        if e.response["Error"]["Code"] != "ResourceNotFoundException":
            raise
        print(f"  Creating Lambda function: {FUNCTION_NAME}")
        # Wait for role to propagate
        print("  Waiting for IAM role propagation...")
        time.sleep(10)
        lam.create_function(
            FunctionName=FUNCTION_NAME,
            Runtime="python3.11",
            Role=role_arn,
            Handler="api.lambda_handler",
            Code={"S3Bucket": bucket, "S3Key": key},
            Timeout=120,
            MemorySize=512,
            Environment={"Variables": env_vars},
            Architectures=["x86_64"]
        )

    # Wait for function to be active
    print("  Waiting for Lambda to be active...")
    for _ in range(30):
        resp = lam.get_function(FunctionName=FUNCTION_NAME)
        state = resp["Configuration"]["State"]
        if state == "Active":
            break
        time.sleep(2)
    else:
        print(f"  WARNING: Lambda state is {state} after waiting")

    print(f"  Lambda function ready: {FUNCTION_NAME}")
    return resp["Configuration"]["FunctionArn"]


def ensure_api_gateway(apigw, lambda_arn):
    """Create or find an HTTP API Gateway linked to the Lambda."""
    # Check for existing API
    apis = apigw.get_apis().get("Items", [])
    api_id = None
    for api in apis:
        if api["Name"] == API_NAME:
            api_id = api["ApiId"]
            print(f"  Reusing API Gateway: {api_id}")
            break

    if not api_id:
        print(f"  Creating API Gateway: {API_NAME}")
        resp = apigw.create_api(
            Name=API_NAME,
            ProtocolType="HTTP",
            CorsConfiguration={
                "AllowOrigins": ["*"],
                "AllowMethods": ["*"],
                "AllowHeaders": ["*"],
            }
        )
        api_id = resp["ApiId"]

    # Create or update Lambda integration
    integrations = apigw.get_integrations(ApiId=api_id).get("Items", [])
    integration_id = None
    for integ in integrations:
        if integ.get("IntegrationUri") == lambda_arn:
            integration_id = integ["IntegrationId"]
            break

    if not integration_id:
        resp = apigw.create_integration(
            ApiId=api_id,
            IntegrationType="AWS_PROXY",
            IntegrationUri=lambda_arn,
            PayloadFormatVersion="2.0"
        )
        integration_id = resp["IntegrationId"]

    # Create catch-all route
    routes = apigw.get_routes(ApiId=api_id).get("Items", [])
    has_catchall = any(r["RouteKey"] == "$default" for r in routes)
    if not has_catchall:
        apigw.create_route(
            ApiId=api_id,
            RouteKey="$default",
            Target=f"integrations/{integration_id}"
        )

    # Create or get default stage with auto-deploy
    try:
        apigw.create_stage(
            ApiId=api_id,
            StageName="$default",
            AutoDeploy=True
        )
    except ClientError as e:
        if "ConflictException" not in str(type(e)):
            try:
                apigw.update_stage(
                    ApiId=api_id,
                    StageName="$default",
                    AutoDeploy=True
                )
            except Exception:
                pass

    # Grant API Gateway permission to invoke Lambda
    lam = boto3.client("lambda", region_name=REGION)
    try:
        lam.add_permission(
            FunctionName=FUNCTION_NAME,
            StatementId="apigateway-invoke",
            Action="lambda:InvokeFunction",
            Principal="apigateway.amazonaws.com",
            SourceArn=f"arn:aws:execute-api:{REGION}:{ACCOUNT_ID}:{api_id}/*"
        )
    except ClientError as e:
        if "ResourceConflictException" not in str(type(e)):
            pass  # Permission may already exist

    api_url = f"https://{api_id}.execute-api.{REGION}.amazonaws.com"
    print(f"  API Gateway URL: {api_url}")
    return api_url


def main():
    global REGION, ACCOUNT_ID

    _load_backend_dotenv()
    REGION = os.environ.get("AWS_DEFAULT_REGION", REGION)
    try:
        ACCOUNT_ID = boto3.client("sts", region_name=REGION).get_caller_identity()["Account"]
    except NoCredentialsError:
        _die_no_credentials()

    agentcore_arn = get_agentcore_arn()
    print(f"AgentCore ARN: {agentcore_arn}")

    iam = boto3.client("iam", region_name=REGION)
    lam = boto3.client("lambda", region_name=REGION)
    apigw = boto3.client("apigatewayv2", region_name=REGION)

    print("\n--- Step 1: IAM Role ---")
    role_arn = ensure_lambda_role(iam)

    print("\n--- Step 2: Build Package ---")
    zip_path = create_deployment_package()

    print("\n--- Step 3: Deploy Lambda ---")
    lambda_arn = deploy_lambda(lam, role_arn, zip_path, agentcore_arn)

    print("\n--- Step 4: API Gateway ---")
    api_url = ensure_api_gateway(apigw, lambda_arn)

    # Save URL
    url_file = os.path.join(BACKEND_DIR, ".api-gateway-url.txt")
    with open(url_file, "w") as f:
        f.write(api_url + "\n")

    print(f"\n{'='*60}")
    print(f"Deployment complete!")
    print(f"  API Gateway URL: {api_url}")
    print(f"  Lambda function: {FUNCTION_NAME}")
    print(f"  AgentCore ARN:   {agentcore_arn}")
    print(f"  URL saved to:    {url_file}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
