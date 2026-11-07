import type { AppConfig } from './env.js';

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatResult {
  httpStatus: number;
  latencyMs: number;
  content: string;
  toolCalls: ToolCall[];
  error?: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: unknown[];
  toolChoice?: unknown;
  jsonSchema?: Record<string, unknown>;
  schemaName?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

function endpoint(config: AppConfig): { url: string; apiKey: string } {
  if (config.inferenceProvider === 'brev_nim') {
    return { url: `${config.nimBaseUrl}/chat/completions`, apiKey: config.nimApiKey };
  }
  return { url: `${config.nvidiaBaseUrl}/chat/completions`, apiKey: config.nvidiaApiKey };
}

function redact(text: string, secret: string): string {
  const cleaned = secret ? text.split(secret).join('[redacted]') : text;
  return cleaned.slice(0, 800);
}

export function extractJsonObject(text: string): unknown {
  const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = withoutThink.indexOf('{');
  const end = withoutThink.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('MODEL_OUTPUT_INVALID');
  return JSON.parse(withoutThink.slice(start, end + 1)) as unknown;
}

export async function chatComplete(
  config: AppConfig,
  messages: Array<Record<string, unknown>>,
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!config.providerConfigured) {
    return { httpStatus: 0, latencyMs: 0, content: '', toolCalls: [], error: config.providerBlocker || 'provider not configured' };
  }
  const { url, apiKey } = endpoint(config);
  const started = Date.now();
  const timeout = AbortSignal.timeout(options.timeoutMs ?? config.modelTimeoutMs);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const baseBody: Record<string, unknown> = {
    model: config.model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_tokens: options.maxTokens ?? 800,
    stream: false,
    chat_template_kwargs: { enable_thinking: false },
  };
  if (options.tools) baseBody.tools = options.tools;
  if (options.toolChoice) baseBody.tool_choice = options.toolChoice;
  if (options.jsonSchema) {
    baseBody.response_format = {
      type: 'json_schema',
      json_schema: {
        name: options.schemaName || 'proofroute',
        strict: true,
        schema: options.jsonSchema,
      },
    };
  }

  const send = async (body: Record<string, unknown>) => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (apiKey) headers.authorization = `Bearer ${apiKey}`;
    return fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
  };

  try {
    let response = await send(baseBody);
    if (response.status === 400 && 'chat_template_kwargs' in baseBody) {
      const { chat_template_kwargs: _ignored, ...rest } = baseBody;
      response = await send(rest);
    }
    if (response.status === 400 && options.jsonSchema && baseBody.response_format) {
      const { response_format: _format, chat_template_kwargs: _ignored, ...rest } = baseBody;
      response = await send(rest);
    }
    const latencyMs = Date.now() - started;
    const raw = await response.text();
    if (!response.ok) {
      return { httpStatus: response.status, latencyMs, content: '', toolCalls: [], error: redact(raw, apiKey) };
    }
    const parsed = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }>;
    };
    const message = parsed.choices?.[0]?.message;
    const toolCalls = (message?.tool_calls ?? []).map((call, index) => ({
      id: call.id || `call_${index + 1}`,
      name: call.function?.name || '',
      arguments: call.function?.arguments || '{}',
    }));
    return { httpStatus: response.status, latencyMs, content: message?.content ?? '', toolCalls };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'provider request failed';
    return { httpStatus: 0, latencyMs: Date.now() - started, content: '', toolCalls: [], error: redact(message, apiKey) };
  }
}

export const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    roleTitle: { type: 'string' },
    jobId: { type: 'string' },
    senderDomain: { type: 'string' },
    requestedActionQuotes: { type: 'array', items: { type: 'string' } },
    toolCalls: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          tool: {
            type: 'string',
            enum: ['resolveEmployer', 'listPublishedJobs', 'getPublishedJob', 'getApprovedRecruitingPage', 'compareClaimedDomain'],
          },
          purpose: { type: 'string' },
          jobId: { type: 'string' },
          domain: { type: 'string' },
        },
        required: ['tool', 'purpose', 'jobId', 'domain'],
      },
    },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['roleTitle', 'jobId', 'senderDomain', 'requestedActionQuotes', 'toolCalls', 'reasons'],
};

export const SYNTHESIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    reasons: { type: 'array', items: { type: 'string' } },
    unresolvedQuestions: { type: 'array', items: { type: 'string' } },
    senderAuthenticated: { type: 'boolean' },
  },
  required: ['reasons', 'unresolvedQuestions', 'senderAuthenticated'],
};

export const SMOKE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    token: { type: 'string' },
  },
  required: ['ok', 'token'],
};
