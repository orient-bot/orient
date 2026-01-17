/**
 * Judge Prompts
 *
 * Prompt templates and parsing for LLM-as-judge evaluation.
 */

import { JudgeCriterion, JudgeScore, LLMJudgeConfig, ToolCall } from '../types.js';

/**
 * Default rubric for scoring
 */
const DEFAULT_RUBRIC = `Score each criterion from 0 to 1:
- 1.0: Excellent - Exceeds expectations
- 0.8: Good - Meets expectations well
- 0.6: Satisfactory - Meets basic expectations
- 0.4: Needs improvement - Partially meets expectations
- 0.2: Poor - Significant issues
- 0.0: Unacceptable - Does not meet expectations

Be objective and consistent in your scoring. Consider the context and constraints of the task.`;

/**
 * Build the judge prompt
 */
export function buildJudgePrompt(
  config: LLMJudgeConfig,
  userPrompt: string,
  agentResponse: string,
  toolCalls: ToolCall[]
): string {
  // Format criteria list
  const criteriaList = config.criteria
    .map((c) => `- **${c.name}** (weight: ${c.weight}): ${c.description}`)
    .join('\n');

  // Format tool calls
  const toolCallsSummary =
    toolCalls.length > 0
      ? toolCalls
          .map((tc) => {
            const args = JSON.stringify(tc.arguments);
            const truncatedArgs = args.length > 100 ? args.slice(0, 100) + '...' : args;
            const status = tc.error ? `ERROR: ${tc.error}` : 'success';
            return `- ${tc.name}(${truncatedArgs}) -> ${status}`;
          })
          .join('\n')
      : 'No tools were called';

  // Use custom rubric or default
  const rubric = config.rubric || DEFAULT_RUBRIC;

  return `You are an expert evaluator assessing an AI agent's response quality.

## User Prompt
${userPrompt}

## Agent Response
${agentResponse}

## Tools Called
${toolCallsSummary}

## Evaluation Criteria
${criteriaList}

## Rubric
${rubric}

## Your Task
Evaluate the agent's response against each criterion. For each criterion:
1. Provide a score from 0.0 to 1.0
2. Provide brief reasoning for the score (1-2 sentences)

Then provide an overall assessment.

**IMPORTANT**: Respond in this exact JSON format:
\`\`\`json
{
  "criteria": {
    "criterion_name": {
      "score": 0.0,
      "reasoning": "explanation"
    }
  },
  "summary": "overall assessment in 1-2 sentences",
  "overall": 0.0
}
\`\`\`

Replace "criterion_name" with the actual criterion names from above. The "overall" score should be a weighted average based on the weights provided.`;
}

/**
 * Parse the judge response into a structured score
 */
export function parseJudgeResponse(text: string, criteria: JudgeCriterion[]): JudgeScore {
  try {
    // Extract JSON from the response
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr.trim());

    // Validate and normalize the response
    const criteriaScores: Record<string, { score: number; reasoning: string }> = {};

    for (const criterion of criteria) {
      const criterionData = parsed.criteria?.[criterion.name];
      if (criterionData) {
        criteriaScores[criterion.name] = {
          score: normalizeScore(criterionData.score),
          reasoning: criterionData.reasoning || 'No reasoning provided',
        };
      } else {
        // Default to 0 if criterion not found
        criteriaScores[criterion.name] = {
          score: 0,
          reasoning: 'Criterion not evaluated',
        };
      }
    }

    // Calculate weighted overall score
    let weightedSum = 0;
    let totalWeight = 0;

    for (const criterion of criteria) {
      const score = criteriaScores[criterion.name]?.score || 0;
      weightedSum += score * criterion.weight;
      totalWeight += criterion.weight;
    }

    const calculatedOverall = totalWeight > 0 ? weightedSum / totalWeight : 0;

    // Use provided overall or calculated
    const overall =
      parsed.overall !== undefined ? normalizeScore(parsed.overall) : calculatedOverall;

    return {
      overall,
      criteria: criteriaScores,
      summary: parsed.summary || 'No summary provided',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      overall: 0,
      criteria: {},
      summary: `Failed to parse judge response: ${errorMessage}`,
    };
  }
}

/**
 * Normalize a score to be between 0 and 1
 */
function normalizeScore(value: unknown): number {
  if (typeof value !== 'number') {
    return 0;
  }

  // Clamp to 0-1 range
  return Math.max(0, Math.min(1, value));
}

/**
 * Format a score for display
 */
export function formatScore(score: number): string {
  return (score * 100).toFixed(0) + '%';
}

/**
 * Get a pass/fail label for a score
 */
export function getScoreLabel(score: number, threshold: number): string {
  if (score >= threshold) {
    return 'PASS';
  }
  return 'FAIL';
}

/**
 * Generate a human-readable summary of judge results
 */
export function summarizeJudgeScore(score: JudgeScore): string {
  const lines: string[] = [];

  lines.push(`Overall: ${formatScore(score.overall)}`);

  if (Object.keys(score.criteria).length > 0) {
    lines.push('Criteria:');
    for (const [name, data] of Object.entries(score.criteria)) {
      lines.push(`  - ${name}: ${formatScore(data.score)} - ${data.reasoning}`);
    }
  }

  if (score.summary) {
    lines.push(`Summary: ${score.summary}`);
  }

  return lines.join('\n');
}
