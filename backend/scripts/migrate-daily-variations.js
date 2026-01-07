import mongoose from "mongoose";
import dotenv from "dotenv";
import { migrateExistingDailyVariations } from "../services/historicalVariationService.js";

dotenv.config();

async function runMigration() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(
      process.env.MONGODB_URI ||
        "mongodb://localhost:27017/investments-manager",
    );
    console.log("✅ Conectado a MongoDB\n");

    // Ejecutar migración para todos los usuarios (pasar null como userId)
    console.log("🔄 Iniciando migración de variaciones diarias...\n");
    const result = await migrateExistingDailyVariations(null);

    console.log("📊 Resultados de la migración:");
    console.log(`   Total registros encontrados: ${result.total}`);
    console.log(`   Migrados: ${result.migrated}`);
    console.log(`   Omitidos (ya existían o errores): ${result.skipped}`);
    console.log(`   Mensaje: ${result.message}\n`);

    await mongoose.disconnect();
    console.log("✅ Desconectado de MongoDB");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en la migración:", error);
    process.exit(1);
  }
}

runMigration();
