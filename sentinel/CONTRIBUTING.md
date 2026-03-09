# Contributing to SENTINEL

Thank you for your interest in contributing to SENTINEL. This guide covers setup, workflow, and conventions.

## Development Setup

### Prerequisites

- Node.js 22+
- pnpm 10+
- Python 3.11+
- Docker & Docker Compose (for integration tests)

### Initial Setup

```bash
# Clone the repo
git clone https://github.com/ainaomotayo/archagents.git
cd archagents/sentinel

# Install TypeScript dependencies
pnpm install

# Build all packages
pnpm build

# Install Python agent framework (must be first)
cd agents/framework
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Install each Python agent (repeat for each agent directory)
cd ../security
python -m venv .venv
source .venv/bin/activate
pip install -e ../framework
pip install -e ".[dev]"
```

### Running Tests

```bash
# All TypeScript tests (371 tests)
pnpm test

# Single TypeScript package
pnpm --filter @sentinel/assessor test

# Python agent tests (from agent directory with venv active)
cd agents/security && source .venv/bin/activate
pytest

# End-to-end pipeline tests
pnpm --filter @sentinel/e2e-tests test
```

## Project Structure

The project is a monorepo with two runtimes:

- **TypeScript** (Turborepo + pnpm workspaces): API, CLI, dashboard, and infrastructure packages
- **Python** (individual venvs): Analysis agents with a shared framework

### TypeScript Packages

| Directory | Package | Purpose |
|-----------|---------|---------|
| `apps/api` | `@sentinel/api` | REST API server |
| `apps/cli` | `@sentinel/cli` | CLI tool |
| `apps/dashboard` | `@sentinel/dashboard` | Next.js dashboard |
| `packages/shared` | `@sentinel/shared` | Shared types |
| `packages/events` | `@sentinel/events` | Redis event bus |
| `packages/assessor` | `@sentinel/assessor` | Risk scoring |
| `packages/auth` | `@sentinel/auth` | HMAC signing |
| `packages/audit` | `@sentinel/audit` | Audit log |
| `packages/db` | `@sentinel/db` | Database |
| `packages/github` | `@sentinel/github` | GitHub App |
| `packages/security` | `@sentinel/security` | Enterprise security |

### Python Agents

All agents extend `BaseAgent` from `agents/framework` and implement a `process(event) -> list[Finding]` method.

| Directory | Module | Agent |
|-----------|--------|-------|
| `agents/framework` | `sentinel_agents` | Base classes + types |
| `agents/security` | `sentinel_security` | Security scanner |
| `agents/ip-license` | `sentinel_license` | License checker |
| `agents/dependency` | `sentinel_dependency` | Dependency analyzer |
| `agents/ai-detector` | `sentinel_aidetector` | AI code detector |
| `agents/quality` | `sentinel_quality` | Quality analyzer |
| `agents/policy` | `sentinel_policy` | Policy engine |
| `agents/llm-review` | `sentinel_llm` | LLM reviewer |

## Development Workflow

### Branching

- `main` — stable, production-ready
- `feature/*` — new features
- `fix/*` — bug fixes

### Making Changes

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass (`pnpm test` + Python agent tests)
4. Ensure builds pass (`pnpm build`)
5. Commit with a descriptive message (see Commit Conventions below)
6. Push and open a Pull Request

### Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new policy rule type for regex matching
fix: resolve certificate expiry calculation off-by-one
test: add E2E tests for assessment pipeline
docs: update onboarding guide with GitLab CI example
refactor: extract risk scoring into standalone module
chore: update pnpm lockfile
```

### Testing Expectations

- All new code should have tests
- TypeScript: use Vitest
- Python: use pytest
- Test files go alongside source or in a `tests/` directory
- E2E tests go in `test/e2e/`

### Code Style

- **TypeScript**: Standard TypeScript with strict mode. No external linting config required — follow existing patterns.
- **Python**: Standard Python 3.11+ with type hints. Use `ruff` for linting (configured in each agent's `pyproject.toml`).

## Agent Development

To add a new analysis agent:

1. Create a new directory under `agents/`:
   ```
   agents/my-agent/
     sentinel_myagent/
       __init__.py
       __main__.py
       agent.py
     tests/
       test_agent.py
     pyproject.toml
   ```

2. Extend `BaseAgent`:
   ```python
   from sentinel_agents.base import BaseAgent
   from sentinel_agents.types import DiffEvent, Finding

   class MyAgent(BaseAgent):
       name = "my-agent"
       version = "0.1.0"

       def process(self, event: DiffEvent) -> list[Finding]:
           findings = []
           # Your analysis logic here
           return findings
   ```

3. Add the agent to `docker-compose.sentinel.yml`

4. Add it to the assessor's expected agent list if it contributes to risk scoring

## Reporting Issues

Open an issue on GitHub with:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node.js version, Python version)

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
