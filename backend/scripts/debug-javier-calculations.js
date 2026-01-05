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

async function debugJavierCalculations() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Conectado a MongoDB\n');

    const userId = 'javier';

    console.log(`\n${'='.repeat(80)}`);
    console.log(`DEBUG DE CÁLCULOS PARA: ${userId}`);
    console.log('='.repeat(80));

    // Obtener inversiones ACTIVAS
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null }
    });
    
    const activeInvestmentIds = investments.map(inv => inv._id);
    
    console.log(`\n1. INVERSIONES ACTIVAS: ${investments.length}`);
    investments.forEach(inv => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      console.log(`   - ${inv.name}: ${value.toFixed(2)}€`);
    });

    const currentValue = investments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      return sum + value;
    }, 0);
    console.log(`   VALOR ACTUAL TOTAL: ${currentValue.toFixed(2)}€`);

    // Calcular capital invertido (solo inversiones activas)
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: activeInvestmentIds }
    }).sort({ date: 1 });

    console.log(`\n2. REGISTROS DE InvestmentHistory (solo activas): ${allHistoryEntries.length}`);

    let totalInvestedCapital = 0;
    const capitalOperations = [];

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
            investment: entry.investment?.toString() || entry.investment
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
          investment: entry.investment?.toString() || entry.investment
        });
      }
    });

    console.log(`   CAPITAL INVERTIDO TOTAL: ${totalInvestedCapital.toFixed(2)}€`);
    console.log(`   OPERACIONES DE CAPITAL: ${capitalOperations.length}`);

    // Calcular valor al inicio del año (31/12/2025)
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);

    console.log(`\n3. VALOR AL INICIO DEL AÑO (31/12/2025):`);

    // Buscar variaciones del 31 de diciembre (solo inversiones activas)
    const variationsDec31 = await DailyVariation.find({
      user: userId,
      investment: { $in: activeInvestmentIds },
      date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd }
    });

    let yearStartValue = 0;
    if (variationsDec31.length > 0) {
      console.log(`   Usando DailyVariation del 31/12: ${variationsDec31.length} registros`);
      variationsDec31.forEach(v => {
        yearStartValue += v.totalValue || 0;
        const inv = investments.find(inv => inv._id.toString() === v.investment.toString());
        console.log(`     - ${inv?.name || 'Desconocida'}: ${v.totalValue.toFixed(2)}€`);
      });
    } else {
      // Buscar la más reciente antes del 1 de enero
      const lastVariationBeforeYear = await DailyVariation.findOne({
        user: userId,
        investment: { $in: activeInvestmentIds },
        date: { $lt: yearStart }
      })
        .sort({ date: -1 })
        .limit(1)
        .select('date');

      if (lastVariationBeforeYear) {
        const lastDate = new Date(lastVariationBeforeYear.date);
        lastDate.setHours(0, 0, 0, 0);
        const lastDateEnd = new Date(lastDate);
        lastDateEnd.setDate(lastDateEnd.getDate() + 1);

        const variationsAtLastDate = await DailyVariation.find({
          user: userId,
          investment: { $in: activeInvestmentIds },
          date: { $gte: lastDate, $lt: lastDateEnd }
        });

        console.log(`   Usando DailyVariation más reciente (${lastDate.toISOString().split('T')[0]}): ${variationsAtLastDate.length} registros`);
        variationsAtLastDate.forEach(v => {
          yearStartValue += v.totalValue || 0;
          const inv = investments.find(inv => inv._id.toString() === v.investment.toString());
          console.log(`     - ${inv?.name || 'Desconocida'}: ${v.totalValue.toFixed(2)}€`);
        });
      } else {
        // Buscar en InvestmentHistory
        const historyBeforeYear = await InvestmentHistory.find({
          user: userId,
          investment: { $in: activeInvestmentIds },
          date: { $lt: yearStart },
          totalValue: { $exists: true, $ne: null, $gt: 0 }
        })
          .sort({ date: -1 });

        const latestByInvestment = new Map();
        historyBeforeYear.forEach(h => {
          const invId = h.investment.toString();
          if (!latestByInvestment.has(invId) && h.totalValue) {
            latestByInvestment.set(invId, h.totalValue);
          }
        });

        console.log(`   Usando InvestmentHistory: ${latestByInvestment.size} inversiones`);
        latestByInvestment.forEach((totalValue, invId) => {
          yearStartValue += totalValue;
          const inv = investments.find(inv => inv._id.toString() === invId);
          console.log(`     - ${inv?.name || 'Desconocida'}: ${totalValue.toFixed(2)}€`);
        });
      }
    }

    console.log(`   VALOR AL INICIO DEL AÑO: ${yearStartValue.toFixed(2)}€`);

    // Calcular capital aportado este año (solo inversiones activas)
    const yearStartDate = new Date(yearStart);
    yearStartDate.setHours(0, 0, 0, 0);
    
    let capitalAddedThisYear = 0;
    let capitalWithdrawnThisYear = 0;

    allHistoryEntries.forEach(entry => {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);
      
      if (entryDate >= yearStartDate) {
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
            capitalAddedThisYear += amount;
          }
        } else if (entry.operation === 'sell' || entry.operation === 'withdraw') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = Math.abs(amount || 0);
          capitalWithdrawnThisYear += amount;
        }
      }
    });

    console.log(`\n4. CAPITAL APORTADO/RETIRADO ESTE AÑO:`);
    console.log(`   Capital aportado: ${capitalAddedThisYear.toFixed(2)}€`);
    console.log(`   Capital retirado: ${capitalWithdrawnThisYear.toFixed(2)}€`);

    // Calcular rendimiento anual
    const annualReturn = currentValue - yearStartValue - capitalAddedThisYear + capitalWithdrawnThisYear;
    const baseValue = yearStartValue + capitalAddedThisYear - capitalWithdrawnThisYear;
    const annualReturnPercent = baseValue > 0 ? ((annualReturn / baseValue) * 100) : 0;

    console.log(`\n5. RENDIMIENTO ANUAL:`);
    console.log(`   Valor actual: ${currentValue.toFixed(2)}€`);
    console.log(`   Valor inicio año: ${yearStartValue.toFixed(2)}€`);
    console.log(`   Capital aportado: ${capitalAddedThisYear.toFixed(2)}€`);
    console.log(`   Capital retirado: ${capitalWithdrawnThisYear.toFixed(2)}€`);
    console.log(`   Base (inicio + aportado - retirado): ${baseValue.toFixed(2)}€`);
    console.log(`   RENDIMIENTO: ${annualReturn.toFixed(2)}€ (${annualReturnPercent.toFixed(2)}%)`);

    // Verificar si hay registros de inversiones eliminadas que puedan estar afectando
    const allHistoryAllInvestments = await InvestmentHistory.find({
      user: userId
    });
    
    const historyFromDeleted = allHistoryAllInvestments.filter(entry => {
      const invId = entry.investment?.toString() || entry.investment;
      return !activeInvestmentIds.some(id => id.toString() === invId);
    });

    if (historyFromDeleted.length > 0) {
      console.log(`\n⚠️  ADVERTENCIA: Aún hay ${historyFromDeleted.length} registros de InvestmentHistory de inversiones eliminadas`);
      console.log(`   Estos registros NO deberían estar afectando los cálculos si el código filtra correctamente.`);
    }

    await mongoose.disconnect();
    console.log('\n\nDesconectado de MongoDB');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugJavierCalculations();
