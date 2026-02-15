/**
 * Script para RECONSTRUIR completamente las DailyVariation de inversiones cerradas:
 * 1. Elimina TODAS las DailyVariation de la inversión
 * 2. Recalcula desde cero usando InvestmentHistory + variationEngine
 * 3. Elimina cualquier DV posterior al cierre
 * 4. Recalcula PeriodVariations
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

async function rebuild() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Conectado a MongoDB");

  const Investment = (await import("../models/Investment.js")).default;
  const DailyVariation = (await import("../models/DailyVariation.js")).default;
  const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
    .default;
  const { buildDailyVariationsFromHistory } =
    await import("../services/variationEngine.js");
  const { recalculateAllPeriodVariations } =
    await import("../services/periodVariationService.js");

  const closedInvestments = await Investment.find({ status: "closed" });
  console.log(`Inversiones cerradas: ${closedInvestments.length}\n`);

  const affectedUsers = new Set();

  for (const inv of closedInvestments) {
    console.log(`--- [${inv.user}] ${inv.name} ---`);

    // 1. Obtener TODA la historia de la inversión
    const allHistory = await InvestmentHistory.find({
      investment: inv._id,
      user: inv.user,
    }).sort({ date: 1 });

    console.log(`  InvestmentHistory entries: ${allHistory.length}`);

    if (allHistory.length === 0) {
      console.log(`  ⚠ Sin historial, saltando`);
      continue;
    }

    // Encontrar la última operación de cierre (withdraw con totalValue=0 o quantity=0)
    let closeHistoryDate = null;
    for (let i = allHistory.length - 1; i >= 0; i--) {
      const entry = allHistory[i];
      if (
        (entry.operation === "withdraw" || entry.operation === "sell") &&
        (entry.totalValue === 0 || entry.quantity === 0)
      ) {
        closeHistoryDate = new Date(entry.date);
        closeHistoryDate.setHours(0, 0, 0, 0);
        break;
      }
    }

    if (!closeHistoryDate) {
      // Usar closedAt como fallback
      closeHistoryDate = new Date(inv.closedAt);
      closeHistoryDate.setHours(0, 0, 0, 0);
    }

    console.log(
      `  Fecha cierre (historial): ${closeHistoryDate.toISOString().split("T")[0]}`,
    );

    // 2. Eliminar TODAS las DailyVariation existentes
    const deleted = await DailyVariation.deleteMany({ investment: inv._id });
    console.log(`  DailyVariations eliminadas: ${deleted.deletedCount}`);

    // 3. Usar TODA la historia (no filtrar por fecha para evitar problemas de timezone)
    // El variationEngine manejará correctamente las operaciones de capital

    // 4. Recalcular DailyVariations con el variationEngine
    const dailyVariations = buildDailyVariationsFromHistory(allHistory, null);

    console.log(`  DailyVariations calculadas: ${dailyVariations.length}`);

    // 5. Verificar que la última DV tiene totalValue=0
    if (dailyVariations.length > 0) {
      const lastDv = dailyVariations[dailyVariations.length - 1];
      if (lastDv.totalValue !== 0) {
        console.log(
          `  ⚠ Última DV totalValue=${lastDv.totalValue?.toFixed(2)} (no se pudo forzar a 0 automáticamente)`,
        );
      } else {
        console.log(`  ✅ Última DV totalValue=0`);
      }
    }

    // 6. Insertar las DailyVariations recalculadas
    let inserted = 0;
    let totalMarketGain = 0;
    for (const dv of dailyVariations) {
      await DailyVariation.create({
        investment: inv._id,
        user: inv.user,
        date: dv.date,
        totalValue: dv.totalValue,
        changeAmount: parseFloat(dv.changeAmount.toFixed(2)),
        changePercent: parseFloat(dv.changePercent.toFixed(2)),
      });
      totalMarketGain += dv.changeAmount;
      inserted++;
    }

    console.log(`  DailyVariations insertadas: ${inserted}`);
    console.log(`  Total market gain: ${totalMarketGain.toFixed(2)}€`);
    console.log(
      `  closeSummary result: ${inv.closeSummary?.resultAmount?.toFixed(2) || "N/A"}€`,
    );

    // Verificar discrepancia
    const diff = Math.abs(
      totalMarketGain - (inv.closeSummary?.resultAmount || 0),
    );
    if (diff > 1) {
      console.log(
        `  ⚠ Discrepancia de ${diff.toFixed(2)}€ entre DV sum y closeSummary`,
      );
    } else {
      console.log(`  ✅ Coincide`);
    }

    affectedUsers.add(inv.user);
  }

  // 7. Recalcular PeriodVariations
  console.log(`\nRecalculando PeriodVariations...`);
  for (const userId of affectedUsers) {
    console.log(`  ${userId}...`);
    const result = await recalculateAllPeriodVariations(userId);
    console.log(`  ${result.message}`);
  }

  await mongoose.disconnect();
  console.log("\nHecho");
}

rebuild().catch(console.error);
