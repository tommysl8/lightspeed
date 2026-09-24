import { BODIES, BODY_ORDER } from '../physics/constants';
import { useUI } from '../state/ui';
import { BODY_KEYS, goToBody } from './navigation';

export function BodyBar() {
  const focus = useUI((s) => s.focus);
  const selected = useUI((s) => s.selected);
  return (
    <nav className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-4" aria-label="Bodies">
      <div className="glass pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto p-1.5">
        {BODY_ORDER.map((id) => (
          <button
            key={id}
            className={`body-btn ${focus === id ? 'body-btn-focus' : ''} ${selected === id ? 'body-btn-selected' : ''}`}
            onClick={() => goToBody(id)}
            title={`Go to ${BODIES[id].name} (${BODY_KEYS[id]})`}
          >
            <span className="body-dot" style={{ background: BODIES[id].color }} />
            {BODIES[id].name}
          </button>
        ))}
      </div>
    </nav>
  );
}
