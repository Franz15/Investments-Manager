import { describe, it, expect } from 'vitest';
import {
  normalizeDay,
  resolveOperationAmount,
  isCapitalOperation,
  getSignedOperationAmount,
} from '../services/variationEngine.js';

describe('normalizeDay', () => {
  it('pone la hora a medianoche', () => {
    const d = normalizeDay('2026-07-14T15:30:45.000Z');
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });
});

describe('isCapitalOperation', () => {
  it('es true para operaciones de capital', () => {
    for (const op of ['creation', 'add', 'withdraw', 'sell']) {
      expect(isCapitalOperation(op)).toBe(true);
    }
  });

  it('es false para el resto', () => {
    for (const op of ['update', 'revaluation', undefined, null, '']) {
      expect(isCapitalOperation(op)).toBe(false);
    }
  });
});

describe('resolveOperationAmount', () => {
  it('usa operationAmount cuando está presente', () => {
    expect(resolveOperationAmount({ operationAmount: 1000 })).toBe(1000);
  });

  it('cae a operationPrice * quantity si falta operationAmount', () => {
    expect(resolveOperationAmount({ operationPrice: 10, quantity: 5 })).toBe(50);
  });

  it('en creation cae a totalValue si no hay precio/cantidad', () => {
    expect(resolveOperationAmount({ operation: 'creation', totalValue: 3000 })).toBe(3000);
  });

  it('devuelve 0 cuando no hay datos suficientes', () => {
    expect(resolveOperationAmount({})).toBe(0);
    expect(resolveOperationAmount(null)).toBe(0);
  });
});

describe('getSignedOperationAmount', () => {
  it('creation y add son positivos', () => {
    expect(getSignedOperationAmount({ operation: 'creation', operationAmount: 500 })).toBe(500);
    expect(getSignedOperationAmount({ operation: 'add', operationAmount: 200 })).toBe(200);
  });

  it('withdraw y sell son negativos', () => {
    expect(getSignedOperationAmount({ operation: 'withdraw', operationAmount: 300 })).toBe(-300);
    expect(getSignedOperationAmount({ operation: 'sell', operationAmount: 150 })).toBe(-150);
  });

  it('operaciones no de capital devuelven 0', () => {
    expect(getSignedOperationAmount({ operation: 'update', operationAmount: 999 })).toBe(0);
  });

  // Test de regresión / documentación:
  // resolveOperationAmount cae a operationPrice*quantity cuando falta operationAmount,
  // INCLUSO para "add", donde `quantity` es el total acumulado (no el delta). Por eso
  // dashboardRoutes tiene su propia getOperationAmountForStats que NO hace esa multiplicación.
  // Este test bloquea el comportamiento actual: si algún día se unifican ambas funciones,
  // que sea una decisión consciente y no un cambio silencioso de un cálculo de dinero.
  it('[regresión] en add sin operationAmount, multiplica precio*cantidad (diverge del dashboard)', () => {
    const entry = { operation: 'add', operationPrice: 10, quantity: 100 };
    expect(getSignedOperationAmount(entry)).toBe(1000);
  });
});
