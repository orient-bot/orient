'use client';

interface KeyProps {
  label: string;
  subLabel?: string;
  width?: 'normal' | 'wide' | 'wider' | 'space';
}

const Key = ({ label, subLabel, width = 'normal' }: KeyProps) => {
  const widthClasses = {
    normal: 'w-10 h-10',
    wide: 'w-16 h-10',
    wider: 'w-24 h-10',
    space: 'w-48 h-10',
  };

  return (
    <div
      className={`key ${widthClasses[width]} flex flex-col items-center justify-center relative`}
    >
      {subLabel && <span className="keycap-legend">{subLabel}</span>}
      <span className="keycap-main text-xs">{label}</span>
    </div>
  );
};

interface KeyboardRowProps {
  keys: Array<{ label: string; subLabel?: string; width?: 'normal' | 'wide' | 'wider' | 'space' }>;
}

export default function KeyboardRow({ keys }: KeyboardRowProps) {
  return (
    <div className="keyboard-row">
      {keys.map((key, i) => (
        <Key key={i} {...key} />
      ))}
    </div>
  );
}

// Decorative keyboard section
export function DecorativeKeyboard() {
  const rows = [
    [{ label: 'T' }, { label: 'H' }, { label: 'E' }],
    [
      { label: 'S', subLabel: '!' },
      { label: 'H', subLabel: '@' },
      { label: 'I', subLabel: '#' },
      { label: 'F', subLabel: '$' },
      { label: 'T', subLabel: '%' },
    ],
  ];

  return (
    <div className="keyboard-container inline-block">
      <div className="space-y-2">
        {rows.map((row, i) => (
          <KeyboardRow key={i} keys={row} />
        ))}
      </div>
    </div>
  );
}
