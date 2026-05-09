import type Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  TextBlock,
  ContentBlockParam,
  Message,
} from '@anthropic-ai/sdk/resources/messages';
import { TokenBudget } from '../util/budget.js';
import { log } from '../util/log.js';

export type ToolHandler = (input: unknown) => Promise<string>;

export type AgentTool = {
  spec: Tool;
  handler: ToolHandler;
};

export type AgentRunResult = {
  finalText: string;
  inputTokens: number;
  outputTokens: number;
  steps: number;
  stopReason: string;
  toolCalls: number;
};

export type AgentRunOpts = {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  tools?: AgentTool[];
  budget: TokenBudget;
  maxSteps?: number;
  maxTokensPerCall?: number;
};

export async function runAgent(opts: AgentRunOpts): Promise<AgentRunResult> {
  const tools = opts.tools ?? [];
  const toolMap = new Map(tools.map((t) => [t.spec.name, t.handler]));
  const messages: MessageParam[] = [{ role: 'user', content: opts.userPrompt }];
  const maxSteps = opts.maxSteps ?? 30;
  const maxTokensPerCall = opts.maxTokensPerCall ?? 4096;

  let inputTokens = 0;
  let outputTokens = 0;
  let toolCalls = 0;
  let stopReason = 'unknown';
  let finalText = '';

  for (let step = 0; step < maxSteps; step++) {
    if (opts.budget.exhausted()) {
      stopReason = 'budget_exhausted';
      break;
    }

    let response: Message;
    try {
      response = await opts.client.messages.create({
        model: opts.model,
        max_tokens: maxTokensPerCall,
        system: opts.systemPrompt,
        messages,
        tools: tools.length > 0 ? tools.map((t) => t.spec) : undefined,
      });
    } catch (err) {
      log.error(`Anthropic call failed: ${(err as Error).message}`);
      stopReason = 'api_error';
      break;
    }

    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    opts.budget.record({
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    });
    stopReason = response.stop_reason ?? 'unknown';

    finalText = extractText(response.content);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason !== 'tool_use') break;

    const toolUses = response.content.filter((b): b is ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) break;

    const toolResults: ContentBlockParam[] = [];
    for (const tu of toolUses) {
      toolCalls += 1;
      const handler = toolMap.get(tu.name);
      let result: string;
      let isError = false;
      if (!handler) {
        result = `Tool "${tu.name}" not registered.`;
        isError = true;
      } else {
        try {
          result = await handler(tu.input);
        } catch (err) {
          result = `Tool "${tu.name}" threw: ${(err as Error).message}`;
          isError = true;
        }
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result.slice(0, 100_000),
        is_error: isError,
      });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { finalText, inputTokens, outputTokens, steps: messages.length, stopReason, toolCalls };
}

function extractText(content: Message['content']): string {
  return content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function callStructured<T>(opts: {
  client: Anthropic;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schemaDescription: string;
  inputSchema: Tool.InputSchema;
  budget: TokenBudget;
  maxTokens?: number;
}): Promise<{ value: T; inputTokens: number; outputTokens: number }> {
  const tool: Tool = {
    name: opts.schemaName,
    description: opts.schemaDescription,
    input_schema: opts.inputSchema,
  };
  const response = await opts.client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.systemPrompt,
    messages: [{ role: 'user', content: opts.userPrompt }],
    tools: [tool],
    tool_choice: { type: 'tool', name: opts.schemaName },
  });
  opts.budget.record({
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationTokens: response.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
  });

  const toolUse = response.content.find((b): b is ToolUseBlock => b.type === 'tool_use');
  if (!toolUse) {
    throw new Error(`Structured call returned no tool_use block. Stop reason: ${response.stop_reason}`);
  }
  return {
    value: toolUse.input as T,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
