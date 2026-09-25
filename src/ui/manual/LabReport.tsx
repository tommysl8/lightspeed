/**
 * Lab report: a printable write-up of one experiment (aim, theory, method, data, figures,
 * fitted results, answers, conclusion), laid out as an A4 page. "Print / Save as PDF" uses
 * the browser's print dialog; the print stylesheet hides everything else.
 */
import { useMemo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { MANUAL } from '../../lab/manual';
import { PROTOCOLS, cellText, columnUnits, sigmaText } from '../../lab/protocols';
import { rowsFor, useNotebook, type ExperimentId } from '../../lab/notebook';
import { useUI } from '../../state/ui';
import { Plot } from '../plot/Plot';
import { rich } from '../rich';
import { useModal } from '../useModal';

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="report-section mt-6">
      <h2 className="mb-2 border-b border-[#bbb] pb-1 font-sans text-[13px] font-semibold uppercase tracking-[0.08em] text-[#111]">
        {n}. {title}
      </h2>
      {children}
    </section>
  );
}

function fmtDate(ms: number) {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

export default function LabReport({ exp }: { exp: ExperimentId }) {
  const p = PROTOCOLS[exp];
  const m = MANUAL[exp];
  const { allRows, answers, student, setStudent } = useNotebook(
    useShallow((s) => ({ allRows: s.rows, answers: s.answers, student: s.student, setStudent: s.setStudent })),
  );
  const rows = useMemo(() => rowsFor(allRows, exp), [allRows, exp]);
  const a = useMemo(() => p.analyse(rows), [p, rows]);
  const cols = p.columns.filter((c) => !c.hidden);
  const units = columnUnits(p.columns, rows);
  const noise = rows.some((r) => r.s);
  const close = () => useUI.setState({ reportFor: null });
  const ref = useModal<HTMLDivElement>(close);

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const first = rows.length ? Math.min(...rows.map((r) => r.simMs)) : NaN;
  const last = rows.length ? Math.max(...rows.map((r) => r.simMs)) : NaN;

  return createPortal(
    <div
      ref={ref}
      className="report-overlay fixed inset-0 z-[100] overflow-y-auto bg-black/80"
      role="dialog"
      aria-modal="true"
      aria-label={`Lab report, Experiment ${p.no}`}
    >
      <div className="report-toolbar sticky top-0 z-10 flex items-center gap-2 border-b border-line-2 bg-panel px-4 py-2">
        <span className="cap !text-fg-2">Lab report · print preview</span>
        <span className="text-[11.5px] text-fg-3 max-md:hidden">Answers and the conclusion are written on the experiment page, and saved as you type.</span>
        <span className="ml-auto" />
        <button className="btn btn-pri" onClick={() => window.print()} data-autofocus>
          Print / Save as PDF
        </button>
        <button className="btn" onClick={close}>
          Close
        </button>
      </div>

      <article className="report-paper mx-auto my-6 w-[794px] max-w-[calc(100vw-24px)] bg-white px-[64px] py-[56px] text-[#111] shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
        <header className="flex items-baseline justify-between border-b-2 border-[#111] pb-2">
          <span className="font-mono text-[11px] font-semibold tracking-[0.2em]">LIGHTSPEED VIRTUAL LABORATORY</span>
          <span className="font-sans text-[11px] uppercase tracking-[0.1em] text-[#555]">Laboratory report</span>
        </header>
        <h1 className="mb-0 mt-4 font-serif text-[26px] font-semibold leading-tight">
          Experiment {p.no}: {p.title}
        </h1>

        <table className="mt-4 w-full text-[12.5px]">
          <tbody className="[&_td]:border-b [&_td]:border-[#ddd] [&_td]:py-1 [&_td]:align-top">
            <tr>
              <td className="w-40 font-sans text-[#555]">Name(s)</td>
              <td>
                <input
                  className="w-full border-0 border-b border-dashed border-[#999] bg-transparent font-serif text-[14px] text-[#111] outline-none focus:border-[#b35c00] print:hidden"
                  value={student}
                  placeholder="Enter your name"
                  aria-label="Name(s) on the report"
                  onChange={(e) => setStudent(e.target.value)}
                />
                <span className="hidden font-serif text-[14px] print:inline">{student || '—'}</span>
              </td>
            </tr>
            <tr>
              <td className="font-sans text-[#555]">Date</td>
              <td className="font-serif text-[14px]">{today}</td>
            </tr>
            <tr>
              <td className="font-sans text-[#555]">Readings</td>
              <td className="font-serif text-[14px]">
                {rows.length}
                {rows.length > 0 && (
                  <span className="text-[#555]">
                    {' '}
                    (simulation time {fmtDate(first)}
                    {last !== first ? ` to ${fmtDate(last)}` : ''})
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td className="font-sans text-[#555]">Instruments</td>
              <td className="font-serif text-[14px]">{noise ? 'Simulated instrument uncertainty (1σ values given)' : 'Ideal (no simulated uncertainty)'}</td>
            </tr>
          </tbody>
        </table>

        <Section n={1} title="Aim">
          <div className="prose-lab">{m.aim}</div>
        </Section>

        <Section n={2} title="Theory">
          <div className="prose-lab">{m.background}</div>
        </Section>

        <Section n={3} title="Method">
          <div className="prose-lab">
            <p>Apparatus:</p>
            <ul>
              {m.apparatus.map((x, k) => (
                <li key={k}>{rich(x)}</li>
              ))}
            </ul>
            <p>Procedure:</p>
            <ol>
              {m.procedure.map((s, k) => (
                <li key={k}>{rich(s.text)}</li>
              ))}
            </ol>
          </div>
        </Section>

        <Section n={4} title="Results">
          {rows.length === 0 ? (
            <p className="font-serif text-[14px] italic text-[#555]">No readings were recorded.</p>
          ) : (
            <>
              <p className="mb-2 font-serif text-[13px] text-[#333]">
                Table {p.no}.1: readings{noise ? '; each value is followed by its standard uncertainty' : ''}. Derived columns in grey.
              </p>
              <table className="tbl tbl-dense report-table">
                <thead>
                  <tr>
                    <th className="!text-left">#</th>
                    {cols.map((c) => (
                      <th key={c.key} className={`${c.derived ? 'derived' : ''} ${c.text ? '!text-left' : ''}`}>
                        <span className={c.text ? '' : 'sym !text-[12.5px]'}>{c.sym}</span>
                        {units[c.key]?.sym && <span className="ml-1">/ {units[c.key].sym}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.n}</td>
                      {cols.map((c) => {
                        const sg = sigmaText(c, r, units[c.key]);
                        return (
                          <td key={c.key} className={`${c.derived ? 'derived' : ''} ${c.text ? '!text-left !font-sans' : ''}`}>
                            {rich(cellText(c, r, units[c.key]))}
                            {sg && <span className="ml-1 text-[9px] text-[#666]">±{rich(sg)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="report-section mt-5">
                <Plot x={a.raw.x} y={a.raw.y} series={a.raw.series} height={260} caption={a.raw.caption} paper />
              </div>
              {a.lin && (
                <div className="report-section mt-5">
                  <Plot x={a.lin.x} y={a.lin.y} series={a.lin.series} height={260} caption={a.lin.caption} paper />
                </div>
              )}

              <p className="mb-2 mt-5 font-serif text-[13px] text-[#333]">Table {p.no}.2: analysis. Uncertainties are standard (1σ).</p>
              <table className="tbl report-table">
                <tbody>
                  {a.results.map((l, i) => (
                    <tr key={i}>
                      <td className="!whitespace-normal !font-sans !text-[12px]">{l.label}</td>
                      <td>{rich(l.value)}</td>
                      <td className="w-12 !text-left">{rich(l.unit ?? '')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Section>

        <Section n={5} title="Discussion">
          <ol className="m-0 list-decimal space-y-3 pl-5 font-serif text-[14px] leading-relaxed">
            {m.questions.map((q, k) => {
              const ans = answers[`${exp}.q${k + 1}`]?.trim();
              return (
                <li key={k}>
                  <div className="prose-lab !text-[14px]">{q}</div>
                  <div className={`mt-1 whitespace-pre-wrap border-l-2 border-[#bbb] pl-3 ${ans ? 'text-[#111]' : 'italic text-[#888]'}`}>
                    {ans || 'No answer written.'}
                  </div>
                </li>
              );
            })}
          </ol>
        </Section>

        <Section n={6} title="Conclusion">
          {answers[`${exp}.conclusion`]?.trim() ? (
            <p className="whitespace-pre-wrap font-serif text-[14px] leading-relaxed">{answers[`${exp}.conclusion`]}</p>
          ) : (
            <p className="font-serif text-[14px] italic text-[#888]">No conclusion written.</p>
          )}
        </Section>

        <footer className="mt-8 flex justify-between border-t border-[#bbb] pt-2 font-mono text-[9.5px] text-[#666]">
          <span>Lightspeed virtual laboratory · Experiment {p.no}</span>
          <span>Ephemerides: Astronomy Engine, JPL Horizons · Constants: BIPM 2019, IAU 2015</span>
        </footer>
      </article>
    </div>,
    document.body,
  );
}
