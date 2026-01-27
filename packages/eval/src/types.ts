/**
 * Agent Evaluation System Type Definitions
 *
 * Core types for the eval framework that tests agent behavior
 * across tools, skills, prompts, and models.
 */

// ============================================================================
// Eval Case Types
// ============================================================================

/**
 * Types of evaluations supported
 */
export type EvalType =
  | 'tool_selection'
  | 'response_quality'
  | 'skill_invocation'
  | 'multi_step_workflow';

/**
 * Platform context for agent invocation
 */
export type EvalPlatform = 'whatsapp' | 'slack' | 'opencode' | 'cursor';

/**
 * Base eval case loaded from YAML
 */
export interface EvalCase {
  /** Unique identifier for this eval */
  name: string;

  /** Human-readable description */
  description: string;

  /** Type of evaluation */
  type: EvalType;

  /** Agent ID to test */
  agent: string;

  /** Optional platform context */
  context?: {
    platform?: EvalPlatform;
    chatId?: string;
    channelId?: string;
  };

  /** Input for the evaluation */
  input: EvalInput;

  /** Mock responses for external services */
  mocks?: EvalMocks;

  /** Expected behavior and assertions */
  expect: EvalExpectations;

  /** LLM-as-judge scoring configuration */
  scoring?: EvalScoring;

  /** Source file path (added during loading) */
  sourceFile?: string;

  /** Whether the eval is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Input configuration for an eval
 */
export interface EvalInput {
  /** The user prompt to send to the agent */
  prompt: string;

  /** Optional conversation history */
  conversationHistory?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

/**
 * Mock configuration for external services
 */
export interface EvalMocks {
  jira?: Record<string, MockResponse>;
  slack?: Record<string, MockResponse>;
  google?: Record<string, MockResponse>;
  whatsapp?: Record<string, MockResponse>;
}

/**
 * Mock response configuration
 */
export interface MockResponse {
  response: unknown;
  error?: string;
  delay?: number;
}

// ============================================================================
// Expectations Types
// ============================================================================

/**
 * Expected behavior for an eval
 */
export interface EvalExpectations {
  /** Tool call expectations */
  tool_calls?: ToolCallExpectations;

  /** Skill activation expectations */
  skills?: SkillExpectations;

  /** Workflow step expectations (for multi-step evals) */
  workflow?: WorkflowExpectations;

  /** Generic assertions */
  assertions?: Assertion[];
}

/**
 * Tool call expectations
 */
export interface ToolCallExpectations {
  /** Tools that must be called */
  required?: ToolExpectation[];

  /** Tools that must NOT be called */
  forbidden?: string[];

  /** Order enforcement: 'strict' requires exact order, 'any' allows any order */
  order?: 'strict' | 'any';
}

/**
 * Individual tool expectation
 */
export interface ToolExpectation {
  /** Tool name */
  name: string;

  /** Expected arguments (partial match) */
  arguments?: Record<string, unknown>;
}

/**
 * Skill activation expectations
 */
export interface SkillExpectations {
  /** Skills that should be activated */
  activated?: string[];

  /** Content patterns that should be used from skills */
  content_used?: Array<{
    pattern: string;
    reason?: string;
  }>;
}

/**
 * Multi-step workflow expectations
 */
export interface WorkflowExpectations {
  /** Ordered steps in the workflow */
  steps: WorkflowStep[];
}

/**
 * A single step in a workflow
 */
export interface WorkflowStep {
  /** Step name for identification */
  name: string;

  /** Tools expected in this step */
  tools: string[];

  /** Order within this step */
  order?: 'strict' | 'any';

  /** Dependencies on previous steps */
  depends_on?: string;

  /** Expected argument patterns */
  arguments_contain?: Record<string, unknown>;
}

/**
 * Generic assertion
 */
export interface Assertion {
  /** Assertion type */
  type:
    | 'tool_called'
    | 'tool_not_called'
    | 'tool_arguments'
    | 'skill_activated'
    | 'response_mentions'
    | 'response_matches'
    | 'workflow_completed';

  /** Tool name (for tool assertions) */
  tool?: string;

  /** Skill name (for skill assertions) */
  skill?: string;

  /** Values to check in response */
  values?: string[];

  /** Regex pattern for response matching */
  pattern?: string;

  /** Workflow steps (for workflow_completed) */
  steps?: string[];
}

// ============================================================================
// Scoring Types
// ============================================================================

/**
 * LLM-as-judge scoring configuration
 */
export interface EvalScoring {
  llm_judge?: LLMJudgeConfig;
}

/**
 * LLM-as-judge configuration
 */
export interface LLMJudgeConfig {
  /** Whether to use LLM-as-judge */
  enabled: boolean;

  /** Scoring criteria */
  criteria: JudgeCriterion[];

  /** Minimum passing score (0-1) */
  threshold: number;

  /** Rubric for the judge */
  rubric?: string;
}

/**
 * A single scoring criterion
 */
export interface JudgeCriterion {
  /** Criterion name */
  name: string;

  /** Description for the judge */
  description: string;

