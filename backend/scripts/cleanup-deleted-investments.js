import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

// Importar modelos
import Investment from '../models/Investment.js';
import InvestmentHistory from '../models/InvestmentHistory.js';
import DailyVariation from '../models/DailyVariation.js';

async function cleanupDeletedInvestments() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB\n');

    // Limpiar para todos los usuarios o solo uno específico
    const userId = process.argv[2] || 'javier'; // Puedes pasar el userId como argumento

    console.log(`\n${'='.repeat(80)}`);
    console.log(`LIMPIEZA DE REGISTROS DE INVERSIONES ELIMINADAS PARA: ${userId}`);
    console.log('='.repeat(80));

    // Obtener inversiones ACTIVAS
    const activeInvestments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null }
    });
    
    const activeInvestmentIds = activeInvestments.map(inv => inv._id);
    
    console.log(`\nInversiones activas: ${activeInvestments.length}`);

    // Eliminar registros de InvestmentHistory de inversiones eliminadas
    const deletedHistoryResult = await InvestmentHistory.deleteMany({
      user: userId,
      investment: { $nin: activeInvestmentIds }
    });

    console.log(`\n✅ Eliminados ${deletedHistoryResult.deletedCount} registros de InvestmentHistory de inversiones eliminadas`);

    // Eliminar registros de DailyVariation de inversiones eliminadas
    const deletedVariationsResult = await DailyVariation.deleteMany({
      user: userId,
      investment: { $nin: activeInvestmentIds }
    });

    console.log(`✅ Eliminados ${deletedVariationsResult.deletedCount} registros de DailyVariation de inversiones eliminadas`);

    // Verificar que no queden registros
    const remainingHistory = await InvestmentHistory.countDocuments({
      user: userId,
      investment: { $nin: activeInvestmentIds }
    });

    const remainingVariations = await DailyVariation.countDocuments({
      user: userId,
      investment: { $nin: activeInvestmentIds }
    });

    console.log(`\n${'='.repeat(80)}`);
    console.log('VERIFICACIÓN:');
    console.log('='.repeat(80));
    console.log(`Registros restantes de inversiones eliminadas:`);
    console.log(`  - InvestmentHistory: ${remainingHistory}`);
    console.log(`  - DailyVariation: ${remainingVariations}`);

    if (remainingHistory === 0 && remainingVariations === 0) {
      console.log(`\n✅ Limpieza completada. No quedan registros de inversiones eliminadas.`);
    } else {
      console.log(`\n⚠️  Aún quedan registros. Revisa manualmente.`);
    }

    await mongoose.disconnect();
    console.log('\n\nDesconectado de MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupDeletedInvestments();
