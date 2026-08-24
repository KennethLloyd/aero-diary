import type { TextareaHTMLAttributes } from 'react';

type AeroTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

export function AeroTextarea(props: AeroTextareaProps) {
  return (
    <textarea
      className="aero-input w-full resize-y px-4 py-3 text-[15px] leading-relaxed"
      {...props}
    />
  );
}
