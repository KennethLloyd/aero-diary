'use client';
import { AeroOrb } from '@/components/aero/AeroOrb';
import { Mood } from '@/generated/prisma/enums';

const MOOD_LABEL: Record<Mood, string> = {
  AWFUL: 'Awful',
  BAD: 'Bad',
  MEH: 'Meh',
  GOOD: 'Good',
  RAD: 'Rad',
};

const MOODS: Mood[] = [Mood.AWFUL, Mood.BAD, Mood.MEH, Mood.GOOD, Mood.RAD];

type MoodOrbPickerProps = {
  value: Mood;
  onChange: (mood: Mood) => void;
};

export function MoodOrbPicker({ value, onChange }: MoodOrbPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Mood"
      className="flex items-end justify-between gap-1 sm:gap-2"
    >
      {MOODS.map((mood) => {
        const selected = mood === value;
        return (
          <button
            key={mood}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={MOOD_LABEL[mood]}
            onClick={() => onChange(mood)}
            className={`flex flex-col items-center gap-1 rounded-2xl p-1 transition-transform duration-150 ${
              selected ? 'scale-105' : 'hover:scale-105'
            }`}
          >
            <span
              className={`relative rounded-full transition-shadow duration-150 ${
                selected
                  ? 'ring-2 ring-white shadow-[0_0_0_2px_rgba(20,108,194,0.55)]'
                  : ''
              }`}
            >
              <AeroOrb mood={mood} />
            </span>
            <span
              className={`text-[11px] font-bold uppercase tracking-wide ${
                selected ? 'text-[#0a2f5c]' : 'text-[#5a7194]'
              }`}
            >
              {MOOD_LABEL[mood]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
