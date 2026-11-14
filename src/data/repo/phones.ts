/** A telephone number inside a printed line (R-20: «+38(044)123-45-67 - канцелярія;»); times «9:00», dates «01.07.1932» never match. */
const NUMBER = /\+?\d[\d\s()-]{7,}\d/;

/** The digits to dial for a number found in a line, else null (a text line of the phone block: hours, notes). */
export function dialOf(line: string): string | null {
  const m = line.match(NUMBER);
  if (!m) return null;
  const digits = m[0].replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 9 ? digits : null;
}

export interface PhoneGroup { dial: string | null; lines: string[] }

/**
 * R-20: the card's «Телефони» lines as the site prints them — a line with a number is one tappable row (dials that number);
 * consecutive text lines (when calls are answered, notes) stay together as one plain row, in their order.
 */
export function phoneGroups(phones: string[]): PhoneGroup[] {
  const out: PhoneGroup[] = [];
  for (const raw of phones) {
    const line = raw.trim();
    if (!line) continue;
    const dial = dialOf(line);
    const last = out[out.length - 1];
    if (!dial && last && !last.dial) last.lines.push(line);
    else out.push({ dial, lines: [line] });
  }
  return out;
}
