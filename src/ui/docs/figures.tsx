/**
 * Figures for the manual, drawn as SVG in the laboratory's colours (CSS variables, so they
 * re-ink for print).
 */
import type { ReactNode } from 'react';

const C = {
  bg: 'var(--color-bg)',
  panel: 'var(--color-panel)',
  panel2: 'var(--color-panel-2)',
  line: 'var(--color-line)',
  line2: 'var(--color-line-2)',
  line3: 'var(--color-line-3)',
  fg: 'var(--color-fg)',
  fg2: 'var(--color-fg-2)',
  fg3: 'var(--color-fg-3)',
  accent: 'var(--color-accent)',
  data: 'var(--color-data)',
  view: 'var(--doc-fig-view, #000)',
};
const MONO = 'var(--font-mono)';
const SANS = 'var(--font-sans)';

const T = ({ x, y, children, size = 9, fill = C.fg2, anchor = 'start', mono = true, weight, spacing }: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  fill?: string;
  anchor?: 'start' | 'middle' | 'end';
  mono?: boolean;
  weight?: number;
  spacing?: number;
}) => (
  <text x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontFamily={mono ? MONO : SANS} fontWeight={weight} letterSpacing={spacing}>
    {children}
  </text>
);

/** A grey bar standing in for a line of text. */
const Bar = ({ x, y, w, h = 3, fill = C.line3 }: { x: number; y: number; w: number; h?: number; fill?: string }) => (
  <rect x={x} y={y} width={w} height={h} fill={fill} />
);

// Deterministic "stars" for the view.
const STARS = Array.from({ length: 70 }, (_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 12345.6789;
  return { x: 172 + (a - Math.floor(a)) * 376, y: 30 + (b - Math.floor(b)) * 360, r: 0.4 + ((i * 7) % 5) * 0.18 };
});

const CALLOUTS: { n: number; cx: number; cy: number; x: number; y: number }[] = [
  { n: 1, cx: 26, cy: -24, x: 26, y: 6 },
  { n: 2, cx: 250, cy: -24, x: 250, y: 10 },
  { n: 3, cx: 465, cy: -24, x: 465, y: 6 },
  { n: 4, cx: 578, cy: -24, x: 578, y: 10 },
  { n: 5, cx: 677, cy: -24, x: 677, y: 6 },
  { n: 6, cx: -28, cy: 220, x: 0, y: 220 },
  { n: 7, cx: 528, cy: 64, x: 528, y: 64 },
  { n: 8, cx: 748, cy: 220, x: 720, y: 220 },
  { n: 9, cx: 86, cy: 448, x: 86, y: 420 },
  { n: 10, cx: 390, cy: 448, x: 390, y: 420 },
  { n: 11, cx: 676, cy: 448, x: 676, y: 420 },
];

