/** The keyboard and mouse on one sheet, from the ? key and the footer. */
import { openDoc } from '../../state/route';
import { useUI } from '../../state/ui';
import { Check, CloseIcon } from '../kit';
import { Icon } from '../icons';
import { KEY_GROUPS } from '../keys';
import { useModal } from '../useModal';

function Sheet() {
  const shortcuts = useUI((s) => s.shortcuts);
  const close = () => useUI.setState({ keysOpen: false });
  const ref = useModal<HTMLDivElement>(close);
  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[minmax(0,1fr)] place-items-center overflow-y-auto bg-black/50 p-4">
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="keys-title" className="panel-float appear w-[760px] max-w-full">
        <div className="flex items-center gap-3 border-b border-line-2 py-2.5 pl-5 pr-2.5">
          <Icon name="keyboard" size={14} className="text-fg-2" />
          <h1 id="keys-title" className="text-[13.5px] font-semibold text-fg">
            Keyboard and mouse
          </h1>
          <span className="text-[12px] text-fg-3 max-sm:hidden">Single keys, whenever you are not typing.</span>
          <button className="btn btn-q btn-sq ml-auto" onClick={close} aria-label="Close" data-autofocus>
            <CloseIcon />
          </button>
        </div>
        <div className="keys-grid px-5 pb-4 pt-4">
          {KEY_GROUPS.map((g) => (
            <div key={g.title}>
              <div className="cap mb-1.5">{g.title}</div>
              <table className="keys-tbl">
                <tbody>
                  {g.rows.map(([k, v], i) => (
                    <tr key={i}>
                      <td>{k}</td>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-2 px-5 py-2.5">
          <div className="-ml-2.5 [&_.chk-row]:py-1">
            <Check checked={shortcuts} onChange={() => useUI.getState().toggle('shortcuts')}>
              <span className="text-[12px]">Single-key shortcuts</span>
            </Check>
          </div>
          <button
            className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fg-2 hover:text-fg"
            onClick={() => {
              close();
              openDoc('guide', 'controls');
            }}
          >
            <Icon name="book" /> Full guide
          </button>
        </div>
      </div>
    </div>
  );
}

export function KeysSheet() {
  const open = useUI((s) => s.keysOpen);
  return open ? <Sheet /> : null;
}
