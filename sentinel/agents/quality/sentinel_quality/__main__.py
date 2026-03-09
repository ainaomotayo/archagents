from sentinel_agents.runner import run_agent

from sentinel_quality.agent import QualityAgent

if __name__ == "__main__":
    run_agent(QualityAgent())
