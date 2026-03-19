# Mars Food Simulation

A multi-agent simulation platform for planning sustainable agriculture on Mars. Uses AI agents (via AWS Strands + Bedrock) to coordinate crop planning, environment monitoring, and resource management for a Martian greenhouse mission. Features a 3D Three.js colony visualization with real-time data binding.

## Architecture

```
mars-food-simulation/
├── frontend/                React + Vite + Three.js UI
│   ├── src/
│   │   ├── main.jsx                Entry point (animated favicon, Amplify)
│   │   ├── App.jsx                 Landing page + session init router
│   │   ├── marsFavicon.js          3D rotating Mars favicon (Three.js)
│   │   ├── components/
│   │   │   ├── Mars.jsx            3D Mars globe (NASA texture + atmosphere shader)
│   │   │   ├── Stars.jsx           Starfield background
│   │   │   ├── InitialiseSession   Mission parameter config UI
│   │   │   ├── LearnMore           Platform overview overlay
│   │   │   └── greenhouse/
│   │   │       ├── GreenhouseScene  Main 3D colony scene (React component)
│   │   │       ├── constants        Shared constants and helpers
│   │   │       ├── sceneSetup       Three.js scene, terrain, lighting
│   │   │       ├── domeBuilder      Dome shells, ribs, interiors, planters
│   │   │       ├── cropRenderer     Crop visuals, soil state, events
│   │   │       └── hudUpdater       HUD data computation
│   │   └── hooks/
│   │       └── useGreenhouseState   Polls backend state every 5s
│   └── public/
│       ├── mars-texture.jpg         Mars surface texture (landing + greenhouse)
│       ├── favicon.svg              Static fallback favicon
│       └── site.webmanifest         PWA manifest
│
├── backend/
│   ├── api.py                       FastAPI server (REST endpoints)
│   ├── main.py                      Bedrock AgentCore entrypoint
│   ├── state.py                     DynamoDB state read/write
│   ├── simulation.py                Per-tick Mars environment rules
│   ├── setup_modes.py               Manual + AI-optimised session setup
│   ├── agents/
│   │   ├── orchestrator.py          Mission Orchestrator (delegates to specialists)
│   │   ├── crop_planner.py          Crop scheduling agent
│   │   ├── env_monitor.py           Environment monitoring agent
│   │   ├── harvest_optimizer.py     Harvest timing agent
│   │   ├── resource_manager.py      Water/nutrient management agent
│   │   └── fault_handler.py         Emergency response agent
│   ├── tools/
│   │   ├── simulation_tools.py      @tool functions for agents to modify state
│   │   ├── greenhouse_tools.py      MCP knowledge base search tool
│   │   └── mcp_client.py            MCP HTTP client for Mars KB
│   ├── infrastructure/
│   │   ├── dynamo_setup.py          DynamoDB table creation + seeding
│   │   └── lambda_deploy.py         Lambda + API Gateway deployment script
│   ├── amplify/                     Amplify backend definition (auth + data)
│   ├── .env                         AWS credentials (gitignored)
│   └── .env.example                 Credential template
│
├── scripts/
│   ├── check-prereqs.sh             Validates Node, Python, AWS CLI
│   ├── setup-no-kiro.sh             One-time setup (installs all deps)
│   ├── run-frontend.sh              Start frontend only
│   └── run-ampx-sandbox.sh          Start Amplify sandbox
│
└── start.sh                         Start full stack (backend + frontend)
```

### How it works

1. **Frontend** renders a 3D Mars landing page. Clicking "Launch Simulation" opens the session initialisation panel where you configure greenhouse parameters (crops, supplies, crew, environment).

2. **Backend** runs a FastAPI server. The `/setup/manual` endpoint configures the greenhouse state in DynamoDB. The `/invoke` endpoint calls the **Orchestrator agent**, which delegates tasks to specialist agents. The `/simulate-tick` endpoint advances the simulation by one day and lets agents react.

3. **3D Greenhouse** renders a dome colony on a Mars terrain. Plant boxes appear based on configured crop counts, with colors and sizes reflecting live backend state (crop type, growth stage, health). Environment data drives lighting, fog (dust storms), and resource bar indicators in the HUD.

4. **AI Agents** use `@tool`-decorated functions to read and modify simulation state — harvesting crops, replanting, adjusting water/nutrient allocations, and setting environment parameters.

5. **MCP Knowledge Base** is an external service containing Mars crop yield, growth cycle, and nutritional data — accessed over HTTP via the Strands MCP client.

## Prerequisites

- Node.js >= 18
- Python 3.12+
- AWS CLI v2
- Git

## One-time setup

```bash
chmod +x start.sh scripts/*.sh
./scripts/setup-no-kiro.sh
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your AWS credentials.

## Start the project

```bash
./start.sh
```

This single command:
1. Loads AWS credentials from `backend/.env`
2. Activates the Python virtual environment
3. Installs any missing dependencies
4. Generates Amplify outputs into `frontend/`
5. Starts the FastAPI backend on http://localhost:8000
6. Builds and starts the Vite frontend on http://localhost:5173

Press `Ctrl+C` to stop everything.

### Start individual services

```bash
./scripts/run-frontend.sh          # Frontend dev server only
./scripts/run-ampx-sandbox.sh      # Amplify sandbox (watch mode)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/state` | Current simulation state |
| GET | `/setup-status` | Whether setup is complete |
| POST | `/setup/manual` | Configure greenhouse manually |
| POST | `/setup/ai-optimised` | AI-driven optimal config |
| POST | `/invoke` | Run orchestrator agent |
| POST | `/simulate-tick` | Advance one mission day |
| POST | `/reset` | Reset to blank state |
