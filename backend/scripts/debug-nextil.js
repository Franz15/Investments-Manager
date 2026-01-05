import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Investment from '../models/Investment.js';
import DailyVariation from '../models/DailyVariation.js';
import InvestmentHistory from '../models/InvestmentHistory.js';

dotenv.config();

async function debugNextil() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager');
    console.log('✅ Conectado a MongoDB\n');

    // Buscar Nextil (sin filtrar por usuario primero para ver todos)
    const nextil = await Investment.findOne({ 
      name: { $regex: /Nextil/i }
    });
    
    if (!nextil) {
      console.log('❌ No se encontró Nextil');
      await mongoose.disconnect();
      return;
    }
    
    const userId = nextil.user;
    console.log(`👤 Usuario: ${userId}\n`);

    if (!nextil) {
      console.log('❌ No se encontró Nextil');
      await mongoose.disconnect();
      return;
    }

    console.log('📊 Información de Nextil:');
    console.log(`   ID: ${nextil._id}`);
    console.log(`   Nombre: ${nextil.name}`);
    console.log(`   Símbolo: ${nextil.symbol}`);
    console.log(`   Cantidad: ${nextil.quantity}`);
    console.log(`   Precio actual: ${nextil.currentPrice}`);
    console.log(`   Valor actual: ${nextil.quantity * nextil.currentPrice}`);
    console.log(`   Fecha compra: ${nextil.purchaseDate}`);
    console.log('');

    // Obtener todas las variaciones diarias
    const variations = await DailyVariation.find({
      investment: nextil._id,
      user: userId
    }).sort({ date: 1 });

    console.log(`📈 Variaciones diarias guardadas (${variations.length}):`);
    variations.forEach(v => {
      const date = new Date(v.date).toLocaleDateString('es-ES');
      console.log(`   ${date}: Valor=${v.totalValue.toFixed(2)}€, Cambio=${v.changeAmount.toFixed(2)}€ (${v.changePercent.toFixed(2)}%)`);
    });
    console.log('');

    // Obtener historial de inversiones
    const history = await InvestmentHistory.find({
      investment: nextil._id,
      user: userId
    }).sort({ date: 1 });

    console.log(`📝 Historial de inversiones (${history.length}):`);
    history.forEach(h => {
      const date = new Date(h.date).toLocaleDateString('es-ES');
      console.log(`   ${date} [${h.operation}]: Precio=${h.currentPrice}, Cantidad=${h.quantity}, ValorTotal=${h.totalValue?.toFixed(2) || 'N/A'}€, OperationAmount=${h.operationAmount || 'N/A'}`);
    });
    console.log('');

    // Verificar el valor del 31 de diciembre específicamente
    const dec31 = new Date('2024-12-31');
    dec31.setHours(0, 0, 0, 0);
    const dec31End = new Date(dec31);
    dec31End.setDate(dec31End.getDate() + 1);

    const dec31Variation = await DailyVariation.findOne({
      investment: nextil._id,
      user: userId,
      date: { $gte: dec31, $lt: dec31End }
    });

    if (dec31Variation) {
      console.log('🔍 Variación del 31 de diciembre:');
      console.log(`   Valor: ${dec31Variation.totalValue}€`);
      console.log(`   Cambio: ${dec31Variation.changeAmount}€ (${dec31Variation.changePercent}%)`);
      console.log(`   Fecha guardada: ${dec31Variation.date}`);
      console.log('');
    }

    await mongoose.disconnect();
    console.log('✅ Desconectado de MongoDB');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

debugNextil();
