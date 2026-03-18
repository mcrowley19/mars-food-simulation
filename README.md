# Mars Food Simulation

This project runs without Kiro. Use any editor and the terminal.

## What is in this repo

- `frontend/`: React + Vite + Three.js landing experience
- `backend/`: placeholder backend code
- `scripts/`: no-Kiro setup/run automation

## Prerequisites

- Node.js `>= 18`
- npm
- Git
- AWS CLI
- Python 3 + pip

## One-time setup

From repo root:

```bash
chmod +x scripts/*.sh
./scripts/setup-no-kiro.sh
cp .env.example .env
```

Then edit `.env` with your real AWS credentials and values.

## Run locally

Frontend:

```bash
./scripts/run-frontend.sh
```

Open [http://localhost:5173](http://localhost:5173).

## Amplify sandbox (only if this repo is Amplify-enabled)

If your project contains Amplify config (`amplify/` or `amplify.yml`), run:

```bash
./scripts/run-ampx-sandbox.sh
```

If this repo is not Amplify-enabled yet, scaffold one separately:

```bash
npm create amplify@latest mars-tomato-app
cd mars-tomato-app
npm install
npm run dev
```

In a second terminal:

```bash
npx ampx sandbox
```

## MCP knowledge base without Kiro

Without Kiro, do not use `.kiro/settings/mcp.json`.
Use either:

- direct HTTP calls to your MCP endpoint (`MCP_KB_URL`), or
- your editor/runtime's own MCP configuration format.
