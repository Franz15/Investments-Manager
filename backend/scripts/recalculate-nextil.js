import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import DailyVariation from "../models/DailyVariation.js";
import { calculateHistoricalVariations } from "../services/historicalVariationService.js";

dotenv.config();

async function recalculateNextil() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI ||
        "mongodb://localhost:27017/investments-manager",
    );
    console.log("✅ Conectado a MongoDB\n");

    // Buscar Nextil
    const nextil = await Investment.findOne({
      name: { $regex: /Nextil/i },
    });

    if (!nextil) {
      console.log("❌ No se encontró Nextil");
      await mongoose.disconnect();
      return;
    }

    console.log(
      `🔄 Recalculando variaciones para: ${nextil.name} (${nextil.symbol})\n`,
    );

    // Eliminar todas las variaciones existentes para recalcular desde cero
    await DailyVariation.deleteMany({
      investment: nextil._id,
      user: nextil.user,
    });
    console.log("🗑️  Variaciones anteriores eliminadas\n");

    // Recalcular
    const result = await calculateHistoricalVariations(
      nextil._id,
      nextil.user,
      nextil,
    );

    console.log(`✅ ${result.calculated} variaciones calculadas`);
    console.log(`   ${result.message}\n`);

    await mongoose.disconnect();
    console.log("✅ Desconectado de MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

recalculateNextil();