/** Fig. 3.1: the screen, with numbered parts. */
export function ScreenMap() {
  const orbit = (rx: number, ry: number, deg: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: 360 + rx * Math.cos(a), y: 212 + ry * Math.sin(a) };
  };
  const earth = orbit(80, 32, 30);
  const mars = orbit(116, 46, 200);
  const jup = orbit(172, 68, 118);
  const targets = ['Sun', 'Mercury', 'Venus', 'Earth', 'Moon', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
  let tx = 246;
  return (
    <svg viewBox="-48 -44 816 510" className="block h-auto w-full" role="img" aria-label="Diagram of the Lightspeed screen with eleven numbered parts">
      <defs>
        <clipPath id="sm-view">
          <rect x="170" y="28" width="380" height="364" />
        </clipPath>
      </defs>
      <rect x="0" y="0" width="720" height="420" fill={C.bg} stroke={C.line3} />

      {/* Header */}
      <rect x="0" y="0" width="720" height="28" fill={C.panel} />
      <line x1="0" y1="28" x2="720" y2="28" stroke={C.line2} />
      <rect x="6" y="6" width="40" height="16" fill="none" stroke={C.accent} strokeOpacity="0.6" />
      <T x={26} y={17.5} anchor="middle" size={9} fill={C.accent} mono={false}>
        Lab
      </T>
      {/* the mark, 9 units across */}
      <g transform="translate(53.4 8.4) scale(0.16)">
        <g fill="none" stroke={C.fg} strokeWidth="8">
          <circle cx="32" cy="32" r="24" />
          <circle cx="44" cy="32" r="12" />
        </g>
        <circle cx="52" cy="32" r="8" fill={C.accent} />
      </g>
      <T x={66} y={17.5} size={9} fill={C.fg} weight={600} spacing={1.6}>
        LIGHTSPEED
      </T>
      <line x1="170" y1="8" x2="170" y2="20" stroke={C.line2} />
      <T x={180} y={17.5} size={7.5} fill={C.fg3} spacing={1}>
        EPOCH
      </T>
      <T x={212} y={17.5} size={8.5} fill={C.fg}>
        2026-09-24 12:00:00 UTC
      </T>
      <rect x="430" y="6" width="70" height="16" fill={C.accent} />
      <T x={465} y={17.5} anchor="middle" size={9} fill="#1b1204" weight={600} mono={false}>
        Plan flight
      </T>
      <line x1="508" y1="8" x2="508" y2="20" stroke={C.line2} />
      <T x={516} y={17.5} size={9} fill={C.fg2} mono={false}>
        View ▾
      </T>
      <T x={556} y={17.5} size={9} fill={C.fg2} mono={false}>
        Manual
      </T>
      <T x={598} y={17.5} size={9} fill={C.fg2} mono={false}>
        About
      </T>
      <rect x="638" y="6" width="76" height="16" fill="none" stroke={C.accent} strokeOpacity="0.6" />
      <T x={676} y={17.5} anchor="middle" size={9} fill={C.accent} mono={false}>
        Instruments
      </T>

      {/* Lab panel */}
      <rect x="0" y="28" width="170" height="364" fill={C.panel} />
      <line x1="170" y1="28" x2="170" y2="392" stroke={C.line2} />
      <T x={8} y={40} size={7} fill={C.fg3} spacing={1}>
        LAB
      </T>
      <rect x="0" y="45" width="170" height="15" fill={C.panel2} />
      <rect x="0" y="45" width="56" height="15" fill={C.panel} />
      <line x1="0" y1="45.5" x2="56" y2="45.5" stroke={C.accent} strokeWidth="1.5" />
      <T x={8} y={55.5} size={7.5} fill={C.fg} mono={false}>
        Experiments
      </T>
      <T x={64} y={55.5} size={7.5} fill={C.fg3} mono={false}>
        Notebook
      </T>
      <T x={112} y={55.5} size={7.5} fill={C.fg3} mono={false}>
        Reference
      </T>
      <T x={8} y={76} size={6.5} fill={C.fg3} spacing={1}>
        LABORATORY HANDBOOK
      </T>
      <Bar x={8} y={82} w={128} h={6} fill={C.fg} />
      <Bar x={8} y={92} w={96} h={6} fill={C.fg} />
      {[104, 111, 118, 125].map((y, i) => (
        <Bar key={y} x={8} y={y} w={[152, 146, 150, 92][i]} />
      ))}
      <T x={8} y={146} size={6.5} fill={C.fg3} spacing={1}>
        EXPERIMENTS
      </T>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 154 + i * 30;
        return (
          <g key={i}>
            <rect x="8" y={y} width="13" height="13" fill="none" stroke={C.line3} />
            <T x={14.5} y={y + 9.5} anchor="middle" size={7.5} fill={C.accent}>
              {i + 1}
            </T>
            <Bar x={28} y={y + 1} w={[104, 96, 110, 78, 112][i]} h={4} fill={C.fg2} />
            <Bar x={28} y={y + 9} w={[124, 118, 128, 120, 106][i]} />
            <line x1="8" y1={y + 22} x2="162" y2={y + 22} stroke={C.line} />
          </g>
        );
      })}

      {/* View */}
      <rect x="170" y="28" width="380" height="364" fill={C.view} />
      <g clipPath="url(#sm-view)">
        {STARS.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#cfd6de" opacity="0.7" />
        ))}
        {[
          [34, 14],
          [52, 21],
          [80, 32],
          [116, 46],
          [172, 68],
        ].map(([rx, ry]) => (
          <ellipse key={rx} cx="360" cy="212" rx={rx} ry={ry} fill="none" stroke="#d8dde3" strokeOpacity="0.2" />
        ))}
        <circle cx="360" cy="212" r="3.2" fill={C.accent} />
        <T x={366} y={209} size={8} fill="#d8dde3" mono={false}>
          Sun
        </T>
        {[
          { p: earth, name: 'Earth', sel: true },
          { p: mars, name: 'Mars' },
          { p: jup, name: 'Jupiter' },
        ].map(({ p, name, sel }) => (
          <g key={name}>
            {sel ? (
              <path
                d={`M${p.x - 7} ${p.y - 3}v-4h4M${p.x + 3} ${p.y - 7}h4v4M${p.x + 7} ${p.y + 3}v4h-4M${p.x - 3} ${p.y + 7}h-4v-4`}
                fill="none"
                stroke={C.accent}
              />
            ) : (
              <circle cx={p.x} cy={p.y} r="3.4" fill="none" stroke="#d8dde3" strokeOpacity="0.6" />
            )}
            <T x={p.x + 10} y={p.y + 3} size={8} fill={sel ? C.accent : '#d8dde3'} mono={false}>
              {name}
            </T>
          </g>
        ))}
        <T x={180} y={42} size={6.5} fill={C.fg3}>
          VIEW
        </T>
        <T x={204} y={42} size={6.5} fill={C.fg2}>
          ORBIT · SUN
        </T>
        <T x={180} y={51} size={6.5} fill={C.fg3}>
          RANGE
        </T>
        <T x={204} y={51} size={6.5} fill={C.fg2}>
          13.0 au
        </T>
        <rect x="334" y="35" width="52" height="12" fill="rgba(28,19,5,0.9)" stroke={C.accent} strokeOpacity="0.6" />
        <rect x="339" y="39.5" width="3" height="3" fill={C.accent} />
        <T x={346} y={44} size={6.5} fill={C.accent} weight={600} spacing={0.8}>
          RATE 10
        </T>
        <T x={375.5} y={41} size={5} fill={C.accent} weight={600}>
          2
        </T>
        <line x1="180" y1="380" x2="244" y2="380" stroke={C.fg2} />
        <line x1="180" y1="377" x2="180" y2="380" stroke={C.fg2} />
        <line x1="244" y1="377" x2="244" y2="380" stroke={C.fg2} />
        <T x={180} y={389} size={6.5} fill={C.fg2}>
          2 au at Sun
        </T>
      </g>

      {/* Instruments panel */}
      <rect x="550" y="28" width="170" height="364" fill={C.panel} />
      <line x1="550" y1="28" x2="550" y2="392" stroke={C.line2} />
      <T x={558} y={40} size={7} fill={C.fg3} spacing={1}>
        INSTRUMENTS
      </T>
      {[
        { y: 46, id: 'A', title: 'OBSERVER', rows: 7 },
        { y: 142, id: 'B', title: 'CHRONOMETERS', rows: 4 },
        { y: 204, id: 'C', title: 'TARGET', rows: 6 },
        { y: 290, id: 'D', title: 'RELATIVISTIC OPTICS', rows: 6 },
      ].map((sec) => (
        <g key={sec.id}>
          <rect x="550" y={sec.y} width="170" height="13" fill={C.panel2} />
          <line x1="550" y1={sec.y} x2="720" y2={sec.y} stroke={C.line2} />
          <T x={558} y={sec.y + 9.5} size={7} fill={C.accent}>
            {sec.id}
          </T>
          <T x={570} y={sec.y + 9.5} size={6.5} fill={C.fg2} spacing={0.8}>
            {sec.title}
          </T>
          {Array.from({ length: sec.rows }, (_, i) => (
            <g key={i}>
              <Bar x={558} y={sec.y + 19 + i * 11} w={[58, 72, 48, 66, 54, 70, 44][i % 7]} />
              <Bar x={682 - [26, 34, 22, 30][i % 4]} y={sec.y + 19 + i * 11} w={[26, 34, 22, 30][i % 4]} fill={i % 3 === 1 ? C.data : C.fg2} />
              <Bar x={688} y={sec.y + 19 + i * 11} w={14} fill={C.line2} />
            </g>
          ))}
        </g>
      ))}

      {/* Footer */}
      <rect x="0" y="392" width="720" height="28" fill={C.panel} />
      <line x1="0" y1="392" x2="720" y2="392" stroke={C.line2} />
      <rect x="6" y="398" width="16" height="16" fill="none" stroke={C.line2} />
      <rect x="11" y="402" width="2" height="8" fill={C.fg} />
      <rect x="15" y="402" width="2" height="8" fill={C.fg} />
      <T x={28} y={409} size={6.5} fill={C.fg3} spacing={1}>
        RATE
      </T>
      <rect x="50" y="399" width="112" height="14" fill="none" stroke={C.line2} />
      {Array.from({ length: 7 }, (_, i) => (
        <g key={i}>
          {i > 0 && <line x1={50 + i * 16} y1="399" x2={50 + i * 16} y2="413" stroke={C.line2} />}
          {i === 2 && <line x1={50 + i * 16 + 1} y1="412" x2={50 + i * 16 + 15} y2="412" stroke={C.accent} strokeWidth="2" />}
          <text x={50 + i * 16 + 7} y={409} fontSize="6" textAnchor="middle" fontFamily={MONO} fill={i === 2 ? C.accent : C.fg3}>
            10
            <tspan dy="-2.6" fontSize="4.2">
              {i}
            </tspan>
          </text>
        </g>
      ))}
      <rect x="168" y="399" width="26" height="14" fill="none" stroke={C.line2} />
      <T x={181} y={409} size={7} anchor="middle" fill={C.fg} mono={false}>
        Now
      </T>
      <line x1="202" y1="400" x2="202" y2="412" stroke={C.line2} />
      <T x={210} y={409} size={6.5} fill={C.fg3} spacing={1}>
        TARGET
      </T>
      {targets.map((name) => {
        const x = tx;
        tx += name.length * 4.6 + 10;
        return (
          <T key={name} x={x} y={409} size={7.5} fill={name === 'Earth' ? C.accent : C.fg2} mono={false}>
            {name}
          </T>
        );
      })}
      <T x={714} y={409} size={6.5} anchor="end" fill={C.fg2} spacing={0.6}>
        ORBIT · SUN
      </T>

      {/* Callouts */}
      {CALLOUTS.map((c) => (
        <g key={c.n}>
          {(c.cx !== c.x || c.cy !== c.y) && <line x1={c.cx} y1={c.cy} x2={c.x} y2={c.y} stroke={C.accent} strokeWidth="1" />}
          {(c.cx !== c.x || c.cy !== c.y) && <circle cx={c.x} cy={c.y} r="1.8" fill={C.accent} />}
          <circle cx={c.cx} cy={c.cy} r="10" fill={C.accent} />
          <text x={c.cx} y={c.cy + 3.6} fontSize="10.5" fontWeight="700" fontFamily={MONO} textAnchor="middle" fill="#1b1204">
            {c.n}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Aberration ──────────────────────────────────────────────────────────────────────────

function mix(a: [number, number, number], b: [number, number, number], t: number) {
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
}
const WHITE: [number, number, number] = [216, 221, 227];
const BLUE: [number, number, number] = [134, 182, 255];
const RED: [number, number, number] = [255, 128, 110];

/** Fig. 6.1: a ring of evenly spaced stars at rest and seen from a ship at β. */
export function AberrationFigure({ beta = 0.9 }: { beta?: number }) {
  const R = 104;
  const N = 24;
  const g = 1 / Math.sqrt(1 - beta * beta);
  const kmax = Math.log(Math.sqrt((1 + beta) / (1 - beta)));
  const ring = (cx: number, moving: boolean) =>
    Array.from({ length: N }, (_, i) => {
      const phi = ((i + 0.5) / N) * 2 * Math.PI; // angle from the apex, clockwise
      const th = phi <= Math.PI ? phi : 2 * Math.PI - phi;
      const side = phi <= Math.PI ? 1 : -1;
      const thp = moving ? Math.acos((Math.cos(th) + beta) / (1 + beta * Math.cos(th))) : th;
      const D = moving ? 1 / (g * (1 - beta * Math.cos(thp))) : 1;
      const t = Math.max(-1, Math.min(1, Math.log(D) / kmax));
      const color = t >= 0 ? mix(WHITE, BLUE, t) : mix(WHITE, RED, -t);
      const r = Math.max(1.1, Math.min(4.2, 2.1 * D ** 0.4));
      return { x: cx + side * R * Math.sin(thp), y: 150 - R * Math.cos(thp), color, r, key: i };
    });
  const cone = Math.acos(beta);
  const panel = (cx: number, moving: boolean, title: string) => (
    <g>
      <circle cx={cx} cy={150} r={R} fill="none" stroke={C.line2} />
      <line x1={cx} y1={150 - R - 14} x2={cx} y2={150 + R + 6} stroke={C.line} strokeDasharray="2 3" />
      {moving && (
        <g>
          {[1, -1].map((s) => (
            <line
              key={s}
              x1={cx}
              y1={150}
              x2={cx + s * (R + 18) * Math.sin(cone)}
              y2={150 - (R + 18) * Math.cos(cone)}
              stroke={C.accent}
              strokeOpacity="0.6"
              strokeDasharray="3 3"
            />
          ))}
          <path
            d={`M${cx} ${150 - 34} A34 34 0 0 1 ${cx + 34 * Math.sin(cone)} ${150 - 34 * Math.cos(cone)}`}
            fill="none"
            stroke={C.accent}
            strokeOpacity="0.8"
          />
          <text x={cx + 40 * Math.sin(cone / 2) + 4} y={150 - 40 * Math.cos(cone / 2)} fontSize="9.5" fontFamily={MONO} fill={C.accent}>
            {((cone * 180) / Math.PI).toFixed(1)}°
          </text>
        </g>
      )}
      {ring(cx, moving).map((p) => (
        <circle key={p.key} cx={p.x} cy={p.y} r={p.r} fill={p.color} />
      ))}
      <path d={`M${cx} 150 m-5 0 h10 M${cx} 150 m0 -5 v10`} stroke={C.fg2} />
      <path d={`M${cx - 5} ${150 - R - 16} L${cx} ${150 - R - 26} L${cx + 5} ${150 - R - 16}`} fill="none" stroke={C.accent} strokeWidth="1.3" />
      <text x={cx + 9} y={150 - R - 18} fontSize="9" fontFamily={MONO} fill={C.accent} letterSpacing="1">
        APEX
      </text>
      <text x={cx} y={284} fontSize="11" fontFamily={SANS} textAnchor="middle" fill={C.fg}>
        {title}
      </text>
    </g>
  );
  return (
    <svg viewBox="0 0 640 296" className="block h-auto w-full" role="img" aria-label={`Aberration of starlight at rest and at beta ${beta}`}>
      {panel(165, false, 'At rest')}
      {panel(475, true, `Moving at β = ${beta}`)}
    </svg>
  );
}

// ─── Experiment workflow ─────────────────────────────────────────────────────────────────

const FLOW: [string, string][] = [
  ['Procedure', 'Steps tick off by themselves as you complete them'],
  ['Observations', 'The data table fills as the instruments record'],
  ['Analysis', 'Figures and least-squares fits update as data arrive'],
  ['Questions', 'Answer in the boxes; your text is saved as you type'],
  ['Report', 'A printable A4 document with everything'],
];

/** Fig. 7.1: the stages of an experiment. */
export function WorkflowFigure() {
  return (
    <ol className="doc-flow">
      {FLOW.map(([t, d], i) => (
        <li key={t}>
          <span className="doc-flow-n">{i + 1}</span>
          <b>{t}</b>
          <span>{d}</span>
        </li>
      ))}
    </ol>
  );
}