  /** Weight in overall score (should sum to 1) */
  weight: number;
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Request to invoke an agent
 */
export interface InvokeRequest {
  /** Agent to test */
  agentId: string;

  /** User prompt */
  prompt: string;

  /** Platform context */
  context?: {
    platform?: EvalPlatform;
    chatId?: string;
    channelId?: string;
  };

  /** Model override for matrix testing */
  model?: string;

  /** Mock responses to configure */
  mockResponses?: EvalMocks;
}

/**
 * Response from agent invocation
 */
export interface InvokeResponse {
  /** Unique request ID */
  requestId: string;

  /** Agent that handled the request */
  agentId: string;

  /** Model used */
  model: string;

  /** Execution trace */
  executionTrace: ExecutionTrace;
}

/**
 * Execution trace from agent invocation
 */
export interface ExecutionTrace {
  /** All tool calls made */
  toolCalls: ToolCall[];

  /** Skills that were activated */
  skillActivations: string[];

  /** Final response text */
  responseText: string;

  /** Token usage */
  tokens: {
    input: number;
    output: number;
  };

  /** Total latency */
  latencyMs: number;
}

/**
 * A single tool call
 */
export interface ToolCall {
  /** Tool name */
  name: string;

  /** Arguments passed */
  arguments: Record<string, unknown>;

  /** Result returned */
  result: unknown;

  /** Duration */
  durationMs: number;

  /** Error if failed */
  error?: string;
}

// ============================================================================
// Result Types
// ============================================================================

/**
 * Result of a single eval execution
 */
export interface EvalResult {
  /** Eval name */
  evalName: string;

  /** Source file */
  sourceFile?: string;

  /** Model used */
  model: string;

  /** Agent tested */
  agent: string;

  /** Eval type */
  type: EvalType;

  /** Overall status */
  status: 'passed' | 'failed' | 'skipped' | 'error';

  /** Whether it passed */
  passed: boolean;

  /** Assertion results */
  assertions: AssertionResult[];

  /** LLM-as-judge score (if applicable) */
  judgeScore?: JudgeScore;

  /** Execution trace */
  executionTrace?: ExecutionTrace;

  /** Duration */
  durationMs: number;

  /** Error message (if status is 'error') */
  error?: string;
}

/**
 * Result of a single assertion
 */
export interface AssertionResult {
  /** Assertion type */
  type: string;

  /** Whether it passed */
  passed: boolean;

  /** Expected value */
  expected: unknown;

  /** Actual value */
  actual: unknown;

  /** Human-readable message */
  message?: string;

  /** Diff for debugging */
  diff?: unknown;
}

/**
 * LLM-as-judge score
 */
export interface JudgeScore {
  /** Overall score (0-1) */
  overall: number;

  /** Per-criterion scores */
  criteria: Record<
    string,
    {
      score: number;
      reasoning: string;
    }
  >;

  /** Summary from the judge */
  summary: string;

  /** Threshold used */
  threshold?: number;

  /** Whether it passed the threshold */
  passed?: boolean;
}

// ============================================================================
// Run Configuration Types
// ============================================================================

/**
 * Configuration for the eval server
 */
export interface EvalServerConfig {
  /** Port to listen on (0 for auto-assign) */
  port: number;

  /** Enable debug logging */
  debug?: boolean;

  /** OpenCode server password for authentication */
  openCodePassword?: string;
}

/**
 * Configuration for LLM judge
 */
export interface JudgeConfig {
  /** Model to use for judging */
  model?: string;

  /** API key (defaults to ANTHROPIC_API_KEY) */
  apiKey?: string;
}

/**
 * Configuration for the eval runner
 */
export interface EvalConfig {
  /** Server configuration */
  serverConfig: EvalServerConfig;

  /** Judge configuration */
  judgeConfig?: JudgeConfig;
}

/**
 * Options for running evals
 */
export interface RunOptions {
  /** Models to test */
  models?: string[];

  /** Filter by eval type */
  type?: EvalType;

  /** Filter by agent */
  agent?: string;

  /** Filter by eval name pattern */
  pattern?: string;
}

// ============================================================================
// Summary Types
// ============================================================================

/**
 * Summary of an eval run
 */
export interface EvalSummary {
  /** Run metadata */
  metadata: RunMetadata;

  /** Configuration used */
  config: {
    models: string[];
    evalTypes: EvalType[];
    agents: string[];
  };

  /** Aggregate summary */
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    passRate: number;

    byModel: Record<string, ModelSummary>;
    byType: Record<string, TypeSummary>;
    byAgent: Record<string, AgentSummary>;
  };

  /** Individual results */
  results: EvalResult[];
}

/**
 * Run metadata
 */
export interface RunMetadata {
  runId: string;
  timestamp: string;
  gitCommit?: string;
  gitBranch?: string;
  runner: 'cli' | 'vitest' | 'ci';
  durationMs: number;
}

/**
 * Summary per model
 */
export interface ModelSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/**
 * Summary per eval type
 */
export interface TypeSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}

/**
 * Summary per agent
 */
export interface AgentSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
}
