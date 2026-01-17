/**
 * Assertion Evaluation
 *
 * Evaluates expectations against execution traces.
 */

import { createServiceLogger } from '@orient/core';
import {
  EvalExpectations,
  ExecutionTrace,
  AssertionResult,
  Assertion,
  ToolExpectation,
  WorkflowStep,
} from '../types.js';

const logger = createServiceLogger('eval-assertions');

/**
 * Evaluate all expectations against an execution trace
 */
export function evaluateExpectations(
  expect: EvalExpectations,
  trace: ExecutionTrace
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // Evaluate tool call expectations
  if (expect.tool_calls) {
    results.push(...evaluateToolCalls(expect.tool_calls, trace));
  }

  // Evaluate skill expectations
  if (expect.skills) {
    results.push(...evaluateSkills(expect.skills, trace));
  }

  // Evaluate workflow expectations
  if (expect.workflow) {
    results.push(...evaluateWorkflow(expect.workflow, trace));
  }

  // Evaluate generic assertions
  if (expect.assertions) {
    results.push(...evaluateAssertions(expect.assertions, trace));
  }

  return results;
}

/**
 * Evaluate tool call expectations
 */
function evaluateToolCalls(
  expectations: NonNullable<EvalExpectations['tool_calls']>,
  trace: ExecutionTrace
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const calledTools = trace.toolCalls.map((tc) => tc.name);

  // Check required tools
  if (expectations.required) {
    for (const required of expectations.required) {
      const found = trace.toolCalls.find((tc) => tc.name === required.name);

      results.push({
        type: 'tool_called',
        passed: !!found,
        expected: required.name,
        actual: found?.name || null,
        message: found
          ? `Tool ${required.name} was called`
          : `Tool ${required.name} was NOT called`,
      });

      // Check arguments if tool was called and arguments specified
      if (found && required.arguments) {
        const argsMatch = matchArguments(found.arguments, required.arguments);
        results.push({
          type: 'tool_arguments',
          passed: argsMatch.passed,
          expected: required.arguments,
          actual: found.arguments,
          message: argsMatch.passed
            ? `Arguments match for ${required.name}`
            : `Arguments mismatch for ${required.name}: ${argsMatch.diff}`,
          diff: argsMatch.diff,
        });
      }
    }

    // Check order if strict
    if (expectations.order === 'strict' && expectations.required.length > 1) {
      const expectedOrder = expectations.required.map((r) => r.name);
      const actualOrder = calledTools.filter((t) => expectedOrder.includes(t));
      const orderMatch = JSON.stringify(expectedOrder) === JSON.stringify(actualOrder);

      results.push({
        type: 'tool_order',
        passed: orderMatch,
        expected: expectedOrder,
        actual: actualOrder,
        message: orderMatch
          ? 'Tools called in expected order'
          : `Tool order mismatch: expected ${expectedOrder.join(' -> ')}, got ${actualOrder.join(' -> ')}`,
      });
    }
  }

  // Check forbidden tools
  if (expectations.forbidden) {
    for (const forbidden of expectations.forbidden) {
      const found = calledTools.includes(forbidden);

      results.push({
        type: 'tool_not_called',
        passed: !found,
        expected: `${forbidden} NOT called`,
        actual: found ? `${forbidden} WAS called` : `${forbidden} not called`,
        message: found
          ? `Forbidden tool ${forbidden} was called`
          : `Forbidden tool ${forbidden} was correctly not called`,
      });
    }
  }

  return results;
}

/**
 * Evaluate skill activation expectations
 */
function evaluateSkills(
  expectations: NonNullable<EvalExpectations['skills']>,
  trace: ExecutionTrace
): AssertionResult[] {
  const results: AssertionResult[] = [];

  // Check activated skills
  if (expectations.activated) {
    for (const skill of expectations.activated) {
      const activated = trace.skillActivations.includes(skill);

      results.push({
        type: 'skill_activated',
        passed: activated,
        expected: skill,
        actual: activated ? skill : null,
        message: activated ? `Skill ${skill} was activated` : `Skill ${skill} was NOT activated`,
      });
    }
  }

  // Check content patterns
  if (expectations.content_used) {
    for (const content of expectations.content_used) {
      // Check if the pattern appears in the response
      const found = trace.responseText.includes(content.pattern);

      results.push({
        type: 'skill_content_used',
        passed: found,
        expected: content.pattern,
        actual: found ? 'Pattern found in response' : 'Pattern not found',
        message: found
          ? `Skill content pattern "${content.pattern}" was used${content.reason ? ` (${content.reason})` : ''}`
          : `Skill content pattern "${content.pattern}" was NOT used${content.reason ? ` (expected: ${content.reason})` : ''}`,
      });
    }
  }

  return results;
}

/**
 * Evaluate workflow expectations
 */
