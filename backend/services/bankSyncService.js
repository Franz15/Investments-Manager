import Transaction from '../models/Transaction.js';
import BankConnection from '../models/BankConnection.js';
import SubAccount from '../models/SubAccount.js';
import { decryptSecret, getBalances, getTransactions } from './enableBankingService.js';

const FULL_HISTORY_FROM = '2000-01-01';
const INCREMENTAL_MARGIN_DAYS = 7; // margen para transacciones que pasan de PEND a BOOK

export function maskIban(iban) {
  if (!iban) return null;
  const clean = iban.replace(/\s/g, '');
  return `${clean.slice(0, 4)} **** ${clean.slice(-4)}`;
}

// externalId estable entre sesiones: hash de cuenta (estable) + referencia del banco.
// Sin entry_reference, fallback a hash del contenido.
export function buildExternalId(identificationHash, ebTx) {
  const ref =
    ebTx.entry_reference ||
    `${ebTx.booking_date}|${ebTx.transaction_amount?.amount}|${ebTx.credit_debit_indicator}|${describeTransaction(ebTx)}`;
  return `${identificationHash}:${ref}`;
}

function describeTransaction(ebTx) {
  const remittance = (ebTx.remittance_information || []).join(' ').trim();
  return remittance || ebTx.creditor?.name || ebTx.debtor?.name || 'Movimiento bancario';
}

// Saldo preferente: CLBD (closing booked); si no, el primero que venga
export function pickBankBalance(balances) {
  if (!balances?.length) return null;
  const preferred = balances.find((b) => b.balance_type === 'CLBD') || balances[0];
  const amount = parseFloat(preferred.balance_amount?.amount);
  return Number.isFinite(amount) ? amount : null;
}

// Transacción EB → campos del modelo Transaction. Solo estado BOOK.
export function normalizeEbTransaction(ebTx, identificationHash) {
  const amount = Math.abs(parseFloat(ebTx.transaction_amount?.amount));
  if (!Number.isFinite(amount)) return null;

  return {
    externalId: buildExternalId(identificationHash, ebTx),
    type: ebTx.credit_debit_indicator === 'CRDT' ? 'income' : 'expense',
    amount,
    currency: ebTx.transaction_amount?.currency || 'EUR',
    description: describeTransaction(ebTx),
    date: new Date(ebTx.booking_date || ebTx.value_date),
    category: 'Sin categorizar',
    source: 'bank',
  };
}

async function fetchAllTransactions(accountUid, dateFrom, psuHeaders) {
  const all = [];
  let continuationKey;
  do {
    const page = await getTransactions(accountUid, { dateFrom, continuationKey, psuHeaders });
    all.push(...(page.transactions || []));
    continuationKey = page.continuation_key;
  } while (continuationKey);
  return all;
}

/**
 * Sincroniza una conexión. `full: true` solo con usuario presente (PSD2: >90 días
 * de historial requiere PSU). Devuelve nº de transacciones creadas.
 */
export async function syncConnection(connection, { full = false, psuHeaders } = {}) {
  // sessionIdEncrypted tiene select: false; recargar si falta
  if (!connection.sessionIdEncrypted) {
    connection = await BankConnection.findById(connection._id).select('+sessionIdEncrypted');
  }
  decryptSecret(connection.sessionIdEncrypted); // valida que la sesión es descifrable

  let created = 0;
  const now = new Date();

  for (const ebAccount of connection.accounts) {
    // El destino es una SubAccount: es donde vive el balance y lo que agregan
    // Finanzas y las estadísticas. Sin subcuenta mapeada no se sincroniza.
    const target = ebAccount.subAccount;
    if (!target) continue;

    // PSD2: >90 días de historial solo con usuario presente (full=true desde ruta manual).
    // Sin usuario (cron): incremental desde lastSyncedAt, o últimos 89 días si nunca se sincronizó.
    let dateFrom;
    if (full) {
      dateFrom = FULL_HISTORY_FROM;
    } else {
      const from = ebAccount.lastSyncedAt ? new Date(ebAccount.lastSyncedAt) : new Date();
      from.setDate(from.getDate() - (ebAccount.lastSyncedAt ? INCREMENTAL_MARGIN_DAYS : 89));
      dateFrom = from.toISOString().slice(0, 10);
    }

    const ebTxs = await fetchAllTransactions(ebAccount.uid, dateFrom, psuHeaders);
    const booked = ebTxs.filter((t) => (t.status || 'BOOK') === 'BOOK');

    const docs = booked
      .map((t) => normalizeEbTransaction(t, ebAccount.identificationHash))
      .filter(Boolean)
      .map((t) => ({
        ...t,
        user: connection.user,
        subAccount: target,
      }));

    if (docs.length) {
      // ordered:false → los duplicados (índice único parcial) fallan sin abortar el resto
      try {
        const res = await Transaction.insertMany(docs, { ordered: false });
        created += res.length;
      } catch (err) {
        if (err.code === 11000 || err.writeErrors) {
          created += err.insertedDocs?.length || 0;
        } else {
          throw err;
        }
      }
    }

    // El saldo de la subcuenta lo dicta el banco en cada sync (fuente de verdad).
    // Las transacciones manuales sobre esta subcuenta divergirán hasta el siguiente sync.
    try {
      const { balances } = await getBalances(ebAccount.uid, psuHeaders);
      const bankBalance = pickBankBalance(balances);
      if (bankBalance !== null) {
        await SubAccount.updateOne(
          { _id: target, user: connection.user },
          { balance: bankBalance }
        );
      }
    } catch (err) {
      console.error(`[BankSync] Balance no actualizado (${ebAccount.uid}):`, err.message);
    }

    ebAccount.lastSyncedAt = now;
  }

  connection.lastSyncError = null;
  await connection.save();
  return created;
}

/** Sync de todas las conexiones activas (cron, sin PSU → solo incremental). */
export async function syncAllActiveConnections() {
  const connections = await BankConnection.find({ status: 'active' }).select('+sessionIdEncrypted');
  let total = 0;

  for (const connection of connections) {
    try {
      if (connection.validUntil && connection.validUntil < new Date()) {
        connection.status = 'expired';
        await connection.save();
        continue;
      }
      total += await syncConnection(connection);
    } catch (err) {
      // 401/403 de EB = sesión expirada o revocada en el banco
      if (err.status === 401 || err.status === 403) {
        connection.status = 'expired';
      }
      connection.lastSyncError = err.message?.slice(0, 500);
      await connection.save().catch(() => {});
      console.error(`[BankSync] Error en conexión ${connection._id}:`, err.message);
    }
  }
  return total;
}
