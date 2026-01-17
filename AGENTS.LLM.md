# LLM Agent Safety Notes

This document applies to AI/LLM agents working in this repo.

## Doctor-First Workflow

1. Run `./run.sh doctor` and capture the output.
2. Summarize the issues and the exact fixes you plan to apply.
3. Ask for explicit approval before running `./run.sh doctor --fix`.

`--fix` can modify the workstation by installing dependencies, pulling Docker images,
and creating/updating config files and secrets. Treat it as a change step, not a read-only check.
