/**
 * The lab manual (left dock): handbook and experiments, the notebook, and the reference
 * sections. Loaded lazily with KaTeX.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { EXPLAINERS, explainerById, type ExplainerId } from '../../content/explainers';
import { REFERENCE } from '../../content/reference';
import { BODIES } from '../../physics/constants';
import { fixed, fmtBeta, sig } from '../../lib/sci';
import { MANUAL, type StepCtx } from '../../lab/manual';
import { PROTOCOLS, PROTOCOL_LIST, cellText, columnUnits, sigmaText, toCsv, type Protocol, type ResultLine } from '../../lab/protocols';
import { EXPERIMENT_IDS, rowsFor, useNotebook, type DataRow, type ExperimentId } from '../../lab/notebook';
import { recordManual } from '../../lab/logger';
import { reticleReading, targetReading } from '../../lab/measure';
import { useUI } from '../../state/ui';
import { openExplainer } from '../explainerActions';
import { Check, Seg, Sym } from '../kit';
import { Plot } from '../plot/Plot';
import { Eq, TeX } from '../TeX';
import { useTicker } from '../useTicker';
import { rich } from '../rich';

// ─── Utilities ───────────────────────────────────────────────────────────────────────────

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function exportCsv(p: Protocol, rows: DataRow[]) {
  const noise = rows.some((r) => r.s);
  download(
    `lightspeed-exp${p.no}-${slug(p.title)}.csv`,
    toCsv(p, rows, [`exported ${new Date().toISOString()}`, `simulated instrument uncertainty: ${noise ? 'on (u() columns are 1σ)' : 'off'}`]),
    'text/csv',
  );
}

function H({ n, children, right }: { n?: string | number; children: ReactNode; right?: ReactNode }) {
  return (
    <h3 className="man-h">
      {n !== undefined && <span className="n">{n}</span>}
      <span>{children}</span>
      {right && <span className="ml-auto font-sans text-[11px] font-normal normal-case tracking-normal text-fg-3">{right}</span>}
    </h3>
  );
}

const useRows = (exp: ExperimentId) => rowsFor(useNotebook((s) => s.rows), exp);

// ─── Handbook (experiment list) ──────────────────────────────────────────────────────────

const CONVENTIONS: [ReactNode, ReactNode][] = [
  [<b key="s">S</b>, 'Rest frame of the Sun (heliocentric, ecliptic J2000 axes). All trajectories are computed in S.'],
  [<b key="sp">S′</b>, 'Instantaneous rest frame of the observer: what the camera or the ship sees.'],
  [<Sym key="t">t</Sym>, 'Coordinate time in S. Earth clocks read t to within parts in 10⁹.'],
  [<Sym key="tau">τ</Sym>, 'Proper time: what a clock carried by the observer reads.'],
  [<><Sym>β</Sym>, <Sym>γ</Sym>, <Sym>φ</Sym></>, 'v/c; the Lorentz factor 1/√(1 − β²); the rapidity artanh β.'],
  [<><Sym>θ</Sym>, <Sym>θ′</Sym></>, 'Angle of a line of sight from the apex (the direction of motion), measured in S and in S′.'],
  [<Sym key="D">D</Sym>, 'Doppler factor ν_observed/ν_emitted. D > 1 is a blueshift.'],
  ['± σ', 'Standard (1σ) uncertainty. Fits are least squares, weighted by 1/σ² when uncertainties are known.'],
];

function Handbook() {
  const rows = useNotebook((s) => s.rows);
  return (
    <div className="px-4 pb-6 pt-3">
      <div className="cap">Laboratory handbook</div>
      <h2 className="mt-1 font-serif text-[21px] font-medium leading-tight text-fg">Special relativity in the Solar System</h2>
      <div className="prose-lab mt-3">
        <p>
          Five experiments use the simulator as apparatus. Positions come from real ephemerides, distances are true to scale,
          and light travels at <TeX inline>{'c'}</TeX>. Each experiment gives its aim, the background theory with numbered
          equations, the apparatus, a procedure whose steps tick off as you complete them, a data table filled by the
          instruments, and an analysis with least-squares fits.
        </p>
        <p>
          Readings are kept in the notebook in this browser and can be exported as CSV. By default the instruments are ideal.
          Switch on simulated uncertainty to practise error analysis.
        </p>
      </div>

      <H>Experiments</H>
      <ol className="m-0 list-none p-0">
        {PROTOCOL_LIST.map((p) => {
          const n = rowsFor(rows, p.id).length;
          return (
            <li key={p.id} className="border-b border-line">
              <button
                className="group flex w-full items-start gap-3 py-2.5 text-left"
                onClick={() => useUI.setState({ experiment: p.id })}
              >
                <span className="mono mt-0.5 grid h-6 w-6 shrink-0 place-content-center border border-line-3 text-[11px] text-accent group-hover:border-accent">
                  {p.no}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-serif text-[14.5px] leading-snug text-fg group-hover:text-white">{p.title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-fg-3">{p.short}</span>
                </span>
                <span className="mono mt-0.5 shrink-0 text-[10px] text-fg-3">
                  {n > 0 ? `${n} rdg` : MANUAL[p.id].duration}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <H>Notation</H>
      <table className="tbl">
        <tbody>
          {CONVENTIONS.map(([k, v], i) => (
            <tr key={i}>
              <td className="w-16 !align-top !font-serif !text-[13px]">{k}</td>
              <td className="!whitespace-normal !text-left !font-sans !text-[11.5px] !leading-snug !text-fg-2">{rich(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Experiment page ─────────────────────────────────────────────────────────────────────

function Procedure({ exp, rows }: { exp: ExperimentId; rows: DataRow[] }) {
  useTicker(2);
  const ui = useUI();
  const ctx: StepCtx = { rows, ui };
  const steps = MANUAL[exp].procedure;
  const done = steps.map((s) => {
    try {
      return s.done(ctx);
    } catch {
      return false;
    }
  });
  const count = done.filter(Boolean).length;
  return (
    <>
      <H n={4} right={`${count}/${steps.length} complete`}>
        Procedure
      </H>
      <ol className="m-0 list-none space-y-2 p-0">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              className={`mono mt-[3px] grid h-4 w-4 shrink-0 place-content-center border text-[9px] ${
                done[i] ? 'border-ok bg-ok/15 text-ok' : 'border-line-3 text-fg-3'
              }`}
              aria-label={done[i] ? 'done' : 'to do'}
            >
              {done[i] ? '✓' : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`prose-lab !text-[13px] ${done[i] ? '!text-fg-3' : ''}`}>{rich(s.text)}</div>
              {s.action && (
                <button className="btn btn-sm mt-1" onClick={s.action.run} disabled={ui.tripActive && /Planner|Frame/.test(s.action.label)}>
                  {s.action.label}
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

function LiveReading({ exp }: { exp: ExperimentId }) {
  useTicker(8);
  const sel = useUI((s) => s.selected);
  if (exp === 'E3') {
    const r = reticleReading();
    return (
      <div className="mono text-[11px] text-fg-2">
        <span className="text-fg-3">Spectrometer (reticle): </span>
        {r && r.beta >= 1e-3 ? (
          <>
            θ′ = <span className="text-data">{fixed(r.thetaShipDeg, 2)}°</span> · D = <span className="text-data">{sig(r.D, 5)}</span> · β ={' '}
            {fmtBeta(r.beta)}
          </>
        ) : (
          <span className="text-fg-3">no apex (observer at rest)</span>
        )}
      </div>
    );
  }
  const r = sel ? targetReading(sel) : null;
  return (
    <div className="mono text-[11px] text-fg-2">
      <span className="text-fg-3">Goniometer{sel ? ` (${BODIES[sel].name})` : ''}: </span>
      {!sel ? (
        <span className="text-fg-3">select a target</span>
      ) : r && r.beta >= 1e-3 ? (
        <>
          θ = {fixed(r.thetaDeg, 3)}° · θ′ = <span className="text-data">{fixed(r.thetaShipDeg, 3)}°</span>
        </>
      ) : (
        <span className="text-fg-3">no apex (observer at rest)</span>
      )}
    </div>
  );
}

function DataTable({ p, rows }: { p: Protocol; rows: DataRow[] }) {
  const cols = p.columns.filter((c) => !c.hidden);
  const units = columnUnits(p.columns, rows);
  const remove = useNotebook((s) => s.remove);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = rows.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  if (!rows.length)
    return <div className="border border-dashed border-line-2 px-3 py-4 text-center text-[11.5px] text-fg-3">No readings yet.</div>;
  return (
    <div ref={scroller} className="scroll max-h-[280px] overflow-x-auto border border-line-2">
      <table className="tbl tbl-dense">
        <thead>
          <tr>
            <th className="!text-left">#</th>
            {cols.map((c) => (
              <th key={c.key} title={c.name} className={`${c.derived ? 'derived' : ''} ${c.text ? '!text-left' : ''}`}>
                <span className={c.text ? '' : 'sym !text-[12.5px] text-fg-2'}>{c.sym}</span>
                {units[c.key]?.sym && <span className="ml-1 text-fg-4">/ {units[c.key].sym}</span>}
              </th>
            ))}
            <th aria-label="Delete" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`group ${r.id === lastId ? 'row-new' : ''}`}>
              <td className="text-fg-3">{r.n}</td>
              {cols.map((c) => {
                const s = sigmaText(c, r, units[c.key]);
                return (
                  <td key={c.key} className={`${c.derived ? 'derived' : ''} ${c.text ? '!text-left !font-sans' : ''}`}>
                    {rich(cellText(c, r, units[c.key]))}
                    {s && <div className="text-[9.5px] leading-none text-fg-4">± {rich(s)}</div>}
                  </td>
                );
              })}
              <td className="!px-1">
                <button
                  className="invisible px-1 text-fg-4 hover:text-hazard group-hover:visible"
                  onClick={() => remove(r.id)}
                  title="Delete this reading"
                  aria-label={`Delete reading ${r.n}`}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Results({ lines }: { lines: ResultLine[] }) {
  return (
    <table className="tbl mt-2">
      <tbody>
        {lines.map((l, i) => (
          <tr key={i}>
            <td className="!whitespace-normal !font-sans !text-[11.5px] !leading-snug !text-fg-2">{l.label}</td>
            <td
              className={`${l.tone === 'ok' ? '!text-ok' : l.tone === 'warn' ? '!text-accent' : l.tone === 'dim' ? '!text-fg-3' : '!text-fg'}`}
            >
              {rich(l.value)}
            </td>
            <td className="w-10 !text-left text-fg-3">{rich(l.unit ?? '')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Analysis({ p, rows }: { p: Protocol; rows: DataRow[] }) {
  const a = useMemo(() => p.analyse(rows), [p, rows]);
  const [view, setView] = useState<'raw' | 'lin'>('raw');
  const spec = view === 'lin' && a.lin ? a.lin : a.raw;
  return (
    <>
      {a.lin && (
        <Seg
          className="mb-2"
          label="Figure"
          value={view}
          onChange={setView}
          options={[
            { value: 'raw', label: `Fig. ${p.no}.1` },
            { value: 'lin', label: `Fig. ${p.no}.2 · ${a.linLabel ?? 'Linearised'}` },
          ]}
        />
      )}
      <Plot
        x={spec.x}
        y={spec.y}
        series={spec.series}
        height={240}
        equal={spec.equal}
        caption={spec.caption}
        empty="no readings"
      />
      <Results lines={a.results} />
    </>
  );
}

function ExperimentPage({ exp }: { exp: ExperimentId }) {
  const p = PROTOCOLS[exp];
  const m = MANUAL[exp];
  const rows = useRows(exp);
  const { noise, setNoise, clear } = useNotebook(useShallow((s) => ({ noise: s.noise, setNoise: s.setNoise, clear: s.clear })));
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scroller.current?.parentElement?.scrollTo({ top: 0 });
  }, [exp]);
  const i = EXPERIMENT_IDS.indexOf(exp);
  const go = (d: number) => useUI.setState({ experiment: EXPERIMENT_IDS[(i + d + EXPERIMENT_IDS.length) % EXPERIMENT_IDS.length] });

  return (
    <div ref={scroller} className="px-4 pb-8 pt-2">
      <div className="flex items-center gap-1">
        <button className="btn btn-q btn-sm -ml-1.5" onClick={() => useUI.setState({ experiment: null })}>
          ← Handbook
        </button>
        <span className="ml-auto" />
        <button className="btn btn-q btn-sm" onClick={() => go(-1)} aria-label="Previous experiment">
          ‹
        </button>
        <button className="btn btn-q btn-sm" onClick={() => go(1)} aria-label="Next experiment">
          ›
        </button>
      </div>
      <div className="cap mt-2">Experiment {p.no}</div>
      <h2 className="mt-1 font-serif text-[21px] font-medium leading-tight text-fg">{p.title}</h2>
      <div className="mono mt-1.5 text-[10.5px] text-fg-3">
        ~{m.duration} · {p.manual ? 'manual readings (R)' : 'automatic logging'} · {rows.length} reading{rows.length === 1 ? '' : 's'}
      </div>

      <H n={1}>Aim</H>
      <div className="prose-lab">{m.aim}</div>

      <H n={2}>Background</H>
      <div className="prose-lab">{m.background}</div>

      <H n={3}>Apparatus</H>
      <div className="prose-lab !text-[13px]">
        <ul>
          {m.apparatus.map((a, k) => (
            <li key={k}>{rich(a)}</li>
          ))}
        </ul>
      </div>

      <Procedure exp={exp} rows={rows} />

      <H n={5} right={`${rows.length} reading${rows.length === 1 ? '' : 's'}`}>
        Observations
      </H>
      {p.manual && (
        <div className="mb-2 flex items-center justify-between gap-2 border border-line-2 bg-well px-2.5 py-1.5">
          <LiveReading exp={exp} />
          <button className="btn btn-pri btn-sm shrink-0" onClick={recordManual} title="Record a reading (R)">
            Record <span className="mono text-[9.5px] opacity-70">R</span>
          </button>
        </div>
      )}
      <DataTable p={p} rows={rows} />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <div className="-ml-2.5 flex-1">
          <Check checked={noise} onChange={setNoise} hint="Gaussian noise of the stated σ on new readings">
            Simulated instrument uncertainty
          </Check>
        </div>
        <button className="btn btn-sm" disabled={!rows.length} onClick={() => exportCsv(p, rows)}>
          CSV
        </button>
        <button
          className="btn btn-sm"
          disabled={!rows.length}
          onClick={() => {
            if (window.confirm(`Delete all ${rows.length} readings of Experiment ${p.no}?`)) clear(exp);
          }}
        >
          Clear
        </button>
      </div>

      <H n={6}>Analysis</H>
      <Analysis p={p} rows={rows} />

      <H n={7}>Questions</H>
      <div className="prose-lab !text-[13px]">
        <ol>
          {m.questions.map((q, k) => (
            <li key={k}>{q}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Notebook tab ────────────────────────────────────────────────────────────────────────

function NotebookTab() {
  const { rows, noise, setNoise, clear } = useNotebook(useShallow((s) => ({ rows: s.rows, noise: s.noise, setNoise: s.setNoise, clear: s.clear })));
  return (
    <div className="px-4 pb-6 pt-3">
      <div className="cap">Notebook</div>
      <p className="mt-2 text-[12px] leading-relaxed text-fg-2">
        Every reading is stored in this browser and survives a reload. Values are kept in base units (s, km, km/s, °); the
        export carries them the same way, with 1σ columns when simulated uncertainty was on.
      </p>
      <div className="-mx-2.5 mt-1">
        <Check checked={noise} onChange={setNoise} hint="Applies to new readings only">
          Simulated instrument uncertainty
        </Check>
      </div>
      <table className="tbl mt-3">
        <thead>
          <tr>
            <th>Experiment</th>
            <th>Readings</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {PROTOCOL_LIST.map((p) => {
            const rs = rowsFor(rows, p.id);
            return (
              <tr key={p.id}>
                <td className="!whitespace-normal !font-sans !text-[12px]">
                  <span className="mono mr-1.5 text-accent">{p.no}</span>
                  {p.title}
                </td>
                <td>{rs.length}</td>
                <td className="whitespace-nowrap">
                  <button className="btn btn-q btn-sm" onClick={() => useUI.setState({ manualTab: 'experiments', experiment: p.id })}>
                    Open
                  </button>
                  <button className="btn btn-q btn-sm" disabled={!rs.length} onClick={() => exportCsv(p, rs)}>
                    CSV
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 flex gap-1.5">
        <button
          className="btn btn-sm"
          disabled={!rows.length}
          onClick={() => download(`lightspeed-notebook-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ rows }, null, 1), 'application/json')}
        >
          Export all (JSON)
        </button>
        <button
          className="btn btn-sm btn-hazard"
          disabled={!rows.length}
          onClick={() => {
            if (window.confirm(`Delete all ${rows.length} readings from the notebook?`)) clear();
          }}
        >
          Clear notebook
        </button>
      </div>
    </div>
  );
}

// ─── Reference tab ───────────────────────────────────────────────────────────────────────

function ReferenceTab() {
  const topic = useUI((s) => s.refTopic);
  const e = explainerById(topic);
  const r = REFERENCE[topic];
  const i = EXPLAINERS.findIndex((x) => x.id === topic);
  const go = (d: number) => openExplainer(EXPLAINERS[(i + d + EXPLAINERS.length) % EXPLAINERS.length].id);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => {
    top.current?.parentElement?.scrollTo({ top: 0 });
  }, [topic]);
  return (
    <div ref={top} className="px-4 pb-8 pt-3">
      <div className="flex items-center gap-1">
        <select
          className="fld min-w-0 flex-1"
          value={topic}
          onChange={(ev) => openExplainer(ev.target.value as ExplainerId)}
          aria-label="Reference section"
        >
          {EXPLAINERS.map((x, k) => (
            <option key={x.id} value={x.id}>
              §{k + 1} {x.title}
            </option>
          ))}
        </select>
        <button className="btn btn-q btn-sm" onClick={() => go(-1)} aria-label="Previous section">
          ‹
        </button>
        <button className="btn btn-q btn-sm" onClick={() => go(1)} aria-label="Next section">
          ›
        </button>
      </div>
      <div className="cap mt-4">Reference §{i + 1}</div>
      <h2 className="mt-1 font-serif text-[20px] font-medium leading-tight text-fg">{e.title}</h2>
      <div className="prose-lab mt-3">
        <Eq n={`R${i + 1}`} tex={r.equation} />
        {r.body}
      </div>
      {r.note && (
        <div className="note note-caution">
          <span className="note-t">In the simulator</span>
          {r.note}
        </div>
      )}
      {r.reading && (
        <>
          <H>Further reading</H>
          <ul className="m-0 list-none space-y-1 p-0">
            {r.reading.map((x) => (
              <li key={x} className="font-serif text-[12.5px] leading-snug text-fg-2">
                {x}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────────────────

export default function LabManual() {
  const tab = useUI((s) => s.manualTab);
  const exp = useUI((s) => s.experiment);
  return tab === 'notebook' ? <NotebookTab /> : tab === 'reference' ? <ReferenceTab /> : exp ? <ExperimentPage exp={exp} /> : <Handbook />;
}
