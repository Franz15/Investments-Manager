/**
 * Script para corregir TODAS las inversiones que se cerraron pero
 * no se guardó el status "closed" porque el campo no estaba en el schema.
 * Busca inversiones con quantity=0 y sin status "closed" en todos los usuarios.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

async function fixAllClosedInvestments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB");

    const Investment = (await import("../models/Investment.js")).default;
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;

    // Buscar TODAS las inversiones con quantity=0 que no tienen status "closed"
    const brokenInvestments = await Investment.find({
      quantity: 0,
      $or: [{ status: { $ne: "closed" } }, { status: { $exists: false } }],
    });

    console.log(
      `\nEncontradas ${brokenInvestments.length} inversiones con quantity=0 sin status "closed":\n`,
    );

    let fixed = 0;
    let skipped = 0;

    for (const inv of brokenInvestments) {
      console.log(`--- [${inv.user}] ${inv.name} (${inv._id}) ---`);
      console.log(
        `  Tipo: ${inv.type} | Cantidad: ${inv.quantity} | Precio: ${inv.currentPrice}`,
      );
      console.log(`  Status actual: ${inv.status || "(no definido)"}`);

      // Buscar la última entrada del historial
      const lastHistory = await InvestmentHistory.findOne({
        investment: inv._id,
        user: inv.user,
      }).sort({ date: -1 });

      if (!lastHistory) {
        console.log("  ⚠ No hay historial, saltando");
        skipped++;
        continue;
      }

      const closeDate = lastHistory.date;
      console.log(
        `  Última operación: ${lastHistory.operation} el ${closeDate.toISOString().split("T")[0]}`,
      );

      // Calcular el resumen de cierre
      const summaryEntries = await InvestmentHistory.find({
        user: inv.user,
        investment: inv._id,
        operation: { $in: ["creation", "add", "withdraw", "sell"] },
      });

      let totalContributed = 0;
      let totalWithdrawn = 0;

      summaryEntries.forEach((entry) => {
        const amount = Math.abs(entry.operationAmount || 0);
        if (entry.operation === "creation" || entry.operation === "add") {
          totalContributed += amount;
        } else if (
          entry.operation === "withdraw" ||
          entry.operation === "sell"
        ) {
          totalWithdrawn += amount;
        }
      });

      const resultAmount = totalWithdrawn - totalContributed;
      const resultPercent =
        totalContributed > 0 ? (resultAmount / totalContributed) * 100 : 0;

      console.log(
        `  Aportado: ${totalContributed.toFixed(2)} € | Retirado: ${totalWithdrawn.toFixed(2)} €`,
      );
      console.log(
        `  Resultado: ${resultAmount >= 0 ? "+" : ""}${resultAmount.toFixed(2)} € (${resultPercent >= 0 ? "+" : ""}${resultPercent.toFixed(2)}%)`,
      );

      // Corregir la inversión
      inv.status = "closed";
      inv.closedAt = closeDate;
      inv.autoUpdate = false;
      inv.closeSummary = {
        totalContributed,
        totalWithdrawn,
        resultAmount,
        resultPercent,
      };
      await inv.save();

      console.log(`  ✅ Corregida\n`);
      fixed++;
    }

    console.log(`\n========================================`);
    console.log(`Resumen: ${fixed} corregidas, ${skipped} saltadas`);
    console.log(`========================================`);

    await mongoose.disconnect();
    console.log("Desconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixAllClosedInvestments();
