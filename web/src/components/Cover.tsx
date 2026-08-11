import { useMemo } from 'react';
import { hashString, rng, seriesHue } from '../lib/cover';

/**
 * Procedural series artwork: a two-tone gradient in the series hue with one of
 * seven motifs drawn over it. Shapes are generated (never hand-authored paths)
 * and the SVG scales from the 40px mini-player tile to a full-bleed hero.
 */
const MOTIFS = 8;

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
            <stop offset="0" stopColor="#fff" stopOpacity="0.34" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <clipPath id={art.cid}>
            <rect width="100" height="100" />
          </clipPath>
        </defs>
        <rect width="100" height="100" fill={`url(#${art.gid})`} />
        <g clipPath={`url(#${art.cid})`}>{art.shapes}</g>
        <rect width="100" height="100" fill={`url(#${art.gid}s)`} />
        <rect width="100" height="100" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
      </svg>
    </div>
  );
}

function build(seed: string) {
  const h = seriesHue(seed);
  const hash = hashString(seed);
  const r = rng(hash);
  const motif = hash % MOTIFS;
  const flip = r() > 0.5 ? 1 : -1;
  // three stops across a wide sweep of the wheel: covers read as artwork
  // rather than a flat tint, and no two topics land on the same run
  const h2 = (h + flip * (34 + Math.floor(r() * 26)) + 360) % 360;
  const h3 = (h + flip * (72 + Math.floor(r() * 44)) + 360) % 360;

  const c1 = `hsl(${h} 92% ${60 + Math.floor(r() * 8)}%)`;
  const c2 = `hsl(${h2} 82% ${46 + Math.floor(r() * 8)}%)`;
  const c3 = `hsl(${h3} 76% ${26 + Math.floor(r() * 10)}%)`;
  const light = 'rgba(255,255,255,0.32)';
  const lighter = 'rgba(255,255,255,0.17)';
  const dark = 'rgba(0,0,0,0.26)';

  const gid = `g${hash.toString(36)}`;
  const cid = `c${hash.toString(36)}`;
  const s: JSX.Element[] = [];
  let k = 0;
  const key = () => `s${k++}`;

  if (motif === 0) {
    // concentric rings, centre pushed off-frame
    const cx = 18 + r() * 64;
    const cy = 18 + r() * 64;
    for (let i = 6; i >= 1; i--)
      s.push(
        <circle
          key={key()}
          cx={cx}
          cy={cy}
          r={i * 13}
          fill="none"
          stroke={i % 2 ? light : dark}
          strokeWidth={3 + r() * 3}
        />,
      );
  } else if (motif === 1) {
    // leaning columns of uneven width and weight
    const rot = -14 + r() * 28;
    const bars: JSX.Element[] = [];
    let x = -30;
    let i = 0;
    while (x < 130) {
      const w = 3 + r() * 12;
      bars.push(
        <rect key={i} x={x} y={-40} width={w} height={190} fill={i % 3 === 0 ? light : i % 3 === 1 ? lighter : dark} />,
      );
      x += w + 3 + r() * 9;
      i++;
    }
    s.push(
      <g key={key()} transform={`rotate(${rot} 50 50)`}>
        {bars}
      </g>,
    );
  } else if (motif === 2) {
    // waveform rising from the base
    const n = 13;
    for (let i = 0; i < n; i++) {
      const hgt = 16 + Math.abs(Math.sin(i * 1.3 + hash % 7)) * 66;
      s.push(
        <rect
          key={key()}
          x={i * (100 / n) + 1.6}
          y={100 - hgt}
          width={100 / n - 3.2}
          height={hgt}
          rx={1.8}
          fill={i % 3 === 0 ? light : lighter}
        />,
      );
    }
  } else if (motif === 3) {
    // orbit: one large disc, one smaller crossing it
    s.push(<circle key={key()} cx={30 + r() * 20} cy={34 + r() * 18} r={30 + r() * 12} fill={light} />);
    s.push(<circle key={key()} cx={66 + r() * 18} cy={68 + r() * 16} r={16 + r() * 12} fill={dark} />);
  } else if (motif === 4) {
    // dot grid, radius swelling across the field
    const n = 6;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        s.push(
          <circle
            key={key()}
            cx={(x + 0.5) * (100 / n)}
            cy={(y + 0.5) * (100 / n)}
            r={1.6 + ((x + y) / (2 * n)) * 6}
            fill={(x + y) % 2 ? light : dark}
          />,
        );
  } else if (motif === 5) {
    // quarter arcs, stacked
    const q = [
      'M0 100 A100 100 0 0 1 100 0',
      'M0 70 A70 70 0 0 1 70 0',
      'M0 40 A40 40 0 0 1 40 0',
    ];
    const rot = Math.floor(r() * 4) * 90;
    s.push(
      <g key={key()} transform={`rotate(${rot} 50 50)`}>
        {q.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={i % 2 ? light : dark} strokeWidth={11} />
        ))}
      </g>,
    );
  } else if (motif === 6) {
    // diagonal ribbons
    const rot = -30 + r() * 60;
    s.push(
      <g key={key()} transform={`rotate(${rot} 50 50)`}>
        {Array.from({ length: 7 }, (_, i) => (
          <rect
            key={i}
            x={-40 + i * 26}
            y={-60}
            width={9 + (i % 3) * 5}
            height={220}
            fill={i % 2 ? light : dark}
          />
        ))}
      </g>,
    );
  } else {
    // bauhaus blocks: quarter discs dropped into a loose quadrant grid
    const cells = [
      [0, 0],
      [50, 0],
      [0, 50],
      [50, 50],
    ];
    cells.forEach(([cx, cy], i) => {
      const pick = Math.floor(r() * 3);
      const fill = i % 2 ? light : dark;
      if (pick === 0) {
        const corner = Math.floor(r() * 4);
        const rot = corner * 90;
        s.push(
          <path
            key={key()}
            d={`M${cx} ${cy + 50} L${cx} ${cy} L${cx + 50} ${cy} A50 50 0 0 1 ${cx} ${cy + 50} Z`}
            fill={fill}
            transform={`rotate(${rot} ${cx + 25} ${cy + 25})`}
          />,
        );
      } else if (pick === 1) {
        s.push(<circle key={key()} cx={cx + 25} cy={cy + 25} r={14 + r() * 9} fill={fill} />);
      } else {
        s.push(<rect key={key()} x={cx + 8} y={cy + 8} width={34} height={34} fill={fill} />);
      }
    });
  }

  return { gid, cid, c1, c2, c3, shapes: s };
}