function evaluateWorkflow(
  expectations: NonNullable<EvalExpectations['workflow']>,
  trace: ExecutionTrace
): AssertionResult[] {
  const results: AssertionResult[] = [];
  const calledTools = trace.toolCalls;

  // Track which tools have been seen for dependency checking
  const completedSteps = new Set<string>();
  let toolIndex = 0;

  for (const step of expectations.steps) {
    // Check dependencies
    if (step.depends_on && !completedSteps.has(step.depends_on)) {
      results.push({
        type: 'workflow_step',
        passed: false,
        expected: `Step ${step.name} after ${step.depends_on}`,
        actual: 'Dependency not completed',
        message: `Step "${step.name}" depends on "${step.depends_on}" which was not completed`,
      });
      continue;
    }

    // Find tools for this step
    const stepTools: typeof calledTools = [];
    const expectedTools = new Set(step.tools);

    // Scan from current position for step tools
    while (toolIndex < calledTools.length) {
      const tool = calledTools[toolIndex];
      if (expectedTools.has(tool.name)) {
        stepTools.push(tool);
        expectedTools.delete(tool.name);
        toolIndex++;

        if (expectedTools.size === 0) break;
      } else if (step.order === 'strict') {
        // In strict mode, break if we see an unexpected tool
        break;
      } else {
        toolIndex++;
      }
    }

    // Check if all expected tools were called
    const allToolsCalled = stepTools.length === step.tools.length;
    const stepPassed = allToolsCalled;

    results.push({
      type: 'workflow_step',
      passed: stepPassed,
      expected: step.tools,
      actual: stepTools.map((t) => t.name),
      message: stepPassed
        ? `Workflow step "${step.name}" completed`
        : `Workflow step "${step.name}" incomplete: missing ${[...expectedTools].join(', ')}`,
    });

    // Check arguments if specified
    if (step.arguments_contain && stepPassed) {
      for (const stepTool of stepTools) {
        const argsMatch = matchArguments(stepTool.arguments, step.arguments_contain);
        if (!argsMatch.passed) {
          results.push({
            type: 'workflow_arguments',
            passed: false,
            expected: step.arguments_contain,
            actual: stepTool.arguments,
            message: `Step "${step.name}" tool ${stepTool.name} arguments mismatch: ${argsMatch.diff}`,
          });
        }
      }
    }

    if (stepPassed) {
      completedSteps.add(step.name);
    }
  }

  // Overall workflow completion
  const allStepsCompleted = completedSteps.size === expectations.steps.length;
  results.push({
    type: 'workflow_completed',
    passed: allStepsCompleted,
    expected: expectations.steps.map((s) => s.name),
    actual: [...completedSteps],
    message: allStepsCompleted
      ? 'All workflow steps completed'
      : `Workflow incomplete: ${expectations.steps.length - completedSteps.size} steps remaining`,
  });

  return results;
}

/**
 * Evaluate generic assertions
 */
function evaluateAssertions(assertions: Assertion[], trace: ExecutionTrace): AssertionResult[] {
  const results: AssertionResult[] = [];

  for (const assertion of assertions) {
    switch (assertion.type) {
      case 'tool_called':
        if (assertion.tool) {
          const found = trace.toolCalls.some((tc) => tc.name === assertion.tool);
          results.push({
            type: 'tool_called',
            passed: found,
            expected: assertion.tool,
            actual: found ? assertion.tool : null,
            message: found
              ? `Tool ${assertion.tool} was called`
              : `Tool ${assertion.tool} was NOT called`,
          });
        }
        break;

      case 'tool_not_called':
        if (assertion.tool) {
          const found = trace.toolCalls.some((tc) => tc.name === assertion.tool);
          results.push({
            type: 'tool_not_called',
            passed: !found,
            expected: `${assertion.tool} NOT called`,
            actual: found ? `${assertion.tool} WAS called` : `${assertion.tool} not called`,
          });
        }
        break;

      case 'skill_activated':
        if (assertion.skill) {
          const activated = trace.skillActivations.includes(assertion.skill);
          results.push({
            type: 'skill_activated',
            passed: activated,
            expected: assertion.skill,
            actual: activated ? assertion.skill : null,
          });
        }
        break;

      case 'response_mentions':
        if (assertion.values) {
          for (const value of assertion.values) {
            const found = trace.responseText.toLowerCase().includes(value.toLowerCase());
            results.push({
              type: 'response_mentions',
              passed: found,
              expected: value,
              actual: found ? `Found "${value}"` : `Not found: "${value}"`,
              message: found
                ? `Response mentions "${value}"`
                : `Response does NOT mention "${value}"`,
            });
          }
        }
        break;

      case 'response_matches':
        if (assertion.pattern) {
          try {
            const regex = new RegExp(assertion.pattern, 'i');
            const matches = regex.test(trace.responseText);
            results.push({
              type: 'response_matches',
              passed: matches,
              expected: assertion.pattern,
              actual: matches ? 'Pattern matched' : 'Pattern did not match',
            });
          } catch (error) {
            results.push({
              type: 'response_matches',
              passed: false,
              expected: assertion.pattern,
              actual: `Invalid regex: ${error}`,
            });
          }
        }
        break;

      case 'workflow_completed':
        if (assertion.steps) {
          // Check if all specified steps have corresponding tool calls
          // This is a simplified check
          const completedSteps = assertion.steps.every((step) =>
            trace.toolCalls.some((tc) => tc.name.includes(step))
          );
          results.push({
            type: 'workflow_completed',
            passed: completedSteps,
            expected: assertion.steps,
            actual: trace.toolCalls.map((tc) => tc.name),
          });
        }
        break;

      default:
        logger.warn(`Unknown assertion type: ${assertion.type}`);
    }
  }

  return results;
}

/**
 * Match tool arguments against expected pattern
 */
function matchArguments(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>
): { passed: boolean; diff?: string } {
  const diffs: string[] = [];

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key];

    if (actualValue === undefined) {
      diffs.push(`Missing key: ${key}`);
      continue;
    }

    if (typeof expectedValue === 'object' && expectedValue !== null) {
      // Deep compare for objects
      if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
        diffs.push(
          `${key}: expected ${JSON.stringify(expectedValue)}, got ${JSON.stringify(actualValue)}`
        );
      }
    } else if (actualValue !== expectedValue) {
      diffs.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
    }
  }

  return {
    passed: diffs.length === 0,
    diff: diffs.length > 0 ? diffs.join('; ') : undefined,
  };
}

/**
 * Summarize assertion results
 */
export function summarizeAssertions(results: AssertionResult[]): {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
} {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
  };
}
