import { describe, it, expect, vi, afterEach } from 'vitest';
import Account from '../models/Account.js';
import SubAccount from '../models/SubAccount.js';
import {
  shareOf,
  prorate,
  txScope,
  findAccessibleSubAccount,
} from '../services/sharedAccountService.js';

afterEach(() => vi.restoreAllMocks());

describe('prorrateo de cuentas conjuntas', () => {
  it('cuenta conjunta de dos titulares → 50%, cuenta normal → 100%', () => {
    expect(shareOf({ members: ['ana'] })).toBe(0.5);
    expect(shareOf({ members: [] })).toBe(1);
    expect(shareOf({})).toBe(1);
  });

  it('prorratea solo las subcuentas conjuntas', () => {
    const shares = new Map([['joint', 0.5]]);
    const subs = [
      { _id: 'joint', balance: 1000 },
      { _id: 'mine', balance: 300 },
    ];
    expect(prorate(subs, shares, 'balance').map((s) => s.balance)).toEqual([500, 300]);
    const txs = [{ subAccount: 'joint', amount: 80 }];
    expect(prorate(txs, shares, 'amount', 'subAccount')[0].amount).toBe(40);
  });
});

describe('acceso compartido', () => {
  it('txScope: propias + subcuentas conjuntas, nada más', async () => {
    const scope = await txScope('javier', new Map([['joint', 0.5]]));
    expect(scope).toEqual({ $or: [{ user: 'javier' }, { subAccount: { $in: ['joint'] } }] });
  });

  it('findAccessibleSubAccount: dueño y cotitular sí, ajeno no', async () => {
    const sub = { _id: 's1', user: 'javier', account: 'a1' };
    vi.spyOn(SubAccount, 'findById').mockResolvedValue(sub);
    const exists = vi
      .spyOn(Account, 'exists')
      .mockImplementation(async (q) => q.$or.some((c) => c.members === 'ana'));

    expect(await findAccessibleSubAccount('javier', 's1')).toBe(sub);
    expect(await findAccessibleSubAccount('ana', 's1')).toBe(sub);
    expect(await findAccessibleSubAccount('intruso', 's1')).toBeNull();
    expect(exists).toHaveBeenLastCalledWith({
      _id: 'a1',
      $or: [{ user: 'intruso' }, { members: 'intruso' }],
    });
  });
});
