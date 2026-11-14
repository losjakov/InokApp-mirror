import { describe, expect, it } from 'vitest';
import { dialOf, phoneGroups } from '@/data/repo/phones';

describe('R-20 phone lines as the card prints them', () => {
  it('finds the number in a line; times and dates are not numbers', () => {
    expect(dialOf('+38(044)123-45-67 - канцелярія;')).toBe('+380441234567');
    expect(dialOf('з 9:00 до 11:40 і з 13:00 до 15:00')).toBeNull();
    expect(dialOf('Прийом відвідувачів, 01.07.1932')).toBeNull();
    expect(dialOf('067 123 45 67 (Viber)')).toBe('0671234567');
  });
  it('number lines = own rows, consecutive text lines = one plain row', () => {
    const g = phoneGroups(['+38(044)123-45-67 - канцелярія;', 'Прийом відвідувачів', 'з 9:00 до 11:40', '+38(067)000-00-00', '']);
    expect(g.map((x) => [x.dial, x.lines.length])).toEqual([['+380441234567', 1], [null, 2], ['+380670000000', 1]]);
  });
});
