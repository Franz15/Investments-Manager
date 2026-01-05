import mongoose from 'mongoose';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function checkInvestmentHistoryValues() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    const userId = 'ana';
    const investments = await Investment.find({ 
      user: userId,
      account: { $exists: true, $ne: null }
    });

    const yearStart = new Date(2026, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const lastDayOfPreviousYear = new Date(2025, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);

    console.log('='.repeat(80));
    console.log('VERIFICACIÓN DE VALORES EN INVESTMENTHISTORY AL 31/12/2025');
    console.log('='.repeat(80));
    console.log('');

    for (const inv of investments) {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      
      if (purchaseDate < yearStart) {
        console.log(`📊 ${inv.name}:`);
        console.log(`   Valor actual: ${(inv.isAutomatedPortfolio ? inv.currentPrice : inv.quantity * inv.currentPrice).toFixed(2)}€`);
        
        // Buscar registros del 31/12
        const historyDec31 = await InvestmentHistory.find({
          user: userId,
          investment: inv._id,
          date: { $gte: lastDayOfPreviousYear, $lt: yearStart }
        }).sort({ date: -1 });

        if (historyDec31.length > 0) {
          console.log(`   Registros del 31/12: ${historyDec31.length}`);
          historyDec31.forEach(h => {
            console.log(`     - ${h.date.toISOString().split('T')[0]} | ${h.operation} | totalValue: ${h.totalValue ? h.totalValue.toFixed(2) : 'N/A'}€ | operationAmount: ${h.operationAmount ? h.operationAmount.toFixed(2) : 'N/A'}€`);
          });
        } else {
          console.log(`   ❌ No hay registros del 31/12`);
          
          // Buscar el último registro antes del 1/1
          const lastHistory = await InvestmentHistory.findOne({
            user: userId,
            investment: inv._id,
            date: { $lt: yearStart }
          }).sort({ date: -1 });

          if (lastHistory) {
            console.log(`   Último registro antes del 1/1: ${lastHistory.date.toISOString().split('T')[0]}`);
            console.log(`     - Operación: ${lastHistory.operation}`);
            console.log(`     - totalValue: ${lastHistory.totalValue ? lastHistory.totalValue.toFixed(2) : 'N/A'}€`);
            console.log(`     - operationAmount: ${lastHistory.operationAmount ? lastHistory.operationAmount.toFixed(2) : 'N/A'}€`);
          } else {
            console.log(`   ❌ No hay registros en InvestmentHistory`);
          }
        }
        console.log('');
      }
    }

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkInvestmentHistoryValues();
