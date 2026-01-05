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

async function fixTelefonicaOperationAmount() {
  try {
    // Conectar a MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';
    await mongoose.connect(mongoUri);
    console.log('✅ Conectado a MongoDB\n');

    // Buscar la inversión Telefónica
    const telefonica = await Investment.findOne({ 
      name: { $regex: /Telefónica/i },
      user: 'ana'
    });

    if (!telefonica) {
      console.log('❌ No se encontró la inversión Telefónica');
      await mongoose.disconnect();
      return;
    }

    console.log(`📊 Inversión: ${telefonica.name}`);
    console.log(`   Cantidad actual: ${telefonica.quantity || 0} acciones`);
    console.log(`   Precio actual: ${telefonica.currentPrice || 0}€`);
    console.log(`   Valor actual: ${(telefonica.quantity || 0) * (telefonica.currentPrice || 0)}€`);
    console.log('');

    // Buscar la entrada de creación
    const creationEntry = await InvestmentHistory.findOne({
      investment: telefonica._id,
      user: 'ana',
      operation: 'creation'
    });

    if (!creationEntry) {
      console.log('❌ No se encontró la entrada de creación');
      await mongoose.disconnect();
      return;
    }

    console.log('📋 Entrada de creación actual:');
    console.log(`   Fecha: ${creationEntry.date.toISOString().split('T')[0]}`);
    console.log(`   Cantidad: ${creationEntry.quantity}`);
    console.log(`   Precio: ${creationEntry.currentPrice || creationEntry.operationPrice || 'N/A'}`);
    console.log(`   Total Value: ${creationEntry.totalValue}`);
    console.log(`   Operation Amount: ${creationEntry.operationAmount}`);
    console.log('');

    // Calcular el operationAmount correcto
    const correctQuantity = telefonica.quantity || 0;
    const correctPrice = telefonica.purchasePrice || telefonica.averagePurchasePrice || telefonica.currentPrice || 0;
    const correctOperationAmount = correctQuantity * correctPrice;

    console.log('🔧 Corrección:');
    console.log(`   Cantidad correcta: ${correctQuantity} acciones`);
    console.log(`   Precio correcto: ${correctPrice}€`);
    console.log(`   Operation Amount correcto: ${correctOperationAmount.toFixed(2)}€`);
    console.log('');

    if (Math.abs(creationEntry.operationAmount - correctOperationAmount) < 1) {
      console.log('✅ El operationAmount ya es correcto');
      await mongoose.disconnect();
      return;
    }

    // Actualizar la entrada de creación
    console.log('💾 Actualizando entrada de creación...');
    creationEntry.quantity = correctQuantity;
    creationEntry.operationAmount = correctOperationAmount;
    creationEntry.totalValue = correctOperationAmount;
    if (creationEntry.operationPrice === null || creationEntry.operationPrice === undefined) {
      creationEntry.operationPrice = correctPrice;
    }
    if (creationEntry.currentPrice === null || creationEntry.currentPrice === undefined) {
      creationEntry.currentPrice = correctPrice;
    }
    
    await creationEntry.save();
    console.log('✅ Entrada de creación actualizada');
    console.log('');

    // Verificar el resultado
    const updatedEntry = await InvestmentHistory.findById(creationEntry._id);
    console.log('📋 Entrada de creación actualizada:');
    console.log(`   Cantidad: ${updatedEntry.quantity}`);
    console.log(`   Operation Amount: ${updatedEntry.operationAmount.toFixed(2)}€`);
    console.log(`   Total Value: ${updatedEntry.totalValue.toFixed(2)}€`);
    console.log('');

    // Calcular el nuevo rendimiento
    const currentValue = (telefonica.quantity || 0) * (telefonica.currentPrice || 0);
    const newReturn = currentValue - correctOperationAmount;
    const newReturnPercent = correctOperationAmount > 0 ? ((currentValue / correctOperationAmount) - 1) * 100 : 0;

    console.log('📈 Nuevo cálculo de rendimiento:');
    console.log(`   Capital invertido: ${correctOperationAmount.toFixed(2)}€`);
    console.log(`   Valor actual: ${currentValue.toFixed(2)}€`);
    console.log(`   Rendimiento: ${newReturn >= 0 ? '+' : ''}${newReturn.toFixed(2)}€ (${newReturnPercent.toFixed(2)}%)`);
    console.log('');

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
    console.log('\n💡 Recarga el dashboard para ver los cambios');
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

fixTelefonicaOperationAmount();
