import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

async function debugAccumulatedReturn(userId) {
  try {
    console.log("=== DEBUG RENDIMIENTO ACUMULADO ===\n");

    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    console.log(`Total de inversiones: ${investments.length}`);

    // Mostrar todas las inversiones con sus fechas de compra
    console.log("\n=== TODAS LAS INVERSIONES ===");
    investments.forEach((inv) => {
      const purchaseDate = inv.purchaseDate
        ? new Date(inv.purchaseDate).toISOString().split("T")[0]
        : "N/A";
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      console.log(
        `  ${inv.name}: ${value.toFixed(2)}€ (compra: ${purchaseDate})`,
      );
    });

    // Calcular valor actual total
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });

    console.log(`Valor actual total: ${currentValue.toFixed(2)}€\n`);

    // Calcular capital total invertido (initialValue)
    console.log("=== CÁLCULO DEL CAPITAL TOTAL INVERTIDO ===");

    // Obtener la fecha más antigua de todas las inversiones
    let startDate = new Date();
    investments.forEach((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      if (purchaseDate < startDate) {
        startDate = purchaseDate;
      }
    });

    console.log(
      `Fecha más antigua de inversión: ${startDate.toISOString().split("T")[0]}`,
    );

    // Obtener TODOS los registros de historial
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    console.log("\n=== HISTORIAL COMPLETO DE INVERSIONES ANTIGUAS ===");
    const oldInvestments = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      return (
        purchaseDate.getFullYear() === 2025 && purchaseDate.getMonth() === 0
      ); // Enero 2025
    });

    for (const inv of oldInvestments) {
      console.log(
        `\n${inv.name} (compra: ${inv.purchaseDate ? new Date(inv.purchaseDate).toISOString().split("T")[0] : "N/A"}):`,
      );
      const invHistory = allHistoryEntries.filter((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return entryInvId === inv._id.toString();
      });

      invHistory.forEach((entry) => {
        console.log(
          `  ${entry.operation.toUpperCase()}: ${entry.operationAmount || entry.quantity * entry.operationPrice || entry.totalValue || 0}€ - ${new Date(entry.date).toISOString().split("T")[0]}`,
        );
      });

      if (invHistory.length === 0) {
        console.log(`  SIN OPERACIONES REGISTRADAS`);
      }
    }

    console.log(
      `Total de entradas de historial: ${allHistoryEntries.length}\n`,
    );

    // Calcular el capital total invertido
    let totalInvestedCapital = 0;
    const capitalOperations = [];

    // Si hay historial, calcular basándose en los operationAmount
    if (allHistoryEntries.length > 0) {
      console.log("Procesando operaciones de historial:");
      allHistoryEntries.forEach((entry) => {
        // Verificar si es una inversión antigua con operación "creation" reciente
        if (entry.operation === "creation") {
          const invId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          const investment = investments.find(
            (inv) => inv._id.toString() === invId,
          );
          if (investment && investment.purchaseDate) {
            const purchaseDate = new Date(investment.purchaseDate);
            const creationDate = new Date(entry.date);
            const daysBetween =
              (creationDate - purchaseDate) / (1000 * 60 * 60 * 24);
            console.log(
              `Verificando ${investment.name}: purchaseDate=${purchaseDate.toISOString().split("T")[0]}, creationDate=${creationDate.toISOString().split("T")[0]}, days=${daysBetween}`,
            );
            if (daysBetween > 180) {
              // Más de 6 meses entre purchaseDate y creación
              console.log(
                `Ignorando operación creation antigua para ${investment.name}`,
              );
              return; // Ignorar esta operación
            }
          }
        }

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
            capitalOperations.push({
              date: entry.date,
              operation: entry.operation,
              amount: amount,
              investment: entry.investment?._id || entry.investment,
              type: "add",
            });
            console.log(
              `  + ${entry.operation.toUpperCase()}: ${amount.toFixed(2)}€ (${new Date(entry.date).toISOString().split("T")[0]})`,
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
          capitalOperations.push({
            date: entry.date,
            operation: entry.operation,
            amount: -amount,
            investment: entry.investment?._id || entry.investment,
            type: "subtract",
          });
          console.log(
            `  - ${entry.operation.toUpperCase()}: ${amount.toFixed(2)}€ (${new Date(entry.date).toISOString().split("T")[0]})`,
          );
        }
      });

      // Verificar inversiones que NO tienen operación "creation" registrada
      console.log("\nVerificando inversiones sin operación 'creation':");
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
            capitalOperations.push({
              date: inv.purchaseDate || new Date(),
              operation: "creation",
              amount: initialCapital,
              investment: inv._id,
              type: "add",
            });
            console.log(
              `  + CREATION (calculado): ${initialCapital.toFixed(2)}€ para ${inv.name}`,
            );
          }
        }
      }
    } else {
      // Si no hay historial, calcular basándose en purchaseDate y purchasePrice
      console.log("No hay historial, calculando desde purchasePrice:");
      investments.forEach((inv) => {
        let initialCapital = 0;
        if (inv.isAutomatedPortfolio) {
          initialCapital = inv.quantity || 0;
        } else {
          const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
          initialCapital = (inv.quantity || 0) * avgPrice;
        }

        totalInvestedCapital += initialCapital;
        console.log(`  + ${inv.name}: ${initialCapital.toFixed(2)}€`);
      });
    }

    const initialValue = Math.max(0, totalInvestedCapital);

    console.log(`\n=== RESULTADOS ===`);
    console.log(
      `Capital total invertido (initialValue): ${initialValue.toFixed(2)}€`,
    );
    console.log(`Valor actual (currentValue): ${currentValue.toFixed(2)}€`);
    console.log(
      `Rendimiento acumulado: ${(currentValue - initialValue).toFixed(2)}€`,
    );
    console.log(
      `Porcentaje acumulado: ${initialValue > 0 ? ((currentValue / initialValue - 1) * 100).toFixed(2) : 0}%`,
    );

    // Mostrar resumen de operaciones
    // Ahora calcular el rendimiento acumulado correctamente
    console.log(`\n=== CÁLCULO CORRECTO DEL RENDIMIENTO ACUMULADO ===`);
    let accumulatedReturn = 0;
    let totalInvestedInCurrentInvestments = 0;

    for (const inv of investments) {
      const currentInvValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);

      console.log(`\nProcesando ${inv.name}:`);

      // Calcular el capital invertido en esta inversión específica
      let investedInThisInvestment = 0;
      const invHistory = allHistoryEntries.filter((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return entryInvId === inv._id.toString();
      });

      console.log(`  Historial encontrado: ${invHistory.length} operaciones`);

      invHistory.forEach((entry) => {
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
            investedInThisInvestment += amount;
            console.log(
              `    + ${entry.operation.toUpperCase()}: ${amount.toFixed(2)}€`,
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
          investedInThisInvestment -= amount;
          console.log(
            `    - ${entry.operation.toUpperCase()}: ${amount.toFixed(2)}€`,
          );
        }
      });

      // Si no hay historial de operaciones, calcular desde purchasePrice
      if (investedInThisInvestment === 0) {
        if (inv.isAutomatedPortfolio) {
          investedInThisInvestment = inv.quantity || 0;
        } else {
          const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
          investedInThisInvestment = (inv.quantity || 0) * avgPrice;
        }

        // Si aún es 0, intentar usar el valor actual asumiendo un rendimiento conservador
        // Esto es una aproximación para inversiones antiguas sin historial completo
        if (investedInThisInvestment === 0 && currentInvValue > 0) {
          // Asumir que el capital inicial fue el 80% del valor actual (asumiendo ~25% de rendimiento acumulado típico)
          // Esto es solo una aproximación conservadora para evitar inflar artificialmente el rendimiento
          investedInThisInvestment = currentInvValue * 0.8;
          console.log(
            `  Capital inicial aproximado (sin historial completo): ${investedInThisInvestment.toFixed(2)}€ (aprox. desde ${currentInvValue.toFixed(2)}€ asumiendo rendimiento conservador)`,
          );
        } else {
          console.log(
            `  Capital inicial (sin historial): ${investedInThisInvestment.toFixed(2)}€`,
          );
        }
      }

      // Si aún es 0, usar el valor actual (no hay rendimiento)
      if (investedInThisInvestment === 0) {
        investedInThisInvestment = currentInvValue;
        console.log(
          `  Usando valor actual como capital inicial: ${investedInThisInvestment.toFixed(2)}€`,
        );
      }

      // Calcular rendimiento de esta inversión
      const invReturn = currentInvValue - investedInThisInvestment;
      accumulatedReturn += invReturn;
      totalInvestedInCurrentInvestments += investedInThisInvestment;

      console.log(`  Valor actual: ${currentInvValue.toFixed(2)}€`);
      console.log(
        `  Capital invertido: ${investedInThisInvestment.toFixed(2)}€`,
      );
      console.log(
        `  Rendimiento: ${invReturn.toFixed(2)}€ (${(investedInThisInvestment > 0 ? (invReturn / investedInThisInvestment) * 100 : 0).toFixed(2)}%)`,
      );
    }

    console.log(`\n=== RESULTADO CORRECTO ===`);
    console.log(
      `Capital total invertido en inversiones activas: ${totalInvestedInCurrentInvestments.toFixed(2)}€`,
    );
    console.log(`Valor actual total: ${currentValue.toFixed(2)}€`);
    console.log(`Rendimiento acumulado: ${accumulatedReturn.toFixed(2)}€`);
    console.log(
      `Porcentaje acumulado: ${totalInvestedInCurrentInvestments > 0 ? (accumulatedReturn / totalInvestedInCurrentInvestments) * 100 : 0}%`,
    );

    console.log(`\n=== RESUMEN DE OPERACIONES ===`);
    const totalAdded = capitalOperations
      .filter((op) => op.type === "add")
      .reduce((sum, op) => sum + op.amount, 0);
    const totalSubtracted = Math.abs(
      capitalOperations
        .filter((op) => op.type === "subtract")
        .reduce((sum, op) => sum + op.amount, 0),
    );

    console.log(`Total aportado históricamente: ${totalAdded.toFixed(2)}€`);
    console.log(
      `Total retirado históricamente: ${totalSubtracted.toFixed(2)}€`,
    );
    console.log(
      `Capital neto histórico: ${(totalAdded - totalSubtracted).toFixed(2)}€`,
    );
  } catch (error) {
    console.error("Error en debug:", error);
  }
}

// Ejecutar si se llama directamente
if (process.argv[1].includes("debug-accumulated-return.js")) {
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
        console.error("Uso: node debug-accumulated-return.js <userId>");
        process.exit(1);
      }

      await debugAccumulatedReturn(userId);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error conectando a la base de datos:", error);
      process.exit(1);
    });
}
