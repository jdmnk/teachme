export function Chevron({ open, size = 17 }: { open?: boolean; size?: number }) {
  return (
    <svg
      className={`chev-svg${open ? ' open' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M3.6 6.2l4.4 4.4 4.4-4.4"
        stroke="currentColor"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
