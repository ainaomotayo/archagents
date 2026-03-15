from sentinel_agents.runner import run_agent

from sentinel_fv.agent import FormalVerificationAgent

if __name__ == "__main__":
    run_agent(FormalVerificationAgent())
