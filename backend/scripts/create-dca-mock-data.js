import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

// Importar modelos
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import SubAccount from "../models/SubAccount.js";

async function createDCAMockData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "test-dca";

    // Buscar la inversión de prueba
    const investment = await Investment.findOne({
      user: userId,
      name: "Inversión DCA Test",
    });

    if (!investment) {
      console.error(
        "❌ No se encontró la inversión de prueba. Ejecuta primero create-test-dca-investment.js",
      );
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(`📊 Inversión encontrada: ${investment.name}`);
    console.log(`   - Cantidad actual: ${investment.quantity}`);
    console.log(`   - Precio medio: ${investment.averagePurchasePrice}€`);
    console.log(`   - Precio actual: ${investment.currentPrice}€`);
    console.log(
      `   - Valor total: ${investment.quantity * investment.currentPrice}€\n`,
    );

    // Eliminar historial existente para empezar limpio
    await InvestmentHistory.deleteMany({
      user: userId,
      investment: investment._id,
    });
    console.log("🗑️  Historial anterior eliminado\n");

    // Configuración de la simulación
    const startDate = new Date("2024-01-01");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Precio inicial
    let currentPrice = 150.0;
    let quantity = 10;
    let averagePurchasePrice = 150.0;
    let totalInvested = 1500.0; // 10 acciones * 150€

    // Crear registro inicial
    const initialHistory = new InvestmentHistory({
      user: userId,
      investment: investment._id,
      date: startDate,
      currentPrice: currentPrice,
      quantity: quantity,
      totalValue: quantity * currentPrice,
      notes: "Compra inicial",
      operation: "creation",
      operationAmount: totalInvested,
      operationPrice: currentPrice,
    });
    await initialHistory.save();
    console.log(
      `✅ Registro inicial creado: ${startDate.toLocaleDateString("es-ES")} - ${quantity} acciones a ${currentPrice}€`,
    );

    // Simular compras DCA mensuales desde febrero 2024 hasta hoy
    const dcaDate = new Date("2024-02-15"); // Primera compra DCA
    const dcaAmount = 500; // 500€ por compra
    let historyEntries = [];

    while (dcaDate <= today) {
      // Simular variación de precio (entre -5% y +5% respecto al precio anterior)
      const priceVariation = Math.random() * 0.1 - 0.05; // -5% a +5%
      currentPrice = currentPrice * (1 + priceVariation);
      currentPrice = Math.round(currentPrice * 100) / 100; // Redondear a 2 decimales

      // Calcular cantidad a comprar con DCA
      const quantityToBuy = dcaAmount / currentPrice;

      // Actualizar cantidad y precio medio
      const newQuantity = quantity + quantityToBuy;
      const newAveragePrice =
        (quantity * averagePurchasePrice + quantityToBuy * currentPrice) /
        newQuantity;

      quantity = newQuantity;
      averagePurchasePrice = newAveragePrice;
      totalInvested += dcaAmount;

      // Crear registro de compra DCA
      const dcaHistory = new InvestmentHistory({
        user: userId,
        investment: investment._id,
        date: new Date(dcaDate),
        currentPrice: currentPrice,
        quantity: quantity,
        totalValue: quantity * currentPrice,
        notes: `Compra DCA automática: ${dcaAmount}€ (${quantityToBuy.toFixed(4)} unidades)`,
        operation: "add",
        operationAmount: dcaAmount,
        operationPrice: currentPrice,
      });
      historyEntries.push(dcaHistory);

      console.log(
        `✅ Compra DCA simulada: ${dcaDate.toLocaleDateString("es-ES")}`,
      );
      console.log(`   - Precio: ${currentPrice.toFixed(2)}€`);
      console.log(
        `   - Cantidad comprada: ${quantityToBuy.toFixed(4)} unidades`,
      );
      console.log(`   - Cantidad total: ${quantity.toFixed(4)} unidades`);
      console.log(`   - Precio medio: ${averagePurchasePrice.toFixed(2)}€`);
      console.log(`   - Valor total: ${(quantity * currentPrice).toFixed(2)}€`);
      console.log(`   - Capital invertido: ${totalInvested.toFixed(2)}€`);
      console.log(
        `   - Ganancia/Pérdida: ${(quantity * currentPrice - totalInvested).toFixed(2)}€ (${(((quantity * currentPrice - totalInvested) / totalInvested) * 100).toFixed(2)}%)\n`,
      );

      // Avanzar al siguiente mes
      dcaDate.setMonth(dcaDate.getMonth() + 1);
    }

    // Guardar todas las entradas de historial
    if (historyEntries.length > 0) {
      await InvestmentHistory.insertMany(historyEntries);
      console.log(
        `✅ ${historyEntries.length} compras DCA guardadas en el historial\n`,
      );
    }

    // Actualizar la inversión con los valores finales
    investment.quantity = quantity;
    investment.averagePurchasePrice = averagePurchasePrice;
    investment.currentPrice = currentPrice;
    investment.dcaNextDate = dcaDate; // Próxima compra sería el siguiente mes
    await investment.save();

    console.log("📊 Resumen final:");
    console.log(`   - Cantidad total: ${quantity.toFixed(4)} unidades`);
    console.log(
      `   - Precio medio de compra: ${averagePurchasePrice.toFixed(2)}€`,
    );
    console.log(`   - Precio actual: ${currentPrice.toFixed(2)}€`);
    console.log(
      `   - Valor total actual: ${(quantity * currentPrice).toFixed(2)}€`,
    );
    console.log(`   - Capital invertido total: ${totalInvested.toFixed(2)}€`);
    console.log(
      `   - Ganancia/Pérdida: ${(quantity * currentPrice - totalInvested).toFixed(2)}€`,
    );
    console.log(
      `   - Rendimiento: ${(((quantity * currentPrice - totalInvested) / totalInvested) * 100).toFixed(2)}%`,
    );
    console.log(
      `   - Próxima compra DCA: ${dcaDate.toLocaleDateString("es-ES")}\n`,
    );

    // Actualizar balance de la subcuenta (restar las compras DCA)
    const subAccount = await SubAccount.findById(investment.subAccount);
    if (subAccount) {
      const totalDCASpent = historyEntries.length * dcaAmount;
      subAccount.balance = subAccount.balance - totalDCASpent;
      await subAccount.save();
      console.log(`💰 Balance de subcuenta actualizado:`);
      console.log(`   - Compras DCA totales: ${totalDCASpent.toFixed(2)}€`);
      console.log(`   - Balance restante: ${subAccount.balance.toFixed(2)}€\n`);
    }

    console.log("✅ Datos mock de DCA creados exitosamente!");

    await mongoose.disconnect();
    console.log("\nDesconectado de MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createDCAMockData();
