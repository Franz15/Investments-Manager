import mongoose from "mongoose";
import dotenv from "dotenv";
import DailyVariation from "../models/DailyVariation.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

async function debugAccumulatedFromVariations(userId) {
  try {
    console.log(
      "=== DEBUG RENDIMIENTO ACUMULADO DESDE VARIACIONES DIARIAS ===\n",
    );

    // Obtener todas las variaciones diarias del usuario
    const allVariations = await DailyVariation.find({
      user: userId,
    }).sort({ date: 1 });

    console.log(
      `Total de variaciones diarias encontradas: ${allVariations.length}`,
    );

    if (allVariations.length === 0) {
      console.log("No hay variaciones diarias registradas.");
      return;
    }

    // Calcular rendimiento acumulado como suma de todas las variaciones
    let accumulatedReturn = 0;
    let totalChangeAmount = 0;
    let positiveVariations = 0;
    let negativeVariations = 0;

    console.log("\nProcesando variaciones diarias:");
    allVariations.forEach((variation, index) => {
      const change = variation.changeAmount || 0;
      totalChangeAmount += change;
      accumulatedReturn += change;

      if (change > 0) positiveVariations++;
      else if (change < 0) negativeVariations++;

      // Mostrar cada 100 variaciones para no saturar la salida
      if (index % 100 === 0 || index === allVariations.length - 1) {
        console.log(
          `  ${index + 1}: ${new Date(variation.date).toISOString().split("T")[0]} - ${change.toFixed(2)}€ (acumulado: ${accumulatedReturn.toFixed(2)}€)`,
        );
      }
    });

    console.log(`\nEstadísticas:`);
    console.log(`  Variaciones positivas: ${positiveVariations}`);
    console.log(`  Variaciones negativas: ${negativeVariations}`);
    console.log(`  Total variaciones: ${allVariations.length}`);
    console.log(
      `  Suma total de variaciones: ${totalChangeAmount.toFixed(2)}€`,
    );

    // Calcular capital inicial total
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    // Obtener la fecha más antigua de todas las inversiones
    let startDate = new Date();
    investments.forEach((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      if (purchaseDate < startDate) {
        startDate = purchaseDate;
      }
    });

    // Obtener TODOS los registros de historial
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    let totalInvestedCapital = 0;

    // Calcular el capital total invertido
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
          if (amount > 0) {
            totalInvestedCapital += amount;
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
        }
      });

      // Verificar inversiones que NO tienen operación "creation" registrada
      for (const inv of investments) {
        const hasCreationEntry = allHistoryEntries.some((entry) => {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return (
            entryInvId === inv._id.toString() && entry.operation === "creation"
          );
        });

        if (!hasCreationEntry) {
          let initialCapital = 0;
          if (inv.isAutomatedPortfolio) {
            initialCapital = inv.quantity || 0;
          } else {
            const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
            initialCapital = (inv.quantity || 0) * avgPrice;
          }

          if (initialCapital === 0) {
            initialCapital = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
          }

          if (initialCapital > 0) {
            totalInvestedCapital += initialCapital;
          }
        }
      }
    }

    const initialValue = Math.max(0, totalInvestedCapital);
    const accumulatedReturnPercent =
      initialValue > 0 ? (accumulatedReturn / initialValue) * 100 : 0;

    console.log(`\n=== RESULTADO FINAL ===`);
    console.log(`Capital inicial invertido: ${initialValue.toFixed(2)}€`);
    console.log(
      `Rendimiento acumulado (suma de variaciones): ${accumulatedReturn.toFixed(2)}€`,
    );
    console.log(
      `Porcentaje acumulado: ${accumulatedReturnPercent.toFixed(2)}%`,
    );

    // Calcular valor actual para comparación
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });

    // Calcular ganancias/pérdidas realizadas (de inversiones vendidas)
    console.log(`\n=== GANANCIAS/PÉRDIDAS REALIZADAS ===`);

    let realizedGains = 0;
    const soldInvestments = new Set();

    // Procesar operaciones de venta
    allHistoryEntries.forEach((entry) => {
      if (entry.operation === "sell") {
        soldInvestments.add(
          entry.investment?.toString() || entry.investment?._id?.toString(),
        );

        let sellAmount = entry.operationAmount;
        if (!sellAmount || sellAmount === 0) {
          if (entry.operationPrice && entry.quantity) {
            sellAmount = entry.operationPrice * entry.quantity;
          }
        }
        sellAmount = Math.abs(sellAmount || 0);

        // Calcular cuánto se había invertido en esta inversión hasta el momento de la venta
        let investedInSoldInvestment = 0;
        const sellDate = new Date(entry.date);

        // Buscar todas las operaciones de esta inversión hasta la fecha de venta
        const invOperations = allHistoryEntries.filter((e) => {
          const eInvId =
            e.investment?.toString() || e.investment?._id?.toString();
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return eInvId === entryInvId && new Date(e.date) <= sellDate;
        });

        invOperations.forEach((op) => {
          if (op.operation === "creation" || op.operation === "add") {
            let amount = op.operationAmount;
            if (!amount || amount === 0) {
              if (op.operationPrice && op.quantity) {
                amount = op.operationPrice * op.quantity;
              } else if (op.operation === "creation" && op.totalValue) {
                amount = op.totalValue;
              }
            }
            amount = amount || 0;
            investedInSoldInvestment += amount;
          } else if (op.operation === "sell" || op.operation === "withdraw") {
            let amount = op.operationAmount;
            if (!amount || amount === 0) {
              if (op.operationPrice && op.quantity) {
                amount = op.operationPrice * op.quantity;
              }
            }
            amount = Math.abs(amount || 0);
            investedInSoldInvestment -= amount;
          }
        });

        const realizedGain = sellAmount - investedInSoldInvestment;
        realizedGains += realizedGain;

        console.log(
          `  Venta de inversión ${entry.investment}: ${sellAmount.toFixed(2)}€ - ${investedInSoldInvestment.toFixed(2)}€ = ${realizedGain.toFixed(2)}€`,
        );
      }
    });

    console.log(
      `\nTotal ganancias/pérdidas realizadas: ${realizedGains.toFixed(2)}€`,
    );

    // Rendimiento acumulado correcto = variaciones no realizadas + ganancias realizadas
    const correctAccumulatedReturn = accumulatedReturn + realizedGains;
    const correctAccumulatedPercent =
      initialValue > 0 ? (correctAccumulatedReturn / initialValue) * 100 : 0;

    console.log(`\n=== RENDIMIENTO ACUMULADO CORRECTO ===`);
    console.log(`Variaciones no realizadas: ${accumulatedReturn.toFixed(2)}€`);
    console.log(`Ganancias realizadas: ${realizedGains.toFixed(2)}€`);
    console.log(
      `Rendimiento acumulado total: ${correctAccumulatedReturn.toFixed(2)}€`,
    );
    console.log(
      `Porcentaje acumulado: ${correctAccumulatedPercent.toFixed(2)}%`,
    );

    console.log(`\n=== COMPARACIÓN ===`);
    console.log(`Valor actual: ${currentValue.toFixed(2)}€`);
    console.log(
      `Valor actual - Capital inicial: ${(currentValue - initialValue).toFixed(2)}€`,
    );
    console.log(
      `Rendimiento acumulado correcto: ${correctAccumulatedReturn.toFixed(2)}€`,
    );
    console.log(
      `Diferencia: ${(currentValue - initialValue - correctAccumulatedReturn).toFixed(2)}€`,
    );
  } catch (error) {
    console.error("Error en debug:", error);
  }
}

// Ejecutar si se llama directamente
if (process.argv[1].includes("debug-accumulated-from-variations.js")) {
  const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(async () => {
      console.log("Conectado a MongoDB\n");

      const userId = process.argv[2];
      if (!userId) {
        console.error(
          "Uso: node debug-accumulated-from-variations.js <userId>",
        );
        process.exit(1);
      }

      await debugAccumulatedFromVariations(userId);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error conectando a la base de datos:", error);
      process.exit(1);
    });
}
