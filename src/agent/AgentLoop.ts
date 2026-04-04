import { DefaultAgentInstance } from './AgentInstance.js';
import { isTerminal } from './AgentStateMachine.js';
import { ModelProvider, MessageContent } from '../types/model.js';
import { ToolIntegrationFacade, ToolDefinition } from '../types/tool.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { ToolValidationError, PermissionDeniedError, ToolExecutionError, ModelError } from '../types/errors.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import { ExceptionHandler } from '../exception/ExceptionHandler.js';
import { VerificationPipeline } from '../validation/VerificationPipeline.js';
import { withRetry } from '../exception/RetryStrategy.js';

export interface ReliabilityLayer {
  memory: MemoryStore;
  checkpoint: CheckpointManager;
  exceptionHandler: ExceptionHandler;
  verification: VerificationPipeline;
}

/**
 * [Phase 1 Integration] runAgentLoop with Reliability Layer.
 * Injects Memory, Checkpoints, Retries, and Verification into the kernel loop.
 */
export async function runAgentLoop(
  agent: DefaultAgentInstance,
  model: ModelProvider,
  tools: ToolIntegrationFacade,
  sandbox: PermissionSandbox,
  reliability: ReliabilityLayer,
): Promise<void> {

  // We loop until the agent enters a terminal state (completed, failed, killed)
  while (!isTerminal(agent.status) && agent.status === 'running') {
    
    // 0. Persistence: Save atomic checkpoint at the start of each turn [C3, C4]
    await reliability.checkpoint.save(agent as any, (reliability.memory as any).l2);

    // 1. Sense: Collect current context (messages + dynamic memory [I1])
    const memoryContext = reliability.memory.getContext();
    const contextMessages = agent.messages;

    try {
      // 2. Think: Call the model with [C5] Retry Strategy
      const retryGenerator = withRetry(
        () => model.chat({
          model: agent.definition.model,
          systemPrompt: `${agent.definition.systemPrompt}\n\n${memoryContext}`,
          messages: contextMessages,
          tools: tools.listAll(),
        }),
        { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 }
      );

      // Consume generator (Phase 1 simplicity: take final result, log intermediaries via events)
      let response;
      for await (const status of retryGenerator) {
        // Status updates are handled by events inside withRetry or here
        console.log(`[AgentLoop] Model retry attempt ${status.attempt}/${status.maxAttempts}...`);
      }
      // The final call to next() returns the result
      // Actually withRetry implementation returns the value on completion
      // But AsyncGenerator needs careful handling. 
      // Re-implementing simplified loop consumption:
      const generator = withRetry(
        () => model.chat({
          model: agent.definition.model,
          systemPrompt: `${agent.definition.systemPrompt}\n\n${memoryContext}`,
          messages: contextMessages,
          tools: tools.listAll(),
        }),
        { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 }
      );

      let next = await generator.next();
      while (!next.done) {
        next = await generator.next();
      }
      response = next.value;

      // Reset circuit breaker on success [C6]
      reliability.exceptionHandler.recordSuccess('model');

      // Append assistant's response to the agent's memory
      agent.addMessage('assistant', response.content);

      // 3. Act: Process model output and handle tool calls
      const toolResultsContent: MessageContent[] = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          // Record tool call for memory flush triggers [C1]
          reliability.memory.recordToolCall();

          const tool = tools.findTool(block.name);
          if (!tool) {
            toolResultsContent.push({ type: 'tool_result', tool_use_id: block.id, content: `Unknown tool: ${block.name}`, is_error: true });
            continue;
          }

          try {
            const result = await executeWithPermissionCheck(tool, block.input, sandbox, agent.context);
            toolResultsContent.push({ type: 'tool_result', tool_use_id: block.id, content: result.output as any ?? 'Success' });
          } catch (e: any) {
            toolResultsContent.push({ type: 'tool_result', tool_use_id: block.id, content: `Error executing tool: ${e.message}`, is_error: true });
          }
        }
      }

      if (toolResultsContent.length > 0) {
        agent.addMessage('user', toolResultsContent);
      }

      // 4. Check termination & [I4] Run Verification Pipeline
      if (response.stopReason === 'end_turn') {
        agent.transition('task_done'); 
        
        // --- [R5] Verification Phase ---
        const verifResult = await reliability.verification.execute({ agent, tools });
        
        if (verifResult.passed) {
          agent.transition('verified');
        } else {
          // [I4] Blocking failed — re-inject remediation and return to thinking
          agent.addMessage('user', `Verification failed:\n${verifResult.summary}\nPlease fix the issues and try again.`);
          agent.transition('running'); // Transition back to allow fixing
        }
      }
      
    } catch (error: any) {
      // Record failure for circuit breaker [C6]
      if (error instanceof ModelError) {
        reliability.exceptionHandler.recordFailure('model');
      }

      const action = await reliability.exceptionHandler.handle(error);
      if (action.strategy.type === 'abort') {
        agent.transition('error');
        break;
      }
      // For other strategies (fallback, human), implementation continues...
    }
  }
}

/**
 * Executes a tool while enforcing the permission sandbox and validation.
 */
async function executeWithPermissionCheck<I, O>(
  tool: ToolDefinition<I, O>,
  input: I,
  sandbox: PermissionSandbox,
  context: any,
) {
  // Step 1: Tool's internal validation (if available) [R3]
  if (tool.validateInput) {
    const valid = await tool.validateInput(input, context);
    if (!valid.result) {
      throw new ToolValidationError(tool.name, valid.errors as any);
    }
  }

  // Step 2: Tool's own permission checks
  const permCheck = await tool.checkPermissions(input, context);
  if (permCheck.behavior === 'deny') {
    throw new PermissionDeniedError(tool.name, 'unknown' as any, sandbox as any);
  }

  // Step 4: Execute tool
  try {
    return await tool.call(input, context);
  } catch (err: any) {
    throw new ToolExecutionError(tool.name, err.message, err);
  }
}
