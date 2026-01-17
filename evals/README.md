# Agent Evaluation System

A comprehensive evaluation framework for testing multi-agent behavior consistency across prompts, tools, skills, models, and agent configurations.

## Quick Start

```bash
# Run all evals with default model
npm run eval

# Run with specific model matrix
npm run eval -- --matrix fast        # Claude Haiku (quick)
npm run eval -- --matrix full_matrix # All models

# Filter by type or agent
npm run eval -- --type tool_selection
npm run eval -- --agent pm-assistant

# CI mode (exits with code 1 on failures)
npm run eval -- --ci
```

## Overview

The eval system tests four key aspects of agent behavior:

| Type                  | Purpose                                      | Example                                                        |
| --------------------- | -------------------------------------------- | -------------------------------------------------------------- |
| `tool_selection`      | Agent picks the right tool for the task      | "Find blockers" → uses `ai_first_get_blockers`                 |
| `response_quality`    | Response is clear, complete, well-structured | Weekly summaries include all key metrics                       |
| `skill_invocation`    | Agent loads appropriate skills when needed   | Creating issues loads `personal-jira-project-management` skill |
| `multi_step_workflow` | Agent completes multi-step tasks correctly   | Query JIRA → Update slides                                     |

## Directory Structure

```
evals/
├── README.md                    # This file
├── schemas/
│   └── eval-schema.yaml         # YAML schema definition
├── config/
│   └── models.yaml              # Model matrix configurations
├── tool-selection/              # Tool selection evals
│   ├── jira-blockers.yaml
│   ├── slack-channel-message.yaml
│   └── ...
├── response-quality/            # Response quality evals
│   └── pm-assistant-summary.yaml
├── skill-invocation/            # Skill activation evals
│   └── jira-management-skill.yaml
└── multi-step/                  # Multi-step workflow evals
    ├── weekly-report-workflow.yaml
    └── blocker-notification.yaml
```

## Writing Eval Cases

### Basic Structure

```yaml
name: my-eval-case
description: Brief description of what this tests
type: tool_selection # or response_quality, skill_invocation, multi_step_workflow
agent: pm-assistant # Agent ID to test

input:
  prompt: "User's message to the agent"

expect:
  tool_calls:
    required:
      - name: ai_first_tool_name
    forbidden:
      - ai_first_wrong_tool

  assertions:
    - type: response_matches
      pattern: 'keyword|another|pattern'

scoring:
  llm_judge:
    enabled: true
    criteria:
      - name: clarity
        description: 'Response is clear and easy to understand'
        weight: 0.5
    threshold: 0.7
```

### Assertion Types

| Type                | Purpose                           | Example                                |
| ------------------- | --------------------------------- | -------------------------------------- |
| `response_matches`  | Regex pattern match on response   | `pattern: "block\|stuck\|waiting"`     |
| `response_mentions` | Response contains specific values | `values: ["completed", "in progress"]` |
| `tool_called`       | Verify tool was invoked           | Covered by `tool_calls.required`       |
| `tool_not_called`   | Verify tool was NOT invoked       | Covered by `tool_calls.forbidden`      |

### Best Practices

**1. Test behavior, not mock data**

```yaml
# Bad - tests specific mock IDs that won't exist in real API
assertions:
  - type: response_mentions
    values: ["PROJ-123", "PROJ-124"]

# Good - tests that agent discusses the right concepts
assertions:
  - type: response_matches
    pattern: "block|stuck|impediment|waiting"
```

**2. Use flexible patterns**

```yaml
# Good - matches variations like "completed", "complete", "completion"
pattern: 'complet|finish|done'
```

**3. Keep assertions focused**

```yaml
# Test one behavior per assertion
assertions:
  - type: response_matches
    pattern: 'block|stuck' # Tests blocker detection
  - type: response_matches
    pattern: 'notif|sent|posted' # Tests notification action
```

## LLM-as-Judge Scoring

