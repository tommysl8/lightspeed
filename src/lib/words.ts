/**
 * Small counts in words, as prose writes them ("ten journeys", "Eight steps"), so text that
 * counts a list stays right when the list grows. From 21 on, figures with thousands separators.
 */
const WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

/** A count in words: 10 → "ten"; 0 → "no"; 21 and over, or not a whole number, in figures. */
export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : n.toLocaleString('en-GB');
}

/** The same, starting a sentence: "Ten". */
export function countWordStart(n: number): string {
  const w = countWord(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}
