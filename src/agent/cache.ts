import type {
  MessageParam,
  TextBlockParam,
  Tool,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/messages';

const EPHEMERAL = { type: 'ephemeral' as const };

export function systemWithCache(systemPrompt: string): TextBlockParam[] {
  return [{ type: 'text', text: systemPrompt, cache_control: EPHEMERAL }];
}

export function toolsWithCache(tools: Tool[]): Tool[] {
  if (tools.length === 0) return tools;
  return tools.map((t, i) =>
    i === tools.length - 1 ? { ...t, cache_control: EPHEMERAL } : t,
  );
}

export function messagesWithRollingCache(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages;
  const lastIdx = messages.length - 1;
  return messages.map((msg, idx) => {
    if (idx !== lastIdx) return msg;
    return { ...msg, content: addCacheToLastBlock(msg.content) };
  });
}

type ContentItem = MessageParam['content'];

function addCacheToLastBlock(content: ContentItem): ContentItem {
  if (typeof content === 'string') {
    return [{ type: 'text', text: content, cache_control: EPHEMERAL }];
  }
  if (!Array.isArray(content) || content.length === 0) return content;

  return content.map((block, i) => {
    if (i !== content.length - 1) return block;
    if (block.type === 'text') {
      return { ...block, cache_control: EPHEMERAL } as TextBlockParam;
    }
    if (block.type === 'tool_result') {
      return { ...block, cache_control: EPHEMERAL } as ToolResultBlockParam;
    }
    return block;
  });
}
