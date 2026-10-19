import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantMessage } from './AssistantMessage';

afterEach(cleanup);

describe('assistant reply presentation', () => {
  it('renders Markdown and real journal links without technical source IDs', () => {
    const { container } = render(
      <AssistantMessage
        content={
          '## A memory\n\nYou mentioned **Angular**.\n\n- A small goal\n- A second step\n\n[October 6, 2026](/timeline/entry_123) — source ID `cmuw5rjcr001q48qv3nnnez46`\n\n```ts\nconst goal = "learn";\n```'
        }
      />,
    );

    expect(screen.getByRole('heading', { name: 'A memory' })).toBeInTheDocument();
    expect(container.querySelector('strong')).toHaveTextContent('Angular');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /October 6, 2026/ })).toHaveAttribute(
      'href',
      '/timeline/entry_123',
    );
    expect(container.querySelector('pre code')).toHaveTextContent('const goal = "learn";');
    expect(container).not.toHaveTextContent('cmuw5rjcr001q48qv3nnnez46');
  });

  it('does not execute HTML, unsafe links, or load remote images from assistant content', () => {
    const { container } = render(
      <AssistantMessage
        content={
          '<script>alert(1)</script>\n\n[unsafe](javascript:alert)\n\n![tracking](https://example.com/tracker.png)\n\n[Unknown entry](/timeline/../../settings)\n\n[External reference](https://example.com)'
        }
      />,
    );

    expect(container.querySelector('script, img')).toBeNull();
    expect(screen.queryByRole('link', { name: 'unsafe' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Unknown entry' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'External reference' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });
});
