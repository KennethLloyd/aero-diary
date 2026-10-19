import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import styles from './AeroAiClient.module.css';

export function AssistantMessage({ content }: { content: string }) {
  // Hide technical source labels without changing the stored answer or its journal links.
  const readable = content.replace(/\s*(?:[—–-]\s*)?(?:source|entry)\s+ID\s*:?\s*`?c[a-z0-9]{20,}`?/gi, '');

  return (
    <div className={styles.markdown}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          img: () => null,
          a: ({ href, children }) => {
            if (href && /^\/timeline\/[A-Za-z0-9_-]+$/.test(href)) {
              return (
                <a href={href} className={styles.journalLink}>
                  <span aria-hidden="true">📖</span> {children}
                  <span className="sr-only"> — View journal entry</span>
                </a>
              );
            }
            if (!href || !/^https?:\/\//i.test(href)) return <span>{children}</span>;
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className={styles.tableScroll}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {readable}
      </Markdown>
    </div>
  );
}
