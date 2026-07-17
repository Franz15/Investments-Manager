import cron from 'node-cron';
import RecurringTransaction from '../models/RecurringTransaction.js';
import Transaction from '../models/Transaction.js';
import { syncAllActiveConnections } from '../services/bankSyncService.js';

function advanceDate(date, frequency) {
  const d = new Date(date);
  switch (frequency) {
    case 'daily':
      d.setDate(d.getDate() + 1);
      break;
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'monthly':
      d.setMonth(d.getMonth() + 1);
      break;
    case 'bimonthly':
      d.setMonth(d.getMonth() + 2);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'yearly':
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d;
}

export async function processRecurringTransactions() {
  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const due = await RecurringTransaction.find({
    isActive: true,
    nextDate: { $lte: endOfToday },
    $or: [{ endDate: null }, { endDate: { $gte: now } }],
  });

  let created = 0;
  for (const rt of due) {
    try {
      await Transaction.create({
        user: rt.user,
        subAccount: rt.subAccount,
        type: rt.type,
        category: rt.category,
        amount: rt.amount,
        currency: rt.currency,
        description: rt.description || rt.name,
        date: rt.nextDate,
        tags: rt.tags || [],
        business: rt.business || null,
      });

      const nextDate = advanceDate(rt.nextDate, rt.frequency);
      rt.lastGenerated = rt.nextDate;
      rt.nextDate = nextDate;

      if (rt.endDate && nextDate > rt.endDate) {
        rt.isActive = false;
      }

      await rt.save();
      created++;
    } catch (err) {
      console.error(`[Scheduler] Error generating recurring transaction ${rt._id}:`, err.message);
    }
  }

  return created;
}

export function startScheduler() {
  // Ejecutar cada día a las 6:00 AM
  cron.schedule('0 6 * * *', async () => {
    console.log('[Scheduler] Procesando transacciones recurrentes...');
    try {
      const count = await processRecurringTransactions();
      console.log(`[Scheduler] ${count} transacciones generadas`);
    } catch (err) {
      console.error('[Scheduler] Error:', err);
    }
  });
  // Sync bancario 1x/día (PSD2 permite máx. 4 accesos/día sin usuario presente).
  // Solo si Enable Banking está configurado.
  if (process.env.EB_APP_ID) {
    cron.schedule('0 7 * * *', async () => {
      console.log('[Scheduler] Sincronizando conexiones bancarias...');
      try {
        const count = await syncAllActiveConnections();
        console.log(`[Scheduler] ${count} transacciones bancarias importadas`);
      } catch (err) {
        console.error('[Scheduler] Error en sync bancario:', err);
      }
    });
  }

  console.log('[Scheduler] Iniciado — transacciones recurrentes a las 6:00 AM');
}
