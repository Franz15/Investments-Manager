import mongoose from 'mongoose';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import DailyVariation from '../models/DailyVariation.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function justifyAnnualReturn() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    const userId = 'ana'; // Cambiar según el usuario

    const investments = await Investment.find({ 
      user: userId,
      account: { $exists: true, $ne: null }
    });

    if (investments.length === 0) {
      console.log('❌ No hay inversiones');
      await mongoose.disconnect();
      return;
    }

    console.log('='.repeat(80));
    console.log('JUSTIFICACIÓN DEL RENDIMIENTO ANUAL 2026');
    console.log('='.repeat(80));
    console.log(`Fecha actual: ${new Date().toISOString().split('T')[0]}\n`);

    // Calcular valor actual
    let currentValue = 0;
    const currentValues = [];
    investments.forEach(inv => {
      const invValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += invValue;
      currentValues.push({
        name: inv.name,
        value: invValue,
        purchaseDate: inv.purchaseDate
      });
    });

    console.log('📊 VALOR ACTUAL DEL PORTFOLIO:');
    console.log('-'.repeat(80));
    currentValues.forEach(inv => {
      console.log(`  ${inv.name.padEnd(50)} ${inv.value.toFixed(2).padStart(12)}€`);
    });
    console.log('-'.repeat(80));
    console.log(`  TOTAL: ${currentValue.toFixed(2).padStart(12)}€\n`);

    // Calcular valor al inicio del año (1 de enero de 2026)
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
      console.log('📅 VALOR AL INICIO DEL AÑO (31 de diciembre de 2025):');
      console.log('-'.repeat(80));
      variationsDec31.forEach(v => {
        const inv = investments.find(i => i._id.toString() === v.investment.toString());
        const value = v.totalValue || 0;
        yearStartValue += value;
        yearStartBreakdown.push({
          name: inv?.name || 'N/A',
          value: value,
          source: 'DailyVariation 31/12'
        });
        console.log(`  ${(inv?.name || 'N/A').padEnd(50)} ${value.toFixed(2).padStart(12)}€ (DailyVariation 31/12)`);
      });
    }

    // Identificar inversiones antiguas (antes del 1/1/2026)
    const oldInvestmentIds = new Set();
    investments.forEach(inv => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      if (purchaseDate < yearStart) {
        oldInvestmentIds.add(inv._id.toString());
      }
    });

    const investmentsInYearStartValue = new Set();
    yearStartBreakdown.forEach(item => {
      const inv = investments.find(i => i.name === item.name);
      if (inv) {
        investmentsInYearStartValue.add(inv._id.toString());
      }
    });

    // Para inversiones antiguas sin registro, buscar su valor
    let actualYearStartValue = yearStartValue;
    const missingInvestments = [];

    console.log('\n🔍 INVERSIONES ANTIGUAS SIN REGISTRO AL 31/12:');
    console.log('-'.repeat(80));

    for (const inv of investments) {
      const invId = inv._id.toString();
      if (oldInvestmentIds.has(invId) && !investmentsInYearStartValue.has(invId)) {
        // Buscar en DailyVariation
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
          console.log(`  ${inv.name.padEnd(50)} ${lastVariation.totalValue.toFixed(2).padStart(12)}€ (DailyVariation ${lastVariation.date.toISOString().split('T')[0]})`);
        } else {
          // Buscar en InvestmentHistory
          const allHistoryEntries = await InvestmentHistory.find({
            user: userId,
            investment: inv._id
          }).sort({ date: 1 });

          // Calcular capital invertido hasta el 31/12
          let invCapitalBeforeYear = 0;
          allHistoryEntries.forEach(e => {
            const eDate = new Date(e.date);
            eDate.setHours(0, 0, 0, 0);
            if (eDate < yearStart) {
              if (e.operation === 'creation' || e.operation === 'add') {
                let amount = e.operationAmount;
                if (!amount || amount === 0) {
                  if (e.operationPrice && e.quantity) {
                    amount = e.operationPrice * e.quantity;
                  } else if (e.totalValue && e.operation === 'creation') {
                    amount = e.totalValue;
                  }
                }
                amount = amount || 0;
                if (amount >= 0) {
                  invCapitalBeforeYear += amount;
                }
              } else if (e.operation === 'sell' || e.operation === 'withdraw') {
                let amount = e.operationAmount;
                if (!amount || amount === 0) {
                  if (e.operationPrice && e.quantity) {
                    amount = e.operationPrice * e.quantity;
                  }
                }
                amount = Math.abs(amount || 0);
                invCapitalBeforeYear -= amount;
              }
            }
          });

          if (invCapitalBeforeYear > 0) {
            actualYearStartValue += invCapitalBeforeYear;
            missingInvestments.push({
              name: inv.name,
              value: invCapitalBeforeYear,
              date: null,
              source: 'calculatedFromHistory'
            });
            console.log(`  ${inv.name.padEnd(50)} ${invCapitalBeforeYear.toFixed(2).padStart(12)}€ (Capital invertido hasta 31/12)`);
          }
        }
      }
    }

    console.log('-'.repeat(80));
    console.log(`  VALOR BASE (yearStartValue): ${yearStartValue.toFixed(2).padStart(12)}€`);
    console.log(`  VALOR AÑADIDO (sin registro): ${missingInvestments.reduce((sum, inv) => sum + inv.value, 0).toFixed(2).padStart(12)}€`);
    console.log(`  VALOR REAL AL INICIO DEL AÑO: ${actualYearStartValue.toFixed(2).padStart(12)}€\n`);

    // Calcular aportaciones en 2026
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map(inv => inv._id) }
    }).sort({ date: 1 });

    let capitalAddedToOldInvestments = 0;
    let capitalAddedToNewInvestments = 0;
    let capitalWithdrawnThisYear = 0;

    const contributions2026 = [];

    console.log('💰 APORTACIONES Y RETIROS EN 2026:');
    console.log('-'.repeat(80));

    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);
      
      if (entryDate >= yearStart) {
        if (entry.operation === 'creation') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.totalValue) {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            capitalAddedToNewInvestments += amount;
            contributions2026.push({
              date: entry.date.toISOString().split('T')[0],
              operation: entry.operation,
              investment: entry.investment?.name || 'N/A',
              amount: amount,
              type: 'new'
            });
            console.log(`  ${entry.date.toISOString().split('T')[0]} - ${entry.operation.padEnd(10)} - ${(entry.investment?.name || 'N/A').padEnd(40)} +${amount.toFixed(2).padStart(10)}€ (NUEVA)`);
          }
        } else if (entry.operation === 'add') {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            capitalAddedToOldInvestments += amount;
            contributions2026.push({
              date: entry.date.toISOString().split('T')[0],
              operation: entry.operation,
              investment: entry.investment?.name || 'N/A',
              amount: amount,
              type: 'old'
            });
            console.log(`  ${entry.date.toISOString().split('T')[0]} - ${entry.operation.padEnd(10)} - ${(entry.investment?.name || 'N/A').padEnd(40)} +${amount.toFixed(2).padStart(10)}€ (EXISTENTE)`);
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
            amount: -amount,
            type: 'withdraw'
          });
          console.log(`  ${entry.date.toISOString().split('T')[0]} - ${entry.operation.padEnd(10)} - ${(entry.investment?.name || 'N/A').padEnd(40)} -${amount.toFixed(2).padStart(10)}€`);
        }
      }
    }

    if (contributions2026.length === 0) {
      console.log('  (No hay aportaciones ni retiros en 2026)');
    }

    console.log('-'.repeat(80));
    console.log(`  Aportaciones a inversiones NUEVAS: ${capitalAddedToNewInvestments.toFixed(2).padStart(12)}€`);
    console.log(`  Aportaciones a inversiones EXISTENTES: ${capitalAddedToOldInvestments.toFixed(2).padStart(12)}€`);
    console.log(`  Retiros: ${capitalWithdrawnThisYear.toFixed(2).padStart(12)}€\n`);

    // Calcular rendimiento anual
    const annualReturn = currentValue - actualYearStartValue - capitalAddedToOldInvestments + capitalWithdrawnThisYear;
    const baseValue = actualYearStartValue + capitalAddedToOldInvestments - capitalWithdrawnThisYear;
    const annualReturnPercent = baseValue > 0 ? ((annualReturn / baseValue) * 100) : 0;

    console.log('📈 CÁLCULO DEL RENDIMIENTO ANUAL:');
    console.log('='.repeat(80));
    console.log(`Fórmula: annualReturn = currentValue - actualYearStartValue - capitalAddedToOldInvestments + capitalWithdrawnThisYear\n`);
    console.log(`  Valor actual:                    ${currentValue.toFixed(2).padStart(15)}€`);
    console.log(`  Valor al inicio del año:          ${actualYearStartValue.toFixed(2).padStart(15)}€`);
    console.log(`  Aportaciones a existentes:        ${capitalAddedToOldInvestments.toFixed(2).padStart(15)}€`);
    console.log(`  Retiros:                          ${capitalWithdrawnThisYear.toFixed(2).padStart(15)}€`);
    console.log(`  ─────────────────────────────────────────────────────────────`);
    console.log(`  RENDIMIENTO ANUAL:                 ${annualReturn.toFixed(2).padStart(15)}€`);
    console.log(`  RENDIMIENTO ANUAL (%):              ${annualReturnPercent.toFixed(2).padStart(15)}%\n`);

    // Desglose por inversión
    console.log('📊 DESGLOSE POR INVERSIÓN:');
    console.log('='.repeat(80));
    console.log('Inversión'.padEnd(50) + 'Valor 1/1'.padStart(15) + 'Valor Actual'.padStart(15) + 'Cambio'.padStart(15));
    console.log('-'.repeat(95));

    // Calcular valor al 1/1 por inversión
    const investmentYearStartValues = new Map();
    
    // Inversiones con DailyVariation al 31/12
    variationsDec31.forEach(v => {
      const invId = v.investment.toString();
      investmentYearStartValues.set(invId, v.totalValue || 0);
    });

    // Inversiones sin registro
    missingInvestments.forEach(inv => {
      const investment = investments.find(i => i.name === inv.name);
      if (investment) {
        const invId = investment._id.toString();
        if (!investmentYearStartValues.has(invId)) {
          investmentYearStartValues.set(invId, inv.value);
        }
      }
    });

    investments.forEach(inv => {
      const invId = inv._id.toString();
      const invCurrentValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      
      const invYearStartValue = investmentYearStartValues.get(invId) || 0;
      const invChange = invCurrentValue - invYearStartValue;
      
      // Verificar si hay aportaciones a esta inversión en 2026
      const contributionsToThisInv = contributions2026.filter(c => {
        const entry = allHistoryEntries.find(e => 
          e.investment?.toString() === invId && 
          new Date(e.date).toISOString().split('T')[0] === c.date
        );
        return entry && (entry.operation === 'add' || entry.operation === 'creation');
      });

      if (invYearStartValue > 0 || invCurrentValue > 0 || contributionsToThisInv.length > 0) {
        const name = inv.name.padEnd(50);
        const startVal = invYearStartValue.toFixed(2).padStart(15);
        const currentVal = invCurrentValue.toFixed(2).padStart(15);
        const change = invChange.toFixed(2).padStart(15);
        const contribs = contributionsToThisInv.length > 0 
          ? ` (+${contributionsToThisInv.reduce((sum, c) => sum + c.amount, 0).toFixed(2)}€ aportaciones)`
          : '';
        
        console.log(`${name}${startVal}€${currentVal}€${change}€${contribs}`);
      }
    });

    console.log('-'.repeat(95));
    console.log(`${'TOTAL'.padEnd(50)}${actualYearStartValue.toFixed(2).padStart(15)}€${currentValue.toFixed(2).padStart(15)}€${annualReturn.toFixed(2).padStart(15)}€\n`);

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

justifyAnnualReturn();
