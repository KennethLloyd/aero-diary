import type { Mood } from '@/generated/prisma/enums';

const ORB_CLASS: Record<Mood, string> = {
  AWFUL: 'orb-awful',
  BAD: 'orb-bad',
  MEH: 'orb-meh',
  GOOD: 'orb-good',
  RAD: 'orb-rad',
};

const ORB_EMOJI: Record<Mood, string> = {
  AWFUL: '😭',
  BAD: '😟',
  MEH: '😐',
  GOOD: '😊',
  RAD: '😃',
};

const ORB_LABEL: Record<Mood, string> = {
  AWFUL: 'Awful',
  BAD: 'Bad',
  MEH: 'Meh',
  GOOD: 'Good',
  RAD: 'Rad',
};

// Specular glossy mood orb; `mini` renders the small calendar dot.
export function AeroOrb({
  mood,
  mini = false,
  className = '',
}: {
  mood: Mood
  mini?: boolean
  className?: string
}) {
  return (
    <div
      className={`aero-orb flex-none ${ORB_CLASS[mood]} ${mini ? 'mini-orb' : ''} ${className}`}
      role="img"
      aria-label={`Mood: ${ORB_LABEL[mood]}`}
    >
      {mini ? null : ORB_EMOJI[mood]}
    </div>
  );
}
