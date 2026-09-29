const timelineCitation = /^\[[^\]]+\]\(\/timeline\/[A-Za-z0-9_-]+\)/;
const timelineCitationAnywhere = /\[[^\]]+\]\(\/timeline\/[A-Za-z0-9_-]+\)/g;
const incompleteTimelineCitation = /\[[^\]]*\]\(\/timeline\/[A-Za-z0-9_-]*(?:[^)]*)?$/;

export function userAskedForEvidence(content: string): boolean {
  return /\b(?:evidence|sources?|citations?|cite|proof|link|journal entry|diary entry|show (?:me )?(?:the )?(?:journal|diary|note|entry)|which entry|how do you know)\b/i.test(content);
}

export function assistantContentForPrompt(content: string, userContent: string): string {
  if (userAskedForEvidence(userContent)) return content;
  return content
    .replace(timelineCitationAnywhere, '')
    .replace(incompleteTimelineCitation, '')
    .trim();
}

export function createAssistantTextWriter(
  write: ((content: string) => void) | undefined,
  userContent: string,
): { onText?: (content: string) => void; finish: () => void } {
  if (!write) return { finish: () => {} };
  if (userAskedForEvidence(userContent)) return { onText: write, finish: () => {} };

  let pending = '';
  const drain = () => {
    while (pending) {
      const opening = pending.indexOf('[');
      if (opening < 0) {
        write(pending);
        pending = '';
        return;
      }
      if (opening > 0) {
        write(pending.slice(0, opening));
        pending = pending.slice(opening);
      }

      if (timelineCitation.test(pending)) {
        pending = pending.replace(timelineCitation, '');
        continue;
      }

      const close = pending.indexOf(']');
      if (close < 0) return;
      const afterClose = pending.slice(close + 1);
      const citationPrefix = '(/timeline/';
      if (citationPrefix.startsWith(afterClose) || afterClose.startsWith(citationPrefix)) return;

      write(pending.slice(0, close + 1));
      pending = pending.slice(close + 1);
    }
  };

  return {
    onText(content) {
      pending += content;
      drain();
    },
    finish() {
      const safeRemainder = assistantContentForPrompt(pending, userContent);
      if (safeRemainder) write(safeRemainder);
      pending = '';
    },
  };
}
