export function Chevron({ open }: { open?: boolean }) {
  return (
    <svg
      className={`chev-svg${open ? ' open' : ''}`}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
