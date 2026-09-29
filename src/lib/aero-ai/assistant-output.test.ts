import { describe, expect, it } from 'vitest';
import {
  assistantContentForPrompt,
  createAssistantTextWriter,
  userAskedForEvidence,
} from './assistant-output';

describe('Aero AI source references', () => {
  it('removes a source link unless the user asked for evidence', () => {
    const answer = 'You went kayaking. [June 14, 2026](/timeline/entry_123)';
    expect(assistantContentForPrompt(answer, 'What did I do by the water?'))
      .toBe('You went kayaking.');
    expect(assistantContentForPrompt(answer, 'Can you show me the journal evidence?'))
      .toBe(answer);
  });

  it('recognizes direct requests for an entry or source', () => {
    expect(userAskedForEvidence('Which journal entry supports that?')).toBe(true);
    expect(userAskedForEvidence('When did that happen?')).toBe(false);
  });

  it('keeps streaming text flowing while withholding a split source link', () => {
    const chunks: string[] = [];
    const writer = createAssistantTextWriter((chunk) => chunks.push(chunk), 'What did I do by the water?');
    writer.onText?.('You went kayaking. [June 14');
    writer.onText?.(', 2026](/timeline/entry_');
    writer.onText?.('123)');
    writer.finish();

    expect(chunks.join('').trim()).toBe('You went kayaking.');
  });
});
