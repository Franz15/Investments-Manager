import { describe, it, expect } from 'vitest';
import {
  maskIban,
  buildExternalId,
  normalizeEbTransaction,
  pickBankBalance,
} from '../services/bankSyncService.js';

const HASH = 'abc123hash';

const ebTx = (overrides = {}) => ({
  entry_reference: 'REF-001',
  transaction_amount: { amount: '-42.50', currency: 'EUR' },
  credit_debit_indicator: 'DBIT',
  status: 'BOOK',
  booking_date: '2026-07-10',
  remittance_information: ['MERCADONA COMPRA'],
  ...overrides,
});

describe('maskIban', () => {
  it('enmascara dejando solo inicio y fin', () => {
    expect(maskIban('ES9121000418450200051332')).toBe('ES91 **** 1332');
  });
  it('devuelve null sin IBAN', () => {
    expect(maskIban(null)).toBeNull();
  });
});

describe('buildExternalId', () => {
  it('usa entry_reference si existe', () => {
    expect(buildExternalId(HASH, ebTx())).toBe(`${HASH}:REF-001`);
  });
  it('es estable sin entry_reference (fallback por contenido)', () => {
    const tx = ebTx({ entry_reference: null });
    expect(buildExternalId(HASH, tx)).toBe(buildExternalId(HASH, ebTx({ entry_reference: null })));
  });
});

describe('normalizeEbTransaction', () => {
  it('convierte débito en gasto con importe positivo', () => {
    const t = normalizeEbTransaction(ebTx(), HASH);
    expect(t.type).toBe('expense');
    expect(t.amount).toBe(42.5);
    expect(t.currency).toBe('EUR');
    expect(t.description).toBe('MERCADONA COMPRA');
    expect(t.source).toBe('bank');
    expect(t.category).toBe('Sin categorizar');
    expect(t.date).toEqual(new Date('2026-07-10'));
  });

  it('convierte crédito en ingreso', () => {
    const t = normalizeEbTransaction(
      ebTx({
        credit_debit_indicator: 'CRDT',
        transaction_amount: { amount: '1200.00', currency: 'EUR' },
      }),
      HASH
    );
    expect(t.type).toBe('income');
    expect(t.amount).toBe(1200);
  });

  it('devuelve null si el importe no es numérico', () => {
    expect(normalizeEbTransaction(ebTx({ transaction_amount: { amount: 'x' } }), HASH)).toBeNull();
  });
});

describe('pickBankBalance', () => {
  it('prefiere CLBD sobre otros tipos', () => {
    const balances = [
      { balance_type: 'XPCD', balance_amount: { amount: '90.00' } },
      { balance_type: 'CLBD', balance_amount: { amount: '100.50' } },
    ];
    expect(pickBankBalance(balances)).toBe(100.5);
  });
  it('usa el primero si no hay CLBD', () => {
    expect(pickBankBalance([{ balance_type: 'XPCD', balance_amount: { amount: '7' } }])).toBe(7);
  });
  it('null sin balances o importe inválido', () => {
    expect(pickBankBalance([])).toBeNull();
    expect(pickBankBalance([{ balance_amount: { amount: 'x' } }])).toBeNull();
  });
});
