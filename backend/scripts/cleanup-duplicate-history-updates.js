import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

/**
 * Script para limpiar duplicados de cotizaciones diarias en InvestmentHistory.
 *
 * Regla:
 * - Para cada usuario, inversión y día, solo debe quedar UNA entrada con operation = 'update'.
 * - Si hay varias en el mismo día, se conserva la MÁS RECIENTE (última por fecha/hora)
 *   y se eliminan las anteriores.
 *
 * Uso:
 *   node backend/scripts/cleanup-duplicate-history-updates.js <userId>
 *
 * Ejemplo:
 *   node backend/scripts/cleanup-duplicate-history-updates.js javier
 */
async function cleanupDuplicateHistoryUpdates() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';

  const userId = process.argv[2];
  if (!userId) {
    console.error('❌ Debes indicar el userId como parámetro:');
    console.error('   node backend/scripts/cleanup-duplicate-history-updates.js <userId>');
    process.exit(1);
  }

  try {
    console.log(`🔌 Conectando a MongoDB: ${mongoUri}`);
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Verificar que el usuario tiene inversiones
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      console.log(`ℹ️ No se han encontrado inversiones para el usuario "${userId}".`);
      await mongoose.disconnect();
      return;
    }

    console.log(`👤 Usuario: ${userId}`);
    console.log(`💼 Inversiones activas: ${investments.length}\n`);

    // Traer TODAS las entradas de historial de tipo 'update' del usuario
    const updates = await InvestmentHistory.find({
      user: userId,
      operation: 'update',
    }).sort({ date: 1, createdAt: 1 });

    if (updates.length === 0) {
      console.log('ℹ️ No hay entradas de tipo "update" para limpiar.');
      await mongoose.disconnect();
      return;
    }

    console.log(`📈 Entradas de historial de tipo "update" encontradas: ${updates.length}\n`);

    // Agrupar por inversión + día (YYYY-MM-DD)
    const groups = new Map();

    for (const entry of updates) {
      const d = new Date(entry.date);
      d.setHours(0, 0, 0, 0);
      const dayKey = d.toISOString().split('T')[0];
      const invId = entry.investment.toString();
      const key = `${invId}__${dayKey}`;

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(entry);
    }

    let totalGroupsWithDuplicates = 0;
    let totalDeleted = 0;

    for (const [key, entries] of groups.entries()) {
      if (entries.length <= 1) continue;

      // Hay duplicados para esta inversión y este día
      totalGroupsWithDuplicates++;

      // Ordenar por fecha/hora (y createdAt como respaldo) y conservar la última
      entries.sort((a, b) => {
        const da = new Date(a.date).getTime();
        const db = new Date(b.date).getTime();
        if (da !== db) return da - db;
        const ca = new Date(a.createdAt).getTime();
        const cb = new Date(b.createdAt).getTime();
        return ca - cb;
      });

      const toKeep = entries[entries.length - 1];
      const toDelete = entries.slice(0, -1);

      const [invId, day] = key.split('__');
      console.log(`🧹 Inversión ${invId} - Día ${day}: ${entries.length} entradas -> conservar 1, eliminar ${toDelete.length}`);

      const deleteIds = toDelete.map(e => e._id);
      const res = await InvestmentHistory.deleteMany({ _id: { $in: deleteIds } });
      totalDeleted += res.deletedCount || 0;
    }

    console.log('\nResumen:');
    console.log(`🗂 Grupos (inversión + día) con duplicados: ${totalGroupsWithDuplicates}`);
    console.log(`🗑 Entradas eliminadas: ${totalDeleted}`);

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error durante la limpieza de duplicados:', error);
    try {
      await mongoose.disconnect();
    } catch (_e) {
      // ignorar
    }
    process.exit(1);
  }
}

cleanupDuplicateHistoryUpdates();

