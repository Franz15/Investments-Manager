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

async function checkMissingInvestmentsDec31() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "javier";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`VERIFICACIÓN DE INVERSIONES AL 31/12/2025 PARA: ${userId}`);
    console.log("=".repeat(80));

    // Obtener inversiones ACTIVAS
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    const activeInvestmentIds = investments.map((inv) => inv._id);

    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);

    console.log(`\nInversiones activas: ${investments.length}`);
    console.log(`Buscando valores al 31/12/2025...\n`);

    // Verificar cada inversión activa
    for (const inv of investments) {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      const existedBeforeYear = purchaseDate < yearStart;

      console.log(`\n${inv.name} (${inv._id}):`);
      console.log(
        `  - Fecha compra: ${purchaseDate.toISOString().split("T")[0]}`,
      );
      console.log(
        `  - Existía antes del 1/1/2026: ${existedBeforeYear ? "SÍ" : "NO"}`,
      );

      if (existedBeforeYear) {
        // Buscar DailyVariation al 31/12
        const variationDec31 = await DailyVariation.findOne({
          user: userId,
          investment: inv._id,
          date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
        });

        if (variationDec31) {
          console.log(
            `  ✅ Tiene DailyVariation al 31/12: ${variationDec31.totalValue.toFixed(2)}€`,
          );
        } else {
          // Buscar DailyVariation más reciente antes del 1/1
          const lastVariation = await DailyVariation.findOne({
            user: userId,
            investment: inv._id,
            date: { $lt: yearStart },
          })
            .sort({ date: -1 })
            .limit(1);

          if (lastVariation) {
            console.log(
              `  ⚠️  No tiene al 31/12, pero tiene más reciente (${lastVariation.date.toISOString().split("T")[0]}): ${lastVariation.totalValue.toFixed(2)}€`,
            );
          } else {
            // Buscar en InvestmentHistory
            const lastHistory = await InvestmentHistory.findOne({
              user: userId,
              investment: inv._id,
              date: { $lt: yearStart },
              totalValue: { $exists: true, $ne: null, $gt: 0 },
            })
              .sort({ date: -1 })
              .limit(1);

            if (lastHistory) {
              console.log(
                `  ⚠️  No tiene DailyVariation, pero tiene InvestmentHistory (${lastHistory.date.toISOString().split("T")[0]}): ${lastHistory.totalValue.toFixed(2)}€`,
              );
            } else {
              // Calcular capital invertido hasta el 31/12
              const capitalOps = await InvestmentHistory.find({
                user: userId,
                investment: inv._id,
                date: { $lt: yearStart },
                operation: { $in: ["creation", "add", "withdraw"] },
                operationAmount: { $exists: true, $ne: null },
              }).sort({ date: 1 });

              let capital = 0;
              capitalOps.forEach((op) => {
                if (op.operation === "creation" || op.operation === "add") {
                  capital += op.operationAmount || 0;
                } else if (op.operation === "withdraw") {
                  capital -= Math.abs(op.operationAmount || 0);
                }
              });

              if (capital > 0) {
                console.log(
                  `  ⚠️  No tiene registros de valor, capital invertido hasta 31/12: ${capital.toFixed(2)}€`,
                );
              } else {
                console.log(`  ❌ NO TIENE NINGÚN REGISTRO ANTES DEL 1/1/2026`);
              }
            }
          }
        }
      } else {
        console.log(
          `  ℹ️  Inversión nueva en 2026, no debería estar en el cálculo del inicio del año`,
        );
      }
    }

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkMissingInvestmentsDec31();