For response quality evaluation, the system uses Claude as an LLM judge:

```yaml
scoring:
  llm_judge:
    enabled: true
    criteria:
      - name: clarity
        description: 'Summary is clear and easy to understand'
        weight: 0.3
      - name: completeness
        description: 'All key metrics are included'
        weight: 0.4
      - name: structure
        description: 'Information is well-organized'
        weight: 0.3
    threshold: 0.7
    rubric: |
      Score each criterion from 0-1:
      - 1.0: Excellent - Professional quality
      - 0.7: Good - Covers key points adequately
      - 0.4: Needs improvement - Missing information
      - 0.0: Poor - Unclear or incomplete
```

**Requirements:**

- `ANTHROPIC_API_KEY` must be set in `.env` for LLM judge to work
- Judge uses Claude to evaluate response quality against criteria
- Overall score is weighted average of criteria scores
- Eval passes if score >= threshold

## Results Format

Results are saved to `eval-results/` as JSON:

```json
{
  "metadata": {
    "runId": "eval-2024-01-19-abc123",
    "timestamp": "2024-01-19T10:30:00Z",
    "gitCommit": "abc123",
    "durationMs": 45000
  },
  "summary": {
    "total": 12,
    "passed": 10,
    "failed": 2,
    "passRate": 0.833
  },
  "results": [
    {
      "evalName": "jira-blockers-detection",
      "model": "opencode/grok-code",
      "status": "passed",
      "assertions": [...],
      "executionTrace": {
        "toolCalls": ["ai_first_get_blockers"],
        "responseText": "...",
        "latencyMs": 2500
      }
    }
  ]
}
```

## Model Matrix

Configure models in `evals/config/models.yaml`:

```yaml
models:
  default:
    - opencode/grok-code # Free Grok model for testing
  fast:
    - anthropic/claude-haiku-3-5-20241022
  full_matrix:
    - opencode/grok-code
    - anthropic/claude-sonnet-4-20250514
    - anthropic/claude-haiku-3-5-20241022
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  YAML Evals     │────▶│   Eval Runner    │────▶│  JSON Results   │
│  evals/*.yaml   │     │                  │     │  eval-results/  │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
            ┌───────────┐ ┌───────────┐ ┌───────────┐
            │ OpenCode  │ │ Assertion │ │ LLM Judge │
            │ Client    │ │ Engine    │ │           │
            └─────┬─────┘ └───────────┘ └───────────┘
                  │
                  ▼
            ┌───────────┐
            │ OpenCode  │
            │ Server    │
            │ (port 4099)
            └───────────┘
```

**Key components:**

- `src/eval/cli.ts` - CLI entry point
- `src/eval/runner/` - Eval loading and execution
- `src/eval/judge/` - LLM-as-judge scoring
- `src/services/openCodeClient.ts` - OpenCode API client

## Troubleshooting

### Tools not being tracked

Tool calls are extracted from OpenCode session history, not the immediate response. If tools appear empty:

1. Check OpenCode server is running (`./run.sh dev`)
2. Verify agent is making tool calls in OpenCode logs
3. Session history fetch happens after response completes

### LLM judge authentication error

```
Error: Could not resolve authentication method
```

Ensure `ANTHROPIC_API_KEY` is set in your `.env` file. The eval CLI loads dotenv automatically.

### Eval passes locally but fails in CI

- Check model availability in CI environment
- Verify environment variables are set
- Use `--ci` flag for proper exit codes

## Adding New Evals

1. Create YAML file in appropriate directory:

   ```bash
   touch evals/tool-selection/my-new-eval.yaml
   ```

2. Define the eval case following the schema

3. Run to verify:

   ```bash
   npm run eval -- --name my-new-eval
   ```

4. Commit the new eval file

## Current Status

Run `npm run eval` to see current pass rates. As of the last run:

- **Pass rate:** 83.3% (10/12 passing)
- **Default model:** `opencode/grok-code`
