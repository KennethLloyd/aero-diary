import 'server-only';

export type LlmResponseFormat = 'json_object'

export type LlmRequest = {
  systemPrompt: string
  userPrompt: string
  responseFormat?: LlmResponseFormat
};

export interface LlmClient {
  complete(request: LlmRequest): Promise<string>
}
