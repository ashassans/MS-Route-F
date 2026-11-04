export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<UnifiedContentBlock>;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export type UnifiedContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface UnifiedTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>; // JSON Schema
}

export interface UnifiedChatRequest {
  model: string;
  messages: UnifiedMessage[];
  system?: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stream?: boolean;
  tools?: UnifiedTool[];
  toolChoice?: unknown;
}

export interface UnifiedStreamChunk {
  type: 'delta' | 'tool_call' | 'usage' | 'done';
  deltaText?: string;
  toolCall?: {
    id: string;
    name?: string;
    argumentsDelta?: string;
  };
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string | null;
}

export interface UnifiedChatResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
  stopReason?: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}
