import mongoose from 'mongoose';
import InvestmentHistory from '../models/InvestmentHistory.js';
import Investment from '../models/Investment.js';
import SubAccount from '../models/SubAccount.js';
import Account from '../models/Account.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, '../.env') });

async function checkTelefonicaDetail() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar la inversión Telefónica
    const telefonica = await Investment.findOne({ 
      name: { $regex: /Telefónica/i },
      user: 'ana'
    })
      .populate('subAccount')
      .populate('account');

    if (!telefonica) {
      console.log('❌ No se encontró la inversión Telefónica');
      await mongoose.disconnect();
      return;
    }

    console.log(`📊 Inversión: ${telefonica.name}`);
    console.log(`   Cuenta: ${telefonica.account?.name || 'N/A'}`);
    console.log(`   Subcuenta: ${telefonica.subAccount?.name || 'N/A'}`);
    console.log(`   Símbolo: ${telefonica.symbol || 'N/A'}`);
    console.log(`   Cantidad: ${telefonica.quantity || 0}`);
    console.log(`   Precio actual: ${telefonica.currentPrice || 0}€`);
    console.log(`   Precio compra: ${telefonica.purchasePrice || telefonica.averagePurchasePrice || 'N/A'}€`);
    console.log(`   Valor actual: ${telefonica.isAutomatedPortfolio ? telefonica.currentPrice : (telefonica.quantity || 0) * (telefonica.currentPrice || 0)}€`);
    console.log('');

    // Obtener todas las entradas de historial
    const history = await InvestmentHistory.find({
      investment: telefonica._id,
      user: 'ana'
    })
      .sort({ date: 1 });

    console.log(`📋 Total de entradas de historial: ${history.length}\n`);

    if (history.length === 0) {
      console.log('⚠️  No hay entradas de historial');
      await mongoose.disconnect();
      return;
    }

    console.log('📅 Historial completo:');
    console.log('-'.repeat(100));
    console.log('Fecha'.padEnd(12) + 'Operación'.padEnd(12) + 'Cantidad'.padEnd(12) + 'Precio'.padEnd(12) + 'Total Value'.padEnd(15) + 'Operation Amount'.padEnd(18) + 'Notas');
    console.log('-'.repeat(100));

    let totalInvested = 0;

    for (const entry of history) {
      const dateStr = entry.date.toISOString().split('T')[0];
      const operation = (entry.operation || 'update').padEnd(11);
      const quantity = (entry.quantity || 0).toFixed(2).padStart(10);
      const price = (entry.currentPrice || entry.operationPrice || 0).toFixed(2).padStart(10);
      const totalValue = (entry.totalValue || 0).toFixed(2).padStart(13);
      const operationAmount = (entry.operationAmount !== null && entry.operationAmount !== undefined 
        ? entry.operationAmount.toFixed(2) 
        : 'null').padStart(16);
      const notes = entry.notes || '';

      console.log(
        dateStr.padEnd(12) +
        operation +
        quantity + '€' +
        price + '€' +
        totalValue + '€' +
        operationAmount + '€' +
        notes.substring(0, 30)
      );

      // Calcular capital invertido
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
          totalInvested += amount;
          console.log(`  → Capital añadido: ${amount.toFixed(2)}€ (total acumulado: ${totalInvested.toFixed(2)}€)`);
        }
      } else if (entry.operation === 'sell' || entry.operation === 'withdraw') {
        let amount = entry.operationAmount;
        if (!amount || amount === 0) {
          if (entry.operationPrice && entry.quantity) {
            amount = entry.operationPrice * entry.quantity;
          }
        }
        amount = Math.abs(amount || 0);
        totalInvested -= amount;
        console.log(`  → Capital retirado: ${amount.toFixed(2)}€ (total acumulado: ${totalInvested.toFixed(2)}€)`);
      }
    }

    console.log('-'.repeat(100));
    console.log(`\n💰 Capital invertido total: ${totalInvested.toFixed(2)}€`);
    
    const currentValue = telefonica.isAutomatedPortfolio
      ? telefonica.currentPrice || 0
      : (telefonica.quantity || 0) * (telefonica.currentPrice || 0);
    
    console.log(`💵 Valor actual: ${currentValue.toFixed(2)}€`);
    console.log(`📈 Rendimiento: ${(currentValue - totalInvested).toFixed(2)}€ (${totalInvested > 0 ? (((currentValue / totalInvested) - 1) * 100).toFixed(2) : 0}%)`);

    // Verificar si hay discrepancias
    console.log('\n🔍 Análisis:');
    if (totalInvested > currentValue * 2) {
      console.log('⚠️  El capital invertido es más del doble del valor actual. Posibles causas:');
      console.log('   1. Se vendió parte de la inversión pero no se registró como "sell" o "withdraw"');
      console.log('   2. El operationAmount de alguna operación está incorrecto');
      console.log('   3. La cantidad actual es incorrecta');
    }
    
    if (telefonica.quantity && telefonica.currentPrice) {
      const expectedValue = telefonica.quantity * telefonica.currentPrice;
      if (Math.abs(expectedValue - currentValue) > 1) {
        console.log(`⚠️  Discrepancia: Valor calculado (${expectedValue.toFixed(2)}€) vs Valor actual (${currentValue.toFixed(2)}€)`);
      }
    }

    await mongoose.disconnect();
    console.log('\n✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkTelefonicaDetail();
