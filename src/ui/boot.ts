/**
 * The loading screen (index.html, #boot), where the mark's circles come together while the app
 * loads. It stays until the first frame of the view is drawn, so the page never shows an empty
 * canvas, and then fades. If the app was ready before the screen had faded in (a warm cache), it
 * goes at once, unseen; otherwise it waits for the circles to meet, so the mark is never cut off
 * half-drawn.
 */
import { _roots, addAfterEffect } from '@react-three/fiber';

/** Before this (ms after the page began) the screen has not faded in yet (index.html: 0.25 s delay). */
const UNSEEN_MS = 250;

/** When the circles have met: the apex, last to arrive, starts at 0.45 s and takes 1.1 s. */
const MET_MS = 1550;

/** The screen goes this long after the app starts whatever happens (no WebGL, a very slow first compile). */
const GIVE_UP_MS = 10_000;

export function dismissBootWhenDrawn(): void {
  const el = document.getElementById('boot');
  if (!el) return;
  let done = false;
  const remove = () => el.remove();
  const go = () => {
    if (done) return;
    done = true;
    stop();
    const t = performance.now();
    if (t < UNSEEN_MS || matchMedia('(prefers-reduced-motion: reduce)').matches) return remove();
    setTimeout(
      () => {
        el.classList.add('boot-out');
        el.addEventListener('animationend', (e) => e.target === el && remove());
        setTimeout(remove, 600);
      },
      Math.max(0, MET_MS - t),
    );
  };
  const stop = addAfterEffect(() => {
    if (_roots.size > 0) go();
  });
  setTimeout(go, GIVE_UP_MS);
}
