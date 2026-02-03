/**
 * Agent Evaluation System
 *
 * Main exports for the eval framework.
 */

// Types
export type {
  EvalType,
  EvalPlatform,
  EvalCase,
  EvalInput,
  EvalMocks,
  MockResponse,
  EvalExpectations,
  ToolCallExpectations,
  ToolExpectation,
  SkillExpectations,
  WorkflowExpectations,
  WorkflowStep,
  Assertion,
  EvalScoring,
  LLMJudgeConfig,
  JudgeCriterion,
  InvokeRequest,
  InvokeResponse,
  ExecutionTrace,
  ToolCall,
  EvalResult,
  AssertionResult,
  JudgeScore,
  EvalServerConfig,
  JudgeConfig,
  EvalConfig,
  RunOptions,
  EvalSummary,
  RunMetadata,
  ModelSummary,
  TypeSummary,
  AgentSummary,
} from './types.js';

// HTTP Wrapper
export { EvalServer, startEvalServer, createEvalRoutes } from './http-wrapper/index.js';
export type {
  AgentInvokeRequest,
  AgentInvokeResponse,
  ToolExecuteRequest,
  ToolExecuteResponse,
  AgentListItem,
  ToolListItem,
  HealthResponse,
} from './http-wrapper/index.js';

// Mocks
export {
  MockServiceRegistry,
  BaseMockService,
  getMockRegistry,
  resetMockRegistry,
  createMockRegistry,
  JiraMockService,
  SlackMockService,
  GoogleMockService,
  WhatsAppMockService,
  createMockSlackUser,
  createMockSlackChannel,
  createMockSlide,
  createMockCalendarEvent,
  createMockWhatsAppMessage,
  createMockWhatsAppChat,
} from './mocks/index.js';

// Runner
export {
  EvalRunner,
  createEvalRunner,
  loadEvalCases,
  loadModelConfig,
  getCaseSummary,
  evaluateExpectations,
  summarizeAssertions,
} from './runner/index.js';

// Judge
export { LLMJudge, buildJudgePrompt, parseJudgeResponse } from './judge/index.js';
