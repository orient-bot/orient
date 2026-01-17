/**
 * LLM-as-Judge Module
 *
 * Uses Claude to evaluate response quality based on configurable criteria.
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServiceLogger } from '@orient/core';
import { JudgeConfig, JudgeScore, LLMJudgeConfig, ToolCall } from '../types.js';
import { buildJudgePrompt, parseJudgeResponse } from './prompts.js';

const logger = createServiceLogger('llm-judge');

/**
 * LLM-as-Judge evaluator
 *
 * Uses another LLM to score agent responses based on criteria.
 */
export class LLMJudge {
  private client: Anthropic;
  private model: string;

  constructor(config: JudgeConfig = {}) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  /**
   * Evaluate an agent response
   */
  async evaluate(
    config: LLMJudgeConfig,
    prompt: string,
    response: string,
    toolCalls: ToolCall[]
  ): Promise<JudgeScore> {
    if (!config.enabled) {
      return {
        overall: 1,
        criteria: {},
        summary: 'LLM-as-judge disabled',
        threshold: config.threshold,
        passed: true,
      };
    }

    logger.debug('Evaluating response', {
      promptLength: prompt.length,
      responseLength: response.length,
      toolCallCount: toolCalls.length,
      criteriaCount: config.criteria.length,
    });

    try {
      // Build the judge prompt
      const judgePrompt = buildJudgePrompt(config, prompt, response, toolCalls);

      // Call the LLM
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: judgePrompt }],
      });

      // Extract text content
      const textContent = message.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text content in judge response');
      }

      // Parse the response
      const score = parseJudgeResponse(textContent.text, config.criteria);

      // Add threshold info
      score.threshold = config.threshold;
      score.passed = score.overall >= config.threshold;

      logger.info('Judge evaluation complete', {
        overall: score.overall,
        passed: score.passed,
        threshold: config.threshold,
      });

      return score;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Judge evaluation failed', { error: errorMessage });

      return {
        overall: 0,
        criteria: {},
        summary: `Evaluation failed: ${errorMessage}`,
        threshold: config.threshold,
        passed: false,
      };
    }
  }

  /**
   * Batch evaluate multiple responses
   */
  async evaluateBatch(
    config: LLMJudgeConfig,
    items: Array<{
      prompt: string;
      response: string;
      toolCalls: ToolCall[];
    }>
  ): Promise<JudgeScore[]> {
    const results: JudgeScore[] = [];

    for (const item of items) {
      const score = await this.evaluate(config, item.prompt, item.response, item.toolCalls);
      results.push(score);
    }

    return results;
  }

  /**
   * Get the model being used for judging
   */
  getModel(): string {
    return this.model;
  }
}

// Re-export utilities
export { buildJudgePrompt, parseJudgeResponse } from './prompts.js';
