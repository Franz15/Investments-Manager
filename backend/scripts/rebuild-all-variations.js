/**
 * Script para recalcular TODAS las DailyVariation de TODAS las inversiones
 * (activas y cerradas) usando el variationEngine corregido.
 * Luego recalcula las PeriodVariations.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

async function rebuildAll() {
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

  // Obtener todos los usuarios con inversiones
  const users = await Investment.distinct("user");
  console.log(`Usuarios con inversiones: ${users.length}`);

  for (const userId of users) {
    console.log(`\n=== Usuario: ${userId} ===`);

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    console.log(`Inversiones: ${investments.length}`);

    for (const inv of investments) {
      const isClosed = inv.status === "closed";
      const label = `${inv.name} (${isClosed ? "cerrada" : "activa"})`;

      // Obtener toda la historia
      const allHistory = await InvestmentHistory.find({
        investment: inv._id,
        user: userId,
      }).sort({ date: 1 });

      if (allHistory.length === 0) {
        console.log(`  ${label}: sin historial, saltando`);
        continue;
      }

      // Eliminar todas las DV existentes
      await DailyVariation.deleteMany({ investment: inv._id });

      // Recalcular DV
      const dailyVariations = buildDailyVariationsFromHistory(allHistory, null);

      // Si está cerrada, verificar que la última DV tiene totalValue=0
      if (isClosed && dailyVariations.length > 0) {
        const lastDv = dailyVariations[dailyVariations.length - 1];
        if (lastDv.totalValue !== 0) {
          // Forzar a 0 (puede pasar si no hay withdraw explícito)
          const prevDv =
            dailyVariations.length > 1
              ? dailyVariations[dailyVariations.length - 2]
              : null;
          const prevValue = prevDv?.totalValue || 0;
          lastDv.changeAmount = 0 - prevValue - lastDv.capitalChange;
          lastDv.changePercent =
            prevValue > 0 ? (lastDv.changeAmount / prevValue) * 100 : 0;
          lastDv.totalValue = 0;
        }
      }

      // Insertar nuevas DV
      let totalChange = 0;
      for (const dv of dailyVariations) {
        await DailyVariation.create({
          investment: inv._id,
          user: userId,
          date: dv.date,
          totalValue: dv.totalValue,
          changeAmount: parseFloat(dv.changeAmount.toFixed(2)),
          changePercent: parseFloat(dv.changePercent.toFixed(2)),
        });
        totalChange += dv.changeAmount;
      }

      // Si está cerrada, eliminar DV posteriores al cierre
      if (isClosed && inv.closedAt) {
        const closeDate = new Date(inv.closedAt);
        closeDate.setHours(0, 0, 0, 0);
        const dayAfterClose = new Date(closeDate);
        dayAfterClose.setDate(dayAfterClose.getDate() + 1);
        // Buscar la fecha real del último withdraw
        let realCloseDate = closeDate;
        for (let i = allHistory.length - 1; i >= 0; i--) {
          const entry = allHistory[i];
          if (
            (entry.operation === "withdraw" || entry.operation === "sell") &&
            (entry.quantity === 0 || entry.totalValue === 0)
          ) {
            realCloseDate = new Date(entry.date);
            realCloseDate.setHours(0, 0, 0, 0);
            break;
          }
        }
        await DailyVariation.deleteMany({
          investment: inv._id,
          date: { $gt: realCloseDate },
        });
      }

      console.log(
        `  ${label}: ${dailyVariations.length} DVs, totalChange=${totalChange.toFixed(2)}€`,
      );
    }

    // Recalcular PeriodVariations
    console.log(`  Recalculando PeriodVariations...`);
    const result = await recalculateAllPeriodVariations(userId);
    console.log(`  ${result.message}`);
  }

  await mongoose.disconnect();
  console.log("\nHecho");
}

rebuildAll().catch(console.error);
