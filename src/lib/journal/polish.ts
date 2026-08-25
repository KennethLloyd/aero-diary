import 'server-only';

import type { LlmClient } from './llm-client';

type PolishRequest = {
  note: string
  styleStandard: string
};

const THINK_BLOCK = /<think\s*>[\s\S]*?<\/think\s*>/gi;
const THINK_TAG = /<\/?think\s*>/gi;

function systemPrompt(styleStandard: string): string {
  return [
    'You are revising a journal draft. The user message already contains the complete draft.',
    'Return only the complete draft, revised against the style rules below. Never ask for the draft.',
    'If no changes are needed, return the draft unchanged. Do not add a preface, explanation, title, or quotation marks.',
    'Never output chain-of-thought, hidden reasoning, or <think> tags.',
    'Preserve meaning, facts, emotional truth, and first-person perspective. Never truncate the draft.',
    '',
    'Style rules:',
    styleStandard,
  ].join('\n');
}

export function normalizePolishedText(content: string): string {
  let normalized = content.replace(THINK_BLOCK, '');
  const unmatchedOpening = /<think\s*>/i.exec(normalized);

  if (unmatchedOpening) {
    const contentAfterOpening = normalized.slice(
      unmatchedOpening.index + unmatchedOpening[0].length,
    );
    if (contentAfterOpening.trim()) return '';
    normalized = normalized.slice(0, unmatchedOpening.index);
  }

  return normalized.replace(THINK_TAG, '').trim();
}

export async function requestPolishedEntry(
  { note, styleStandard }: PolishRequest,
  client: LlmClient,
): Promise<string> {
  const revisedText = normalizePolishedText(await client.complete({
    systemPrompt: systemPrompt(styleStandard),
    userPrompt: note,
  }));
  if (!revisedText) throw new Error('LLM returned no usable polished text.');
  return revisedText;
}
