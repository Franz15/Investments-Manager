import mongoose from 'mongoose';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import DailyVariation from '../models/DailyVariation.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

async function debugPerformanceCalculations() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    const userId = 'ana'; // Cambiar según el usuario a depurar

    // Obtener todas las inversiones
    const investments = await Investment.find({ 
      user: userId,
      account: { $exists: true, $ne: null }
    });

    if (investments.length === 0) {
      console.log('❌ No hay inversiones');
      await mongoose.disconnect();
      return;
    }

    console.log(`📊 Total de inversiones: ${investments.length}\n`);

    // Obtener todos los registros de historial
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map(inv => inv._id) }
    })
      .populate('investment')
      .sort({ date: 1 });

    console.log(`📋 Total de entradas de historial: ${allHistoryEntries.length}\n`);

    // ===== CALCULAR CAPITAL TOTAL INVERTIDO =====
    console.log('='.repeat(80));
    console.log('1. CÁLCULO DEL CAPITAL TOTAL INVERTIDO');
    console.log('='.repeat(80));
    
    let totalInvestedCapital = 0;
    const capitalBreakdown = [];

    allHistoryEntries.forEach(entry => {
      if (entry.operation === 'creation' || entry.operation === 'add') {
        let amount = entry.operationAmount;
        if (!amount || amount === 0) {
          if (entry.operationPrice && entry.quantity) {
            amount = entry.operationPrice * entry.quantity;
          } else if (entry.totalValue && entry.operation === 'creation') {
            amount = entry.totalValue;
          }
        }
        amount = amount || 0;
        if (amount >= 0) {
          totalInvestedCapital += amount;
          capitalBreakdown.push({
            date: entry.date.toISOString().split('T')[0],
            operation: entry.operation,
            investment: entry.investment?.name || 'N/A',
            amount: amount,
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
        capitalBreakdown.push({
          date: entry.date.toISOString().split('T')[0],
          operation: entry.operation,
          investment: entry.investment?.name || 'N/A',
          amount: -amount,
          type: 'subtract'
        });
      }
    });

    console.log(`Capital total invertido: ${totalInvestedCapital.toFixed(2)}€`);
    console.log(`\nDesglose de operaciones:`);
    capitalBreakdown.forEach(op => {
      console.log(`  ${op.date} - ${op.operation} - ${op.investment}: ${op.amount >= 0 ? '+' : ''}${op.amount.toFixed(2)}€`);
    });
    console.log('');

    // ===== CALCULAR VALOR ACTUAL =====
    console.log('='.repeat(80));
    console.log('2. CÁLCULO DEL VALOR ACTUAL');
    console.log('='.repeat(80));
    
    let currentValue = 0;
    investments.forEach(inv => {
      const invValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += invValue;
      console.log(`  ${inv.name}: ${invValue.toFixed(2)}€`);
    });
    
    console.log(`\nValor actual total: ${currentValue.toFixed(2)}€`);
    console.log(`Rendimiento acumulado: ${(currentValue - totalInvestedCapital).toFixed(2)}€ (${totalInvestedCapital > 0 ? (((currentValue / totalInvestedCapital) - 1) * 100).toFixed(2) : 0}%)\n`);

    // ===== CALCULAR VALOR AL INICIO DEL AÑO (2026) =====
    console.log('='.repeat(80));
    console.log('3. CÁLCULO DEL VALOR AL INICIO DEL AÑO (1 de enero de 2026)');
    console.log('='.repeat(80));
    
    const currentYear = 2026;
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);
    
    // Buscar variaciones del 31 de diciembre
    const variationsDec31 = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map(inv => inv._id) },
      date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd }
    });
    
    let yearStartValue = 0;
    const yearStartBreakdown = [];
    
    if (variationsDec31.length > 0) {
      console.log(`\nEncontradas ${variationsDec31.length} variaciones del 31 de diciembre:`);
      variationsDec31.forEach(v => {
        const inv = investments.find(i => i._id.toString() === v.investment.toString());
        const value = v.totalValue || 0;
        yearStartValue += value;
        yearStartBreakdown.push({
          investment: inv?.name || 'N/A',
          value: value,
          source: 'DailyVariation 31/12'
        });
        console.log(`  ${inv?.name || 'N/A'}: ${value.toFixed(2)}€ (DailyVariation 31/12)`);
      });
    } else {
      console.log('\nNo hay variaciones del 31 de diciembre. Buscando la más reciente...');
      
      const lastVariationBeforeYear = await DailyVariation.findOne({
        user: userId,
        investment: { $in: investments.map(inv => inv._id) },
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
          investment: { $in: investments.map(inv => inv._id) },
          date: { $gte: lastDate, $lt: lastDateEnd }
        });
        
        console.log(`Encontradas ${variationsAtLastDate.length} variaciones del ${lastDate.toISOString().split('T')[0]}:`);
        variationsAtLastDate.forEach(v => {
          const inv = investments.find(i => i._id.toString() === v.investment.toString());
          const value = v.totalValue || 0;
          yearStartValue += value;
          yearStartBreakdown.push({
            investment: inv?.name || 'N/A',
            value: value,
            source: `DailyVariation ${lastDate.toISOString().split('T')[0]}`
          });
          console.log(`  ${inv?.name || 'N/A'}: ${value.toFixed(2)}€`);
        });
      }
    }
    
    // Identificar inversiones antiguas (purchaseDate antes del 1 de enero de 2026)
    const oldInvestmentIds = new Set();
    investments.forEach(inv => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      if (purchaseDate < yearStart) {
        oldInvestmentIds.add(inv._id.toString());
      }
    });
    
    console.log(`\nInversiones antiguas (antes del 1/1/2026): ${oldInvestmentIds.size}`);
    console.log(`Inversiones nuevas (desde el 1/1/2026): ${investments.length - oldInvestmentIds.size}`);
    
    // Para inversiones antiguas sin registro, buscar su valor
    const investmentsInYearStartValue = new Set();
    yearStartBreakdown.forEach(item => {
      const inv = investments.find(i => i.name === item.investment);
      if (inv) {
        investmentsInYearStartValue.add(inv._id.toString());
      }
    });
    
    let actualYearStartValue = yearStartValue;
    const missingInvestments = [];
    
    for (const inv of investments) {
      const invId = inv._id.toString();
      if (oldInvestmentIds.has(invId) && !investmentsInYearStartValue.has(invId)) {
        // Buscar el valor más reciente antes del 1 de enero
        const lastVariation = await DailyVariation.findOne({
          user: userId,
          investment: inv._id,
          date: { $lt: yearStart }
        })
          .sort({ date: -1 })
          .limit(1);
        
        if (lastVariation && lastVariation.totalValue) {
          actualYearStartValue += lastVariation.totalValue;
          missingInvestments.push({
            name: inv.name,
            value: lastVariation.totalValue,
            date: lastVariation.date,
            source: 'DailyVariation'
          });
          console.log(`  ${inv.name}: +${lastVariation.totalValue.toFixed(2)}€ (DailyVariation ${lastVariation.date.toISOString().split('T')[0]})`);
        } else {
          // Buscar en InvestmentHistory
          const lastHistory = await InvestmentHistory.findOne({
            user: userId,
            investment: inv._id,
            date: { $lt: yearStart }
          })
            .sort({ date: -1 })
            .limit(1);
          
          if (lastHistory && lastHistory.totalValue) {
            actualYearStartValue += lastHistory.totalValue;
            missingInvestments.push({
              name: inv.name,
              value: lastHistory.totalValue,
              date: lastHistory.date,
              source: 'InvestmentHistory'
            });
            console.log(`  ${inv.name}: +${lastHistory.totalValue.toFixed(2)}€ (InvestmentHistory ${lastHistory.date.toISOString().split('T')[0]})`);
          }
        }
      }
    }
    
    console.log(`\nValor al inicio del año (yearStartValue): ${yearStartValue.toFixed(2)}€`);
    console.log(`Valor añadido de inversiones sin registro: ${missingInvestments.reduce((sum, inv) => sum + inv.value, 0).toFixed(2)}€`);
    console.log(`Valor real al inicio del año (actualYearStartValue): ${actualYearStartValue.toFixed(2)}€`);
    console.log('');

    // ===== CALCULAR APORTACIONES DURANTE 2026 =====
    console.log('='.repeat(80));
    console.log('4. CÁLCULO DE APORTACIONES DURANTE 2026');
    console.log('='.repeat(80));
    
    let capitalAddedThisYear = 0;
    let capitalAddedToNewInvestments = 0;
    let capitalAddedToOldInvestments = 0;
    let capitalWithdrawnThisYear = 0;
    
    const contributions2026 = [];
    
    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);
      
      if (entryDate >= yearStart) {
        if (entry.operation === 'creation' || entry.operation === 'add') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.totalValue && entry.operation === 'creation') {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            capitalAddedThisYear += amount;
            contributions2026.push({
              date: entry.date.toISOString().split('T')[0],
              operation: entry.operation,
              investment: entry.investment?.name || 'N/A',
              amount: amount
            });
            
            if (entry.operation === 'creation') {
              capitalAddedToNewInvestments += amount;
            } else if (entry.operation === 'add') {
              capitalAddedToOldInvestments += amount;
            }
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
          contributions2026.push({
            date: entry.date.toISOString().split('T')[0],
            operation: entry.operation,
            investment: entry.investment?.name || 'N/A',
            amount: -amount
          });
        }
      }
    }
    
    console.log(`Aportaciones totales en 2026: ${capitalAddedThisYear.toFixed(2)}€`);
    console.log(`  - A inversiones nuevas (creation): ${capitalAddedToNewInvestments.toFixed(2)}€`);
    console.log(`  - A inversiones existentes (add): ${capitalAddedToOldInvestments.toFixed(2)}€`);
    console.log(`Retiros en 2026: ${capitalWithdrawnThisYear.toFixed(2)}€`);
    console.log(`\nDesglose de operaciones en 2026:`);
    contributions2026.forEach(op => {
      console.log(`  ${op.date} - ${op.operation} - ${op.investment}: ${op.amount >= 0 ? '+' : ''}${op.amount.toFixed(2)}€`);
    });
    console.log('');

    // ===== CALCULAR RENDIMIENTO ANUAL =====
    console.log('='.repeat(80));
    console.log('5. CÁLCULO DEL RENDIMIENTO ANUAL');
    console.log('='.repeat(80));
    
    // Calcular valor actual de inversiones antiguas y nuevas
    let currentValueOfOldInvestments = 0;
    let currentValueOfNewInvestments = 0;
    
    investments.forEach(inv => {
      const invId = inv._id.toString();
      const invValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      
      if (oldInvestmentIds.has(invId)) {
        currentValueOfOldInvestments += invValue;
      } else {
        currentValueOfNewInvestments += invValue;
      }
    });
    
    console.log(`Valor actual de inversiones antiguas: ${currentValueOfOldInvestments.toFixed(2)}€`);
    console.log(`Valor actual de inversiones nuevas: ${currentValueOfNewInvestments.toFixed(2)}€`);
    console.log(`Valor actual total: ${currentValue.toFixed(2)}€`);
    console.log('');
    
    // Fórmula: currentValue - actualYearStartValue - capitalAddedToOldInvestments + capitalWithdrawnThisYear
    const annualReturn = currentValue - actualYearStartValue - capitalAddedToOldInvestments + capitalWithdrawnThisYear;
    const baseValue = actualYearStartValue + capitalAddedToOldInvestments - capitalWithdrawnThisYear;
    const annualReturnPercent = baseValue > 0 ? ((annualReturn / baseValue) * 100) : 0;
    
    console.log('Fórmula del rendimiento anual:');
    console.log(`  annualReturn = currentValue - actualYearStartValue - capitalAddedToOldInvestments + capitalWithdrawnThisYear`);
    console.log(`  annualReturn = ${currentValue.toFixed(2)} - ${actualYearStartValue.toFixed(2)} - ${capitalAddedToOldInvestments.toFixed(2)} + ${capitalWithdrawnThisYear.toFixed(2)}`);
    console.log(`  annualReturn = ${annualReturn.toFixed(2)}€`);
    console.log(`  annualReturnPercent = ${annualReturnPercent.toFixed(2)}%`);
    console.log('');

    // ===== RESUMEN FINAL =====
    console.log('='.repeat(80));
    console.log('RESUMEN FINAL');
    console.log('='.repeat(80));
    console.log(`Capital total invertido: ${totalInvestedCapital.toFixed(2)}€`);
    console.log(`Valor actual: ${currentValue.toFixed(2)}€`);
    console.log(`Rendimiento acumulado: ${(currentValue - totalInvestedCapital).toFixed(2)}€`);
    console.log('');
    console.log(`Valor al inicio del año (actualYearStartValue): ${actualYearStartValue.toFixed(2)}€`);
    console.log(`Aportaciones a inversiones existentes en 2026: ${capitalAddedToOldInvestments.toFixed(2)}€`);
    console.log(`Retiros en 2026: ${capitalWithdrawnThisYear.toFixed(2)}€`);
    console.log(`Rendimiento anual: ${annualReturn.toFixed(2)}€ (${annualReturnPercent.toFixed(2)}%)`);
    console.log('');

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

debugPerformanceCalculations();
