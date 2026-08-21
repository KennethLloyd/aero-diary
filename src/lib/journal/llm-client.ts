import 'server-only';

export type LlmRequest = {
  systemPrompt: string
  userPrompt: string
};

export interface LlmClient {
  complete(request: LlmRequest): Promise<string>
}
