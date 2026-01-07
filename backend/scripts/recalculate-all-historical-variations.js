import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import { calculateHistoricalVariations } from "../services/historicalVariationService.js";

dotenv.config();

async function recalculateAll() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI ||
        "mongodb://localhost:27017/investments-manager",
    );
    console.log("✅ Conectado a MongoDB\n");

    // Obtener todas las inversiones que tienen símbolo y no son carteras automatizadas
    const investments = await Investment.find({
      symbol: { $exists: true, $ne: null, $ne: "" },
      isAutomatedPortfolio: { $ne: true },
      purchaseDate: { $exists: true, $ne: null },
    });

    console.log(
      `📊 Encontradas ${investments.length} inversiones para recalcular\n`,
    );

    let success = 0;
    let failed = 0;

    for (const investment of investments) {
      try {
        console.log(
          `🔄 Procesando: ${investment.name} (${investment.symbol})...`,
        );

        // Obtener el userId de la inversión
        const userId = investment.user;

        // Eliminar variaciones existentes para recalcular desde cero
        const DailyVariation = (await import("../models/DailyVariation.js"))
          .default;
        await DailyVariation.deleteMany({
          investment: investment._id,
          user: userId,
        });

        const result = await calculateHistoricalVariations(
          investment._id,
          userId,
          investment,
        );

        if (result.calculated > 0) {
          console.log(
            `   ✅ ${result.calculated} variaciones calculadas - ${result.message}`,
          );
          success++;
        } else {
          console.log(`   ⚠️  ${result.message}`);
          failed++;
        }
        console.log("");
      } catch (error) {
        console.log(`   ❌ Error: ${error.message}\n`);
        failed++;
      }
    }

    console.log("\n📊 Resumen:");
    console.log(`   ✅ Exitosas: ${success}`);
    console.log(`   ❌ Fallidas: ${failed}`);
    console.log(`   📦 Total: ${investments.length}\n`);

    await mongoose.disconnect();
    console.log("✅ Desconectado de MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error general:", error);
    process.exit(1);
  }
}

recalculateAll();
