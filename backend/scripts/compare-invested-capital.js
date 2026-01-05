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

async function compareInvestedCapital() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB\n');

    const userId = 'ana';

    console.log(`\n${'='.repeat(80)}`);
    console.log(`COMPARACIÓN DE CAPITAL INVERTIDO PARA: ${userId}`);
    console.log('='.repeat(80));

    // Obtener inversiones activas
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null }
    });

    console.log(`\nInversiones activas: ${investments.length}`);

    // ===== CÁLCULO 1: Capital invertido (como en /performance) =====
    console.log(`\n${'-'.repeat(80)}`);
    console.log('1. CÁLCULO DE CAPITAL INVERTIDO (/performance):');
    console.log('-'.repeat(80));

    const activeInvestmentIds = investments.map(inv => inv._id);
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: activeInvestmentIds }
    }).sort({ date: 1 });

    let totalInvestedCapital = 0;
    const capitalOperations = [];

    if (allHistoryEntries.length > 0) {
      allHistoryEntries.forEach(entry => {
        if (entry.operation === 'creation' || entry.operation === 'add') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.operation === 'creation' && entry.totalValue) {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            totalInvestedCapital += amount;
            capitalOperations.push({
              date: entry.date,
              operation: entry.operation,
              amount: amount,
              investment: entry.investment?.toString() || entry.investment,
              type: 'add'
            });
          }
        } else if (entry.operation === 'sell' || entry.operation === 'withdraw') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = Math.abs(amount || 0);
          totalInvestedCapital -= amount;
          capitalOperations.push({
            date: entry.date,
            operation: entry.operation,
            amount: -amount,
            investment: entry.investment?.toString() || entry.investment,
            type: 'subtract'
          });
        }
      });
    }

    const initialValue = Math.max(0, totalInvestedCapital);
    console.log(`\nCapital invertido (suma de aportaciones - retiradas): ${initialValue.toFixed(2)}€`);
    console.log(`Total operaciones: ${capitalOperations.length}`);

    // ===== CÁLCULO 2: Valor actual de mercado (como en /evolution y /stats) =====
    console.log(`\n${'-'.repeat(80)}`);
    console.log('2. CÁLCULO DE VALOR ACTUAL DE MERCADO (/evolution y /stats):');
    console.log('-'.repeat(80));

    let currentMarketValue = 0;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    console.log(`\nValor actual por inversión (usando modelo Investment):`);
    for (const inv of investments) {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentMarketValue += value;
      console.log(`   - ${inv.name}: ${value.toFixed(2)}€`);
    }
    console.log(`\nValor total de mercado: ${currentMarketValue.toFixed(2)}€`);

    // ===== CÁLCULO 3: Valor usando DailyVariation (último día) =====
    console.log(`\n${'-'.repeat(80)}`);
    console.log('3. CÁLCULO USANDO DailyVariation (último día):');
    console.log('-'.repeat(80));

    let valueFromDailyVariation = 0;
    for (const inv of investments) {
      const lastVariation = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $lte: today }
      }).sort({ date: -1 });

      if (lastVariation && lastVariation.totalValue) {
        valueFromDailyVariation += lastVariation.totalValue;
        console.log(`   - ${inv.name}: ${lastVariation.totalValue.toFixed(2)}€ (DailyVariation)`);
      } else {
        // Buscar en InvestmentHistory
        const lastHistory = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $lte: today },
          totalValue: { $exists: true, $ne: null, $gt: 0 }
        }).sort({ date: -1 });

        if (lastHistory && lastHistory.totalValue) {
          valueFromDailyVariation += lastHistory.totalValue;
          console.log(`   - ${inv.name}: ${lastHistory.totalValue.toFixed(2)}€ (InvestmentHistory)`);
        } else {
          // Calcular capital acumulado
          const capitalOperations = allHistoryEntries.filter(h => 
            h.investment.toString() === inv._id.toString() &&
            ['creation', 'add', 'withdraw'].includes(h.operation) &&
            h.operationAmount
          );
          
          let capital = 0;
          capitalOperations.forEach(op => {
            if (op.operation === 'creation' || op.operation === 'add') {
              capital += (op.operationAmount || 0);
            } else if (op.operation === 'withdraw') {
              capital -= Math.abs(op.operationAmount || 0);
            }
          });
          
          valueFromDailyVariation += Math.max(0, capital);
          console.log(`   - ${inv.name}: ${Math.max(0, capital).toFixed(2)}€ (capital acumulado)`);
        }
      }
    }
    console.log(`\nValor total usando DailyVariation/InvestmentHistory: ${valueFromDailyVariation.toFixed(2)}€`);

    // ===== COMPARACIÓN =====
    console.log(`\n${'='.repeat(80)}`);
    console.log('COMPARACIÓN:');
    console.log('='.repeat(80));
    console.log(`\n1. Capital invertido (/performance): ${initialValue.toFixed(2)}€`);
    console.log(`2. Valor de mercado actual (modelo Investment): ${currentMarketValue.toFixed(2)}€`);
    console.log(`3. Valor usando DailyVariation (último día): ${valueFromDailyVariation.toFixed(2)}€`);
    console.log(`\nDIFERENCIAS:`);
    console.log(`   - Capital invertido vs Valor de mercado: ${(currentMarketValue - initialValue).toFixed(2)}€ (ganancia/pérdida)`);
    console.log(`   - Capital invertido vs DailyVariation: ${(valueFromDailyVariation - initialValue).toFixed(2)}€`);
    console.log(`   - Valor de mercado vs DailyVariation: ${(currentMarketValue - valueFromDailyVariation).toFixed(2)}€`);

    await mongoose.disconnect();
    console.log('\n\nDesconectado de MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

compareInvestedCapital();
