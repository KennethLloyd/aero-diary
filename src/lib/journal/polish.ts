import 'server-only';

import { configuredLlmClient, configuredLlmRequest } from './llm-client-config';

type PolishRequest = {
  note: string
  styleStandard: string
};

function systemPrompt(styleStandard: string): string {
  return [
    'You are revising a journal draft. The user message already contains the complete draft.',
    'Return only the complete draft, revised against the style rules below. Never ask for the draft.',
    'If no changes are needed, return the draft unchanged. Do not add a preface, explanation, title, or quotation marks.',
    'Preserve meaning, facts, emotional truth, and first-person perspective. Never truncate the draft.',
    '',
    'Style rules:',
    styleStandard,
  ].join('\n');
}

export async function requestPolishedEntry({ note, styleStandard }: PolishRequest): Promise<string> {
  const client = configuredLlmClient();
  const request = configuredLlmRequest();

  return client.complete({
    ...request,
    messages: [
      { role: 'system', content: systemPrompt(styleStandard) },
      { role: 'user', content: note },
    ],
  });
}
