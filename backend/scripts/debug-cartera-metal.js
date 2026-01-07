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
import DailyVariation from "../models/DailyVariation.js";

async function debugCarteraMetal() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "javier";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`DEBUG DE CARTERA METAL PARA: ${userId}`);
    console.log("=".repeat(80));

    // Buscar la inversión "Cartera Metal"
    const carteraMetal = await Investment.findOne({
      user: userId,
      name: { $regex: /Cartera Metal/i },
    });

    if (!carteraMetal) {
      console.log('\n❌ No se encontró la inversión "Cartera Metal"');
      await mongoose.disconnect();
      return;
    }

    console.log(`\n1. INVERSIÓN ACTUAL:`);
    console.log(`   ID: ${carteraMetal._id}`);
    console.log(`   Nombre: ${carteraMetal.name}`);
    console.log(`   Fecha compra: ${carteraMetal.purchaseDate}`);
    const currentValue = carteraMetal.isAutomatedPortfolio
      ? carteraMetal.currentPrice || 0
      : (carteraMetal.quantity || 0) * (carteraMetal.currentPrice || 0);
    console.log(`   Valor actual: ${currentValue.toFixed(2)}€`);

    // Obtener TODOS los registros de InvestmentHistory (incluyendo de inversiones eliminadas)
    const allHistory = await InvestmentHistory.find({
      user: userId,
      $or: [
        { investment: carteraMetal._id },
        { "investment.name": { $regex: /Cartera Metal/i } },
      ],
    }).sort({ date: 1 });

    console.log(`\n2. REGISTROS DE InvestmentHistory:`);
    console.log(`   Total: ${allHistory.length}`);

    // Agrupar por investment ID
    const historyByInvestment = {};
    allHistory.forEach((entry) => {
      const invId = entry.investment?.toString() || entry.investment;
      if (!historyByInvestment[invId]) {
        historyByInvestment[invId] = [];
      }
      historyByInvestment[invId].push(entry);
    });

    Object.keys(historyByInvestment).forEach((invId) => {
      const entries = historyByInvestment[invId];
      const isCurrent = invId === carteraMetal._id.toString();
      console.log(
        `\n   ${isCurrent ? "✅ ACTUAL" : "❌ ELIMINADA"} - Investment ID: ${invId}`,
      );
      console.log(`   Registros: ${entries.length}`);
      entries.forEach((entry) => {
        console.log(
          `     - ${entry.date.toISOString().split("T")[0]}: ${entry.operation} | totalValue: ${entry.totalValue?.toFixed(2) || "N/A"}€ | operationAmount: ${entry.operationAmount?.toFixed(2) || "N/A"}€`,
        );
      });
    });

    // Obtener TODOS los registros de DailyVariation
    const allVariations = await DailyVariation.find({
      user: userId,
      $or: [{ investment: carteraMetal._id }],
    }).sort({ date: 1 });

    console.log(`\n3. REGISTROS DE DailyVariation:`);
    console.log(`   Total: ${allVariations.length}`);
    allVariations.forEach((v) => {
      const isCurrent = v.investment.toString() === carteraMetal._id.toString();
      console.log(
        `   ${isCurrent ? "✅" : "❌"} ${v.date.toISOString().split("T")[0]}: ${v.totalValue.toFixed(2)}€ (Investment: ${v.investment})`,
      );
    });

    // Verificar si hay otra inversión con el mismo nombre o similar
    const allInvestmentsWithSimilarName = await Investment.find({
      user: userId,
      name: { $regex: /Metal/i },
    });

    console.log(`\n4. OTRAS INVERSIONES CON "METAL" EN EL NOMBRE:`);
    console.log(`   Total: ${allInvestmentsWithSimilarName.length}`);
    allInvestmentsWithSimilarName.forEach((inv) => {
      const isCurrent = inv._id.toString() === carteraMetal._id.toString();
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      console.log(
        `   ${isCurrent ? "✅ ACTUAL" : "❌ ELIMINADA"} - ${inv.name} (${inv._id}): ${value.toFixed(2)}€`,
      );
    });

    // Verificar valor al 31/12/2025
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);

    console.log(`\n5. VALOR AL 31/12/2025:`);
    const variationDec31 = await DailyVariation.findOne({
      user: userId,
      investment: carteraMetal._id,
      date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
    });

    if (variationDec31) {
      console.log(
        `   DailyVariation: ${variationDec31.totalValue.toFixed(2)}€`,
      );
      console.log(
        `   Diferencia con valor actual: ${(currentValue - variationDec31.totalValue).toFixed(2)}€`,
      );
    } else {
      console.log(`   ❌ No hay DailyVariation al 31/12`);

      // Buscar en InvestmentHistory
      const historyDec31 = await InvestmentHistory.findOne({
        user: userId,
        investment: carteraMetal._id,
        date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
        totalValue: { $exists: true, $ne: null, $gt: 0 },
      })
        .sort({ date: -1 })
        .limit(1);

      if (historyDec31) {
        console.log(
          `   InvestmentHistory: ${historyDec31.totalValue.toFixed(2)}€`,
        );
        console.log(
          `   Diferencia con valor actual: ${(currentValue - historyDec31.totalValue).toFixed(2)}€`,
        );
      } else {
        console.log(`   ❌ No hay InvestmentHistory al 31/12`);
      }
    }

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

debugCarteraMetal();
