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

async function cleanupAllUsersDeletedInvestments() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB\n');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`LIMPIEZA DE REGISTROS DE INVERSIONES ELIMINADAS PARA TODOS LOS USUARIOS`);
    console.log('='.repeat(80));

    // Obtener todos los usuarios únicos
    const allUsers = await InvestmentHistory.distinct('user');
    console.log(`\nUsuarios encontrados: ${allUsers.length}`);

    let totalDeletedHistory = 0;
    let totalDeletedVariations = 0;

    for (const userId of allUsers) {
      console.log(`\n${'-'.repeat(80)}`);
      console.log(`Procesando usuario: ${userId}`);
      console.log('-'.repeat(80));

      // Obtener inversiones ACTIVAS de este usuario
      const activeInvestments = await Investment.find({
        user: userId,
        account: { $exists: true, $ne: null }
      });
      
      const activeInvestmentIds = activeInvestments.map(inv => inv._id);
      
      console.log(`  Inversiones activas: ${activeInvestments.length}`);

      // Eliminar registros de InvestmentHistory de inversiones eliminadas
      const deletedHistoryResult = await InvestmentHistory.deleteMany({
        user: userId,
        investment: { $nin: activeInvestmentIds }
      });

      console.log(`  ✅ Eliminados ${deletedHistoryResult.deletedCount} registros de InvestmentHistory`);
      totalDeletedHistory += deletedHistoryResult.deletedCount;

      // Eliminar registros de DailyVariation de inversiones eliminadas
      const deletedVariationsResult = await DailyVariation.deleteMany({
        user: userId,
        investment: { $nin: activeInvestmentIds }
      });

      console.log(`  ✅ Eliminados ${deletedVariationsResult.deletedCount} registros de DailyVariation`);
      totalDeletedVariations += deletedVariationsResult.deletedCount;
    }

    console.log(`\n${'='.repeat(80)}`);
    console.log('RESUMEN TOTAL:');
    console.log('='.repeat(80));
    console.log(`Total eliminado:`);
    console.log(`  - InvestmentHistory: ${totalDeletedHistory}`);
    console.log(`  - DailyVariation: ${totalDeletedVariations}`);
    console.log(`\n✅ Limpieza completada para todos los usuarios.`);

    await mongoose.disconnect();
    console.log('\n\nDesconectado de MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

cleanupAllUsersDeletedInvestments();
