import { describe, it, expect } from 'vitest';
import { latestCursor, sumCursor } from '../services/historyCursor.js';

describe('latestCursor', () => {
  it('devuelve la última entrada con key <= clave y avanza con claves crecientes', () => {
    const next = latestCursor([
      { key: 1, time: 10, value: 'a' },
      { key: 3, time: 30, value: 'b' },
      { key: 5, time: 50, value: 'c' },
    ]);
    expect(next(0)).toBeNull();
    expect(next(1).value).toBe('a');
    expect(next(4).value).toBe('b');
    expect(next(4).value).toBe('b');
    expect(next(9).value).toBe('c');
  });

  it('en empate de time exacto conserva la primera entrada', () => {
    const next = latestCursor([
      { key: 1, time: 10, value: 'primera' },
      { key: 1, time: 10, value: 'segunda' },
    ]);
    expect(next(1).value).toBe('primera');
  });

  it('mismo día con time distinto toma la más reciente', () => {
    const next = latestCursor([
      { key: 1, time: 10, value: 'mañana' },
      { key: 1, time: 20, value: 'tarde' },
    ]);
    expect(next(1).value).toBe('tarde');
  });
});

describe('sumCursor', () => {
  it('acumula importes hasta la clave', () => {
    const next = sumCursor([
      { key: 1, amount: 100 },
      { key: 2, amount: 50 },
      { key: 4, amount: -30 },
    ]);
    expect(next(0)).toBe(0);
    expect(next(2)).toBe(150);
    expect(next(3)).toBe(150);
    expect(next(4)).toBe(120);
  });
});
