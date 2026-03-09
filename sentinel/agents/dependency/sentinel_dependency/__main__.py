from sentinel_dependency.agent import DependencyAgent
from sentinel_agents.runner import run_agent

if __name__ == "__main__":
    run_agent(DependencyAgent())
