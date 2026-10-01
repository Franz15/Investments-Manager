import Account from '../models/Account.js';
import SubAccount from '../models/SubAccount.js';
import User from '../models/User.js';

// Cuentas conjuntas (FEAT-38): el dueño sigue en `user`, los cotitulares en `members`.
export const accountScope = (userId) => ({ $or: [{ user: userId }, { members: userId }] });

// Parte de cada titular en el patrimonio: 1 / (dueño + miembros). Cuenta normal → 1.
export const shareOf = (account) => 1 / (1 + (account.members?.length ?? 0));

// subAccountId → parte del usuario, solo para subcuentas de cuentas conjuntas visibles
export async function jointShares(userId) {
  const accounts = await Account.find({
    $or: [{ user: userId, 'members.0': { $exists: true } }, { members: userId }],
  }).select('members');
  const share = new Map(accounts.map((a) => [String(a._id), shareOf(a)]));
  const subs = await SubAccount.find({ account: { $in: accounts.map((a) => a._id) } }).select(
    'account'
  );
  return new Map(subs.map((s) => [String(s._id), share.get(String(s.account))]));
}

// Transacciones visibles: propias + las de subcuentas de cuentas conjuntas
export async function txScope(userId, shares) {
  shares ??= await jointShares(userId);
  return { $or: [{ user: userId }, { subAccount: { $in: [...shares.keys()] } }] };
}

// Copias lean con `field` multiplicado por la parte del usuario según la subcuenta en `key`
export const prorate = (docs, shares, field, key = '_id') =>
  docs.map((d) => ({ ...d, [field]: d[field] * (shares.get(String(d[key])) ?? 1) }));

// Subcuenta propia o de una cuenta conjunta del usuario; null si no tiene acceso
export async function findAccessibleSubAccount(userId, id) {
  const sub = await SubAccount.findById(id);
  if (!sub) return null;
  if (sub.user === userId) return sub;
  return (await Account.exists({ _id: sub.account, ...accountScope(userId) })) ? sub : null;
}

// Solo ids de usuarios existentes y distintos del dueño
export const cleanMembers = (members, ownerId) =>
  User.distinct('id', { id: { $in: Array.isArray(members) ? members : [], $ne: ownerId } });
