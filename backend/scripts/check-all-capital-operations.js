import mongoose from 'mongoose';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

async function checkAllCapitalOperations() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Obtener todos los usuarios únicos
    const users = await InvestmentHistory.distinct('user');
    console.log(`📊 Encontrados ${users.length} usuario(s)\n`);

    for (const userId of users) {
      if (!userId || userId === 'null') continue;

      console.log(`\n${'='.repeat(80)}`);
      console.log(`👤 Usuario: ${userId}`);
      console.log('='.repeat(80));

      // Obtener todas las inversiones
      const allInvestments = await Investment.find({ user: userId });
      if (allInvestments.length === 0) {
        console.log('✅ No hay inversiones\n');
        continue;
      }

      // Obtener todas las entradas de historial
      const allHistoryEntries = await InvestmentHistory.find({
        user: userId,
        investment: { $in: allInvestments.map(inv => inv._id) }
      })
        .populate('investment')
        .sort({ date: 1 });

      if (allHistoryEntries.length === 0) {
        console.log('✅ No hay entradas de historial\n');
        continue;
      }

      console.log(`\n📋 Total de entradas de historial: ${allHistoryEntries.length}\n`);

      let totalAdded = 0;
      let totalSubtracted = 0;
      const operationsByType = {
        creation: [],
        add: [],
        withdraw: [],
        sell: [],
        update: []
      };

      for (const entry of allHistoryEntries) {
        const invName = entry.investment?.name || 'Inversión no encontrada';
        const invId = entry.investment?._id?.toString() || entry.investment?.toString() || 'N/A';

        let amount = 0;
        let calculatedFrom = '';

        if (entry.operation === 'creation' || entry.operation === 'add') {
          amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
              calculatedFrom = `(calculado: ${entry.operationPrice} * ${entry.quantity})`;
            } else if (entry.totalValue && entry.operation === 'creation') {
              amount = entry.totalValue;
              calculatedFrom = `(usando totalValue)`;
            }
          }
          amount = amount || 0;
          
          if (amount < 0) {
            console.log(`⚠️  OPERACIÓN ${entry.operation.toUpperCase()} CON AMOUNT NEGATIVO:`);
            console.log(`     Fecha: ${entry.date.toISOString().split('T')[0]}`);
            console.log(`     Inversión: ${invName}`);
            console.log(`     Amount: ${amount}`);
            console.log(`     operationAmount (BD): ${entry.operationAmount}`);
            console.log(`     totalValue: ${entry.totalValue}`);
            console.log('');
            amount = 0; // Ignorar amounts negativos
          }
          
          totalAdded += amount;
          operationsByType[entry.operation].push({
            date: entry.date,
            investment: invName,
            amount: amount,
            operationAmount: entry.operationAmount,
            operationPrice: entry.operationPrice,
            quantity: entry.quantity,
            totalValue: entry.totalValue,
            calculatedFrom
          });
        } else if (entry.operation === 'sell' || entry.operation === 'withdraw') {
          amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
              calculatedFrom = `(calculado: ${entry.operationPrice} * ${entry.quantity})`;
            }
          }
          amount = Math.abs(amount || 0);
          totalSubtracted += amount;
          operationsByType[entry.operation].push({
            date: entry.date,
            investment: invName,
            amount: amount,
            operationAmount: entry.operationAmount,
            operationPrice: entry.operationPrice,
            quantity: entry.quantity,
            totalValue: entry.totalValue,
            calculatedFrom
          });
        } else {
          operationsByType[entry.operation].push({
            date: entry.date,
            investment: invName,
            totalValue: entry.totalValue
          });
        }
      }

      console.log('\n📊 Resumen por tipo de operación:');
      console.log('-'.repeat(80));
      for (const [opType, ops] of Object.entries(operationsByType)) {
        if (ops.length > 0) {
          console.log(`\n  ${opType.toUpperCase()}: ${ops.length} operación(es)`);
          if (opType === 'creation' || opType === 'add') {
            const total = ops.reduce((sum, op) => sum + op.amount, 0);
            console.log(`    Total añadido: ${total.toFixed(2)}€`);
            // Mostrar las 5 más grandes
            const sorted = ops.sort((a, b) => b.amount - a.amount).slice(0, 5);
            for (const op of sorted) {
              console.log(`      - ${op.date.toISOString().split('T')[0]}: ${op.amount.toFixed(2)}€ - ${op.investment} ${op.calculatedFrom || ''}`);
            }
          } else if (opType === 'withdraw' || opType === 'sell') {
            const total = ops.reduce((sum, op) => sum + op.amount, 0);
            console.log(`    Total restado: ${total.toFixed(2)}€`);
            for (const op of ops) {
              console.log(`      - ${op.date.toISOString().split('T')[0]}: ${op.amount.toFixed(2)}€ - ${op.investment} ${op.calculatedFrom || ''}`);
            }
          }
        }
      }

      console.log('\n💰 Totales:');
      console.log('-'.repeat(80));
      console.log(`  Capital añadido (creation + add): ${totalAdded.toFixed(2)}€`);
      console.log(`  Capital restado (withdraw + sell): ${totalSubtracted.toFixed(2)}€`);
      console.log(`  Capital neto invertido: ${(totalAdded - totalSubtracted).toFixed(2)}€`);

      // Calcular valor actual
      let currentValue = 0;
      for (const inv of allInvestments) {
        if (inv.isAutomatedPortfolio) {
          currentValue += inv.currentPrice || 0;
        } else {
          currentValue += (inv.quantity || 0) * (inv.currentPrice || 0);
        }
      }

      const netInvestedCapital = totalAdded - totalSubtracted;
      const totalReturn = currentValue - netInvestedCapital;
      const totalReturnPercent = netInvestedCapital > 0 ? ((currentValue / netInvestedCapital) - 1) * 100 : 0;

      console.log(`  Valor actual total: ${currentValue.toFixed(2)}€`);
      console.log(`  Rendimiento acumulado: ${totalReturn.toFixed(2)}€ (${totalReturnPercent.toFixed(2)}%)`);
      console.log('');

      // Buscar operaciones sospechosas
      console.log('\n🔍 Buscando operaciones sospechosas:');
      console.log('-'.repeat(80));
      let foundSuspicious = false;

      for (const entry of allHistoryEntries) {
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

          // Verificar si el amount es muy diferente del totalValue
          if (entry.totalValue && Math.abs(amount - entry.totalValue) > 100) {
            const investment = allInvestments.find(inv => 
              inv._id.toString() === (entry.investment?._id?.toString() || entry.investment?.toString())
            );
            if (investment) {
              foundSuspicious = true;
              console.log(`\n⚠️  Diferencia significativa entre operationAmount y totalValue:`);
              console.log(`     Fecha: ${entry.date.toISOString().split('T')[0]}`);
              console.log(`     Operación: ${entry.operation}`);
              console.log(`     Inversión: ${entry.investment?.name || 'N/A'}`);
              console.log(`     operationAmount: ${entry.operationAmount || 'null/undefined'}`);
              console.log(`     Amount calculado: ${amount.toFixed(2)}€`);
              console.log(`     totalValue: ${entry.totalValue.toFixed(2)}€`);
              console.log(`     Diferencia: ${Math.abs(amount - entry.totalValue).toFixed(2)}€`);
            }
          }
        }
      }

      if (!foundSuspicious) {
        console.log('✅ No se encontraron operaciones sospechosas');
      }
      console.log('');
    }

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkAllCapitalOperations();
