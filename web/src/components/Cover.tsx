import { useMemo } from 'react';
import { hashString, seriesPalette } from '../lib/cover';

/**
 * Series artwork: one language for every cover — near-vertical columns over a
 * three-stop gradient in the series hue. The topic seeds the hue plus the
 * column widths, gaps, weights and lean, so a shelf reads as one system while
 * no two series look the same. Shapes are generated, never hand-authored, and
 * the SVG scales from the 40px mini-player tile to a full-bleed hero.
 */
export function Cover({ seed, className = '' }: { seed: string; className?: string }) {
  const art = useMemo(() => build(seed), [seed]);
  return (
    <div className={`cover ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id={art.gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={art.c1} />
            <stop offset="0.55" stopColor={art.c2} />
            <stop offset="1" stopColor={art.c3} />
          </linearGradient>
          <radialGradient id={`${art.gid}s`} cx="0.24" cy="0.16" r="0.9">
            <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={art.cid}>
            <rect width="100" height="100" />
          </clipPath>
        </defs>
        <rect width="100" height="100" fill={`url(#${art.gid})`} />
        <g clipPath={`url(#${art.cid})`} transform={`rotate(${art.lean} 50 50)`}>
          {art.columns.map((col, i) => (
            <rect key={i} x={col.x} y={-40} width={col.w} height={180} fill={col.fill} />
          ))}
        </g>
        <rect width="100" height="100" fill={`url(#${art.gid}s)`} />
        <rect width="100" height="100" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
      </svg>
    </div>
  );
}

const WEIGHTS = ['rgba(255,255,255,0.34)', 'rgba(255,255,255,0.17)', 'rgba(0,0,0,0.24)'];

function build(seed: string) {
  const hash = hashString(seed);
  const { c1, c2, c3, rand: r } = seriesPalette(seed);

  // a slight lean keeps the columns from reading as a progress bar
  const lean = Math.round((-12 + r() * 24) * 10) / 10;

  const columns: { x: number; w: number; fill: string }[] = [];
  let x = -34;
  let i = 0;
  while (x < 134) {
    const w = 3 + r() * 12;
    columns.push({ x, w, fill: WEIGHTS[i % 3] });
    x += w + 3 + r() * 9;
    i++;
  }

  return {
    gid: `g${hash.toString(36)}`,
    cid: `c${hash.toString(36)}`,
    c1,
    c2,
    c3,
    lean,
    columns,
  };
}
