/** One stroke icon family: 24-unit grid, 2px round stroke. Buttons carry the accessible name. */
const PATHS = {
  left: 'M15 6l-6 6 6 6',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  upLeft: 'M16 8H8v8M8 8l9 9',
  upRight: 'M8 8h8v8M16 8l-9 9',
  downLeft: 'M8 8v8h8M8 16l9-9',
  downRight: 'M16 8v8H8M16 16L7 7',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  reset: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  chevron: 'M6 9l6 6 6-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  centre: 'M12 9v6M9 12h6',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Star News four-point star mark (signal red), drawn from the logo's concave diamond. */
export function StarMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="star-mark" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M16 1C17.6 10.2 21.8 14.4 31 16 21.8 17.6 17.6 21.8 16 31 14.4 21.8 10.2 17.6 1 16 10.2 14.4 14.4 10.2 16 1Z" fill="currentColor" />
    </svg>
  );
}
