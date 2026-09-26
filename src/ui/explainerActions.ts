import type { ExplainerId } from '../content/explainers';
import type { ArticleMeta } from '../content/learn/catalogue';
import { openLearn } from '../state/route';
import { useUI } from '../state/ui';
import { openLab } from './onboarding';

/** Open a reference section in the lab manual (from inside the lab). */
export function openExplainer(id: ExplainerId): void {
  openLab('reference');
  useUI.setState({ refTopic: id, noteTopic: null });
  markSeen(id);
}

/**
 * The Learn article (and section) that tells the full story behind each physics note. A
 * section that the article no longer has opens the article at the top.
 */
export const EXPLAINER_ARTICLES: Record<ExplainerId, { slug: string; section?: string }> = {
  'light-time': { slug: 'light-takes-time', section: 'living-with-the-delay' },
  scale: { slug: 'how-big-is-the-solar-system', section: 'a-solar-system-you-can-walk-through' },
  lorentz: { slug: 'nothing-outruns-light', section: 'the-light-clock' },
  'mass-limit': { slug: 'nothing-outruns-light', section: 'the-price-of-speed' },
  ftl: { slug: 'nothing-outruns-light', section: 'faster-than-light-would-mean-effect-before-cause' },
  'time-dilation': { slug: 'time-dilation' },
  'length-contraction': { slug: 'time-dilation' },
  aberration: { slug: 'seeing-near-light-speed', section: 'the-sky-folds-forward' },
  doppler: { slug: 'seeing-near-light-speed', section: 'dopplers-coloured-stars' },
  rocket: { slug: 'rockets-to-the-stars', section: 'flip-and-burn' },
};

/**
 * "Read more" and "Why": the matching Learn article, at its section. When the article has not
 * been written (or Learn could not load) the Learn hub opens instead: never the lab, which
 * opens only when asked for. (The article index loads with Learn, not with the app, hence the
 * wait.)
 */
export async function readMore(id: ExplainerId): Promise<void> {
  const target = EXPLAINER_ARTICLES[id];
  let article: ArticleMeta | undefined;
  try {
    article = (await import('../content/learn/library')).findArticle(target?.slug);
  } catch {
    article = undefined; // offline and not loaded yet
  }
  useUI.setState({ noteTopic: null });
  markSeen(id);
  if (!article) {
    openLearn();
    return;
  }
  const section = article.sections.some((s) => s.id === target.section) ? target.section : undefined;
  openLearn(article.slug, section);
}

// ── "Seen" bookkeeping so a section is only suggested once ────────────────────────────────

const SEEN_KEY = 'lightspeed.seenExplainers';
function readSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}
const seen = readSeen();
function markSeen(id: ExplainerId): void {
  seen.add(id);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    /* storage unavailable: fine */
  }
}

/**
 * Suggest a reference section the first time something relevant happens (e.g. first time
 * past 0.1c). It appears as a margin note in the viewport rather than taking over the screen,
 * and only for those who turned physics notes on (the `hints` preference, off by default):
 * nothing pops up unasked. While hints are off nothing is marked as seen, so turning them on
 * later still brings each note once.
 */
export function surfaceOnce(id: ExplainerId): void {
  if (!useUI.getState().hints || seen.has(id)) return;
  markSeen(id);
  useUI.setState({ noteTopic: id });
}
