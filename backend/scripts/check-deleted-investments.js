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

async function checkDeletedInvestments() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "javier";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`ANÁLISIS DE INVERSIONES ELIMINADAS PARA: ${userId}`);
    console.log("=".repeat(80));

    // Obtener inversiones ACTIVAS
    const activeInvestments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    const activeInvestmentIds = activeInvestments.map((inv) => inv._id);

    console.log(`\n1. INVERSIONES ACTIVAS:`);
    console.log(`   Total: ${activeInvestments.length}`);
    activeInvestments.forEach((inv) => {
      console.log(`   - ${inv.name} (${inv._id})`);
    });

    // Obtener TODOS los registros de InvestmentHistory
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
    });

    console.log(`\n2. REGISTROS DE InvestmentHistory:`);
    console.log(`   Total: ${allHistoryEntries.length}`);

    // Identificar registros de inversiones eliminadas
    const historyFromDeletedInvestments = [];
    const historyFromActiveInvestments = [];

    allHistoryEntries.forEach((entry) => {
      const invId = entry.investment?.toString() || entry.investment;
      const isActive = activeInvestmentIds.some(
        (id) => id.toString() === invId,
      );

      if (isActive) {
        historyFromActiveInvestments.push(entry);
      } else {
        historyFromDeletedInvestments.push(entry);
      }
    });

    console.log(
      `   - De inversiones ACTIVAS: ${historyFromActiveInvestments.length}`,
    );
    console.log(
      `   - De inversiones ELIMINADAS: ${historyFromDeletedInvestments.length}`,
    );

    if (historyFromDeletedInvestments.length > 0) {
      console.log(`\n   Registros de inversiones eliminadas:`);
      const deletedByInvestment = {};
      historyFromDeletedInvestments.forEach((entry) => {
        const invId = entry.investment?.toString() || entry.investment;
        if (!deletedByInvestment[invId]) {
          deletedByInvestment[invId] = [];
        }
        deletedByInvestment[invId].push(entry);
      });

      Object.keys(deletedByInvestment).forEach((invId) => {
        const entries = deletedByInvestment[invId];
        const totalValue = entries.reduce(
          (sum, e) => sum + (e.totalValue || 0),
          0,
        );
        const totalOperations = entries.filter((e) =>
          ["creation", "add", "withdraw"].includes(e.operation),
        ).length;
        console.log(`   - Inversión ${invId}:`);
        console.log(`     * Registros: ${entries.length}`);
        console.log(`     * Operaciones de capital: ${totalOperations}`);
        console.log(`     * Valor total acumulado: ${totalValue.toFixed(2)}€`);
        console.log(
          `     * Fechas: ${new Date(entries[0].date).toISOString().split("T")[0]} - ${new Date(entries[entries.length - 1].date).toISOString().split("T")[0]}`,
        );
      });
    }

    // Obtener TODOS los registros de DailyVariation
    const allDailyVariations = await DailyVariation.find({
      user: userId,
    });

    console.log(`\n3. REGISTROS DE DailyVariation:`);
    console.log(`   Total: ${allDailyVariations.length}`);

    // Identificar registros de inversiones eliminadas
    const variationsFromDeletedInvestments = [];
    const variationsFromActiveInvestments = [];

    allDailyVariations.forEach((entry) => {
      const invId = entry.investment?.toString() || entry.investment;
      const isActive = activeInvestmentIds.some(
        (id) => id.toString() === invId,
      );

      if (isActive) {
        variationsFromActiveInvestments.push(entry);
      } else {
        variationsFromDeletedInvestments.push(entry);
      }
    });

    console.log(
      `   - De inversiones ACTIVAS: ${variationsFromActiveInvestments.length}`,
    );
    console.log(
      `   - De inversiones ELIMINADAS: ${variationsFromDeletedInvestments.length}`,
    );

    if (variationsFromDeletedInvestments.length > 0) {
      console.log(`\n   Registros de inversiones eliminadas:`);
      const deletedByInvestment = {};
      variationsFromDeletedInvestments.forEach((entry) => {
        const invId = entry.investment?.toString() || entry.investment;
        if (!deletedByInvestment[invId]) {
          deletedByInvestment[invId] = [];
        }
        deletedByInvestment[invId].push(entry);
      });

      Object.keys(deletedByInvestment).forEach((invId) => {
        const entries = deletedByInvestment[invId];
        const totalValue = entries.reduce(
          (sum, e) => sum + (e.totalValue || 0),
          0,
        );
        console.log(`   - Inversión ${invId}:`);
        console.log(`     * Registros: ${entries.length}`);
        console.log(`     * Valor total acumulado: ${totalValue.toFixed(2)}€`);
        console.log(
          `     * Fechas: ${new Date(entries[0].date).toISOString().split("T")[0]} - ${new Date(entries[entries.length - 1].date).toISOString().split("T")[0]}`,
        );
      });
    }

    // Resumen
    console.log(`\n${"=".repeat(80)}`);
    console.log("RESUMEN:");
    console.log("=".repeat(80));
    console.log(`\nRegistros que afectan los cálculos:`);
    console.log(
      `  - InvestmentHistory de inversiones eliminadas: ${historyFromDeletedInvestments.length}`,
    );
    console.log(
      `  - DailyVariation de inversiones eliminadas: ${variationsFromDeletedInvestments.length}`,
    );

    if (
      historyFromDeletedInvestments.length > 0 ||
      variationsFromDeletedInvestments.length > 0
    ) {
      console.log(
        `\n⚠️  HAY REGISTROS DE INVERSIONES ELIMINADAS QUE DEBEN SER ELIMINADOS`,
      );
      console.log(`\n¿Deseas eliminar estos registros? (S/N)`);
    } else {
      console.log(`\n✅ No hay registros de inversiones eliminadas`);
    }

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkDeletedInvestments();
