import { useEffect, useRef } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Controls Tab reaches inside `el`, in order. Buttons taken out of the Tab order (tabIndex −1) are not among them. */
function tabbable(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (x) => x.tabIndex >= 0 && (x.offsetParent !== null || x === document.activeElement),
  );
}

interface OpenModal {
  el: HTMLElement;
  /** Where focus goes back to when this dialog closes. */
  prev: HTMLElement | null;
  onKey: (e: KeyboardEvent) => void;
}

/**
 * Modal dialogs open now, oldest first. Only the newest handles keys: a palette opened from a
 * page that is still closing gets Escape, not the page.
 */
const openModals: OpenModal[] = [];

/**
 * Keys for modal dialogs are taken on the document, in the capture phase, rather than on the
 * dialog: a click on the dimmed backdrop leaves focus on <body>, and Escape and Tab must still
 * work from there.
 */
const onDocumentKey = (e: KeyboardEvent) => openModals[openModals.length - 1]?.onKey(e);

/**
 * Focus handling for dialogs: move focus into the dialog when it opens (to the element
 * marked data-autofocus, else the first control), give it back to whatever had it when the
 * dialog closes, close on Escape, and (for modal dialogs) keep Tab inside.
 */
export function useModal<T extends HTMLElement>(onClose?: () => void, { trap = true }: { trap?: boolean } = {}) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entry: OpenModal = { el, prev: document.activeElement as HTMLElement | null, onKey: () => {} };
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE) ?? el;
    if (first === el && !el.hasAttribute('tabindex')) el.tabIndex = -1;
    first.focus({ preventScroll: true });

    entry.onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && close.current) {
        // A menu inside that closed itself has already handled it.
        if (e.defaultPrevented) return;
        e.preventDefault();
        e.stopPropagation();
        close.current();
        return;
      }
      if (e.key !== 'Tab' || !trap) return;
      const items = tabbable(el);
      const active = document.activeElement;
      if (!items.length) {
        e.preventDefault();
        el.focus({ preventScroll: true });
        return;
      }
      const a = items[0];
      const z = items[items.length - 1];
      if (!el.contains(active)) {
        // Focus was outside (on <body> after a backdrop click): bring it back in.
        e.preventDefault();
        (e.shiftKey ? z : a).focus();
      } else if (e.shiftKey && (active === a || active === el)) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && active === z) {
        e.preventDefault();
        a.focus();
      }
    };

    // Modal dialogs listen on the document; a non-modal one (the planner) only while focus is inside it.
    if (trap) {
      if (!openModals.length) document.addEventListener('keydown', onDocumentKey, true);
      openModals.push(entry);
    } else el.addEventListener('keydown', entry.onKey);

    return () => {
      if (trap) {
        const i = openModals.indexOf(entry);
        if (i >= 0) openModals.splice(i, 1);
        if (!openModals.length) document.removeEventListener('keydown', onDocumentKey, true);
      } else el.removeEventListener('keydown', entry.onKey);
      // A dialog opened from inside this one returns focus to where this one would have.
      for (const m of openModals) if (m.prev && el.contains(m.prev)) m.prev = entry.prev;
      // Give focus back only if it is still ours to give: in this dialog, or nowhere (the
      // dialog's elements have gone). If something else has taken it, such as a palette opened
      // by a Try button as the guide closes, leave it there.
      const active = document.activeElement;
      const ours = !active || active === document.body || el.contains(active);
      const prev = entry.prev;
      if (ours && prev && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [trap]);

  return ref;
}
