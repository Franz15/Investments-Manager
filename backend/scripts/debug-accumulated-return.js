import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugAccumulatedReturn() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("=== DEBUG DEL RENDIMIENTO ACUMULADO ===\n");

    const userId = "ana";

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    // Obtener TODAS las operaciones de historial
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    console.log(`Total inversiones: ${investments.length}`);
    console.log(
      `Total operaciones de historial: ${allHistoryEntries.length}\n`,
    );

    // Calcular totalInvestedCapital desde operaciones
    let totalInvestedCapital = 0;
    const capitalOperations = [];

    console.log("=== CÁLCULO DE totalInvestedCapital DESDE OPERACIONES ===\n");

    if (allHistoryEntries.length > 0) {
      allHistoryEntries.forEach((entry) => {
        if (entry.operation === "creation" || entry.operation === "add") {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.operation === "creation" && entry.totalValue) {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            totalInvestedCapital += amount;
            const invName =
              entry.investment?.name ||
              entry.investment?.toString() ||
              "Unknown";
            console.log(
              `  ${entry.operation.toUpperCase()}: ${invName} - ${amount.toFixed(2)}€ - ${entry.date.toISOString().split("T")[0]}`,
            );
          }
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = Math.abs(amount || 0);
          totalInvestedCapital -= amount;
          const invName =
            entry.investment?.name || entry.investment?.toString() || "Unknown";
          console.log(
            `  ${entry.operation.toUpperCase()}: ${invName} - -${amount.toFixed(2)}€ - ${entry.date.toISOString().split("T")[0]}`,
          );
        }
      });
    }

    console.log(
      `\nTotal desde operaciones: ${totalInvestedCapital.toFixed(2)}€\n`,
    );

    // Verificar inversiones que NO tienen operación "creation"
    console.log(
      "=== VERIFICACIÓN DE INVERSIONES SIN OPERACIÓN 'creation' ===\n",
    );
    let missingCapital = 0;

    for (const inv of investments) {
      const hasCreationEntry = allHistoryEntries.some((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === inv._id.toString() && entry.operation === "creation"
        );
      });

      if (!hasCreationEntry) {
        // Buscar primera entrada de historial
        const firstHistoryEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
        })
          .sort({ date: 1 })
          .limit(1);

        let initialCapital = 0;
        if (
          firstHistoryEntry &&
          (firstHistoryEntry.operation === "creation" ||
            firstHistoryEntry.operation === "add")
        ) {
          initialCapital =
            firstHistoryEntry.operationAmount ||
            (firstHistoryEntry.operationPrice && firstHistoryEntry.quantity
              ? firstHistoryEntry.operationPrice * firstHistoryEntry.quantity
              : 0);
        }

        if (initialCapital === 0) {
          if (inv.isAutomatedPortfolio) {
            initialCapital = inv.quantity || 0;
          } else {
            initialCapital = (inv.quantity || 0) * (inv.purchasePrice || 0);
          }
        }

        if (initialCapital === 0) {
          initialCapital = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
        }

        if (initialCapital > 0) {
          missingCapital += initialCapital;
          console.log(
            `  ${inv.name}: Sin "creation", capital estimado: ${initialCapital.toFixed(2)}€`,
          );
        }
      }
    }

    if (missingCapital === 0) {
      console.log(`  Todas las inversiones tienen operación "creation".\n`);
    }

    const totalInvestedCapitalFinal = totalInvestedCapital + missingCapital;

    console.log(`\nCapital faltante: ${missingCapital.toFixed(2)}€`);
    console.log(
      `Total capital invertido: ${totalInvestedCapitalFinal.toFixed(2)}€\n`,
    );

    // Calcular valor actual
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });

    const accumulatedReturn = currentValue - totalInvestedCapitalFinal;
    const accumulatedReturnPercent =
      totalInvestedCapitalFinal > 0
        ? (accumulatedReturn / totalInvestedCapitalFinal) * 100
        : 0;

    console.log("=== CÁLCULO DEL RENDIMIENTO ACUMULADO ===");
    console.log(`  currentValue: ${currentValue.toFixed(2)}€`);
    console.log(
      `  totalInvestedCapital: ${totalInvestedCapitalFinal.toFixed(2)}€`,
    );
    console.log(
      `  accumulatedReturn = ${currentValue.toFixed(2)} - ${totalInvestedCapitalFinal.toFixed(2)}`,
    );
    console.log(`  accumulatedReturn = ${accumulatedReturn.toFixed(2)}€`);
    console.log(
      `  accumulatedReturnPercent = ${accumulatedReturnPercent.toFixed(2)}%\n`,
    );
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugAccumulatedReturn();
