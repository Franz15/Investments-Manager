import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugCapitalCalculation() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB\n");

    const userId = "ana";
    const currentDate = new Date();

    // Obtener todas las inversiones
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    console.log(`=== ANÁLISIS DETALLADO DE CAPITAL ===\n`);

    // === RENDIMIENTO MENSUAL ===
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    monthEnd.setHours(23, 59, 59, 999);

    console.log(
      `Mes: ${monthStart.toISOString().split("T")[0]} a ${monthEnd.toISOString().split("T")[0]}\n`,
    );

    const investmentsExistingBeforeMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

    const investmentsNewThisMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= monthStart;
    });

    console.log(
      `Inversiones existentes: ${investmentsExistingBeforeMonth.length}`,
    );
    console.log(`Inversiones nuevas: ${investmentsNewThisMonth.length}\n`);

    // Calcular currentValue total
    let currentValue = 0;
    let currentValueOfExisting = 0;
    let currentValueOfNew = 0;

    investmentsExistingBeforeMonth.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValueOfExisting += value;
      currentValue += value;
    });

    investmentsNewThisMonth.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValueOfNew += value;
      currentValue += value;
    });

    console.log(`Current Value Total: ${currentValue.toFixed(2)}€`);
    console.log(`  - Existentes: ${currentValueOfExisting.toFixed(2)}€`);
    console.log(`  - Nuevas: ${currentValueOfNew.toFixed(2)}€\n`);

    // Obtener TODAS las operaciones del mes
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart, $lte: monthEnd },
    }).sort({ date: 1 });

    console.log(`=== OPERACIONES DE CAPITAL EN EL MES ===`);
    console.log(`Total operaciones: ${allHistoryEntries.length}\n`);

    let capitalAddedToNew = 0;
    let capitalAddedToOld = 0;
    let capitalWithdrawn = 0;

    const capitalByInvestment = new Map();

    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      const invId =
        entry.investment?._id?.toString() ||
        entry.investment?.toString() ||
        "unknown";
      const invName = entry.investment?.name || "Unknown";

      // Determinar si es inversión nueva o existente
      const isNewInvestment = investmentsNewThisMonth.some(
        (inv) => inv._id.toString() === invId,
      );

      let amount = 0;
      let amountSource = "";

      if (entry.operation === "creation") {
        amount = entry.operationAmount;
        if (!amount || amount === 0) {
          if (entry.operationPrice && entry.quantity) {
            amount = entry.operationPrice * entry.quantity;
            amountSource = "operationPrice * quantity";
          } else if (entry.totalValue) {
            amount = entry.totalValue;
            amountSource = "totalValue";
          }
        } else {
          amountSource = "operationAmount";
        }
        amount = amount || 0;
        if (amount >= 0) {
          capitalAddedToNew += amount;
          if (!capitalByInvestment.has(invId)) {
            capitalByInvestment.set(invId, {
              name: invName,
              creation: 0,
              add: 0,
              withdraw: 0,
              isNew: isNewInvestment,
            });
          }
          capitalByInvestment.get(invId).creation += amount;
          console.log(
            `  CREATION: ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
          );
        }
      } else if (entry.operation === "add") {
        amount = entry.operationAmount;
        if (!amount || amount === 0) {
          if (entry.operationPrice && entry.quantity) {
            amount = entry.operationPrice * entry.quantity;
            amountSource = "operationPrice * quantity";
          }
        } else {
          amountSource = "operationAmount";
        }
        amount = amount || 0;
        if (amount >= 0) {
          // IMPORTANTE: Si es una inversión nueva, el "add" también cuenta como capital inicial
          if (isNewInvestment) {
            capitalAddedToNew += amount;
            if (!capitalByInvestment.has(invId)) {
              capitalByInvestment.set(invId, {
                name: invName,
                creation: 0,
                add: 0,
                withdraw: 0,
                isNew: true,
              });
            }
            capitalByInvestment.get(invId).add += amount;
            console.log(
              `  ADD (nueva): ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
            );
          } else {
            capitalAddedToOld += amount;
            if (!capitalByInvestment.has(invId)) {
              capitalByInvestment.set(invId, {
                name: invName,
                creation: 0,
                add: 0,
                withdraw: 0,
                isNew: false,
              });
            }
            capitalByInvestment.get(invId).add += amount;
            console.log(
              `  ADD (existente): ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
            );
          }
        }
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        amount = entry.operationAmount;
        if (!amount || amount === 0) {
          if (entry.operationPrice && entry.quantity) {
            amount = entry.operationPrice * entry.quantity;
            amountSource = "operationPrice * quantity";
          }
        } else {
          amountSource = "operationAmount";
        }
        amount = Math.abs(amount || 0);
        capitalWithdrawn += amount;
        if (!capitalByInvestment.has(invId)) {
          capitalByInvestment.set(invId, {
            name: invName,
            creation: 0,
            add: 0,
            withdraw: 0,
            isNew: isNewInvestment,
          });
        }
        capitalByInvestment.get(invId).withdraw += amount;
        console.log(
          `  ${entry.operation.toUpperCase()}: ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
        );
      }
    }

    const totalCapitalAdded = capitalAddedToNew + capitalAddedToOld;
    console.log(`\nResumen de operaciones:`);
    console.log(`  Capital añadido (nuevas): ${capitalAddedToNew.toFixed(2)}€`);
    console.log(
      `  Capital añadido (existentes): ${capitalAddedToOld.toFixed(2)}€`,
    );
    console.log(`  Capital añadido (total): ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`  Capital retirado: ${capitalWithdrawn.toFixed(2)}€\n`);

    // Verificar inversiones nuevas que NO tienen operación registrada
    console.log(`=== VERIFICACIÓN DE INVERSIONES NUEVAS SIN OPERACIÓN ===`);
    let missingCapital = 0;
    for (const inv of investmentsNewThisMonth) {
      const invId = inv._id.toString();
      const hasAnyOperation = capitalByInvestment.has(invId);

      if (!hasAnyOperation) {
        const currentInvValue = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);

        // Buscar primera entrada de historial
        const firstHistoryEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $gte: monthStart },
        })
          .sort({ date: 1 })
          .limit(1);

        let initialCapital = 0;
        if (firstHistoryEntry) {
          initialCapital =
            firstHistoryEntry.operationAmount ||
            (firstHistoryEntry.operationPrice && firstHistoryEntry.quantity
              ? firstHistoryEntry.operationPrice * firstHistoryEntry.quantity
              : 0) ||
            firstHistoryEntry.totalValue ||
            0;
        } else {
          initialCapital = currentInvValue;
        }

        missingCapital += initialCapital;
        console.log(
          `  ${inv.name}: Sin operación registrada, capital estimado: ${initialCapital.toFixed(2)}€ (valor actual: ${currentInvValue.toFixed(2)}€)`,
        );
      }
    }

    if (missingCapital > 0) {
      console.log(`\nCapital faltante total: ${missingCapital.toFixed(2)}€`);
      capitalAddedToNew += missingCapital;
    } else {
      console.log(
        `  Todas las inversiones nuevas tienen operaciones registradas.`,
      );
    }
    console.log();

    // Calcular monthStartValue
    const lastDayOfPreviousMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    );
    lastDayOfPreviousMonth.setHours(0, 0, 0, 0);
    const lastDayOfPreviousMonthEnd = new Date(lastDayOfPreviousMonth);
    lastDayOfPreviousMonthEnd.setDate(lastDayOfPreviousMonthEnd.getDate() + 1);

    let monthStartValue = 0;
    for (const inv of investmentsExistingBeforeMonth) {
      let invValueAtMonthStart = 0;

      const variationLastDay = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $gte: lastDayOfPreviousMonth, $lt: lastDayOfPreviousMonthEnd },
      });

      if (variationLastDay && variationLastDay.totalValue) {
        invValueAtMonthStart = variationLastDay.totalValue;
      } else {
        const lastVariation = await DailyVariation.findOne({
          user: userId,
          investment: inv._id,
          date: { $lt: monthStart },
        })
          .sort({ date: -1 })
          .limit(1);

        if (lastVariation && lastVariation.totalValue) {
          invValueAtMonthStart = lastVariation.totalValue;
        } else {
          const lastHistory = await InvestmentHistory.findOne({
            user: userId,
            investment: inv._id,
            date: { $lt: monthStart },
            totalValue: { $exists: true, $ne: null, $gt: 0 },
          })
            .sort({ date: -1 })
            .limit(1);

          if (lastHistory && lastHistory.totalValue) {
            invValueAtMonthStart = lastHistory.totalValue;
          } else {
            invValueAtMonthStart = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
          }
        }
      }

      monthStartValue += invValueAtMonthStart;
    }

    console.log(`Month Start Value: ${monthStartValue.toFixed(2)}€\n`);

    // Recalcular totalCapitalAdded con el capital faltante
    const totalCapitalAddedFinal = capitalAddedToNew + capitalAddedToOld;

    // Calcular rendimiento mensual
    const monthlyReturn =
      currentValue -
      monthStartValue -
      totalCapitalAddedFinal +
      capitalWithdrawn;

    const monthlyBaseValue =
      monthStartValue + totalCapitalAddedFinal - capitalWithdrawn;
    const monthlyReturnPercent =
      monthlyBaseValue > 0 ? (monthlyReturn / monthlyBaseValue) * 100 : 0;

    console.log("=== CÁLCULO FINAL ===");
    console.log(`  currentValue: ${currentValue.toFixed(2)}€`);
    console.log(`  monthStartValue: ${monthStartValue.toFixed(2)}€`);
    console.log(`  totalCapitalAdded: ${totalCapitalAddedFinal.toFixed(2)}€`);
    console.log(`    - Nuevas: ${capitalAddedToNew.toFixed(2)}€`);
    console.log(`    - Existentes: ${capitalAddedToOld.toFixed(2)}€`);
    console.log(`  capitalWithdrawn: ${capitalWithdrawn.toFixed(2)}€`);
    console.log(
      `\n  monthlyReturn = ${currentValue.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${totalCapitalAddedFinal.toFixed(2)} + ${capitalWithdrawn.toFixed(2)}`,
    );
    console.log(`  monthlyReturn = ${monthlyReturn.toFixed(2)}€`);
    console.log(
      `  monthlyReturnPercent = ${monthlyReturnPercent.toFixed(2)}%\n`,
    );

    // Verificación detallada
    console.log("=== VERIFICACIÓN DETALLADA ===");
    const returnOfExisting =
      currentValueOfExisting - monthStartValue - capitalAddedToOld;
    const returnOfNew = currentValueOfNew - capitalAddedToNew;
    const totalReturn = returnOfExisting + returnOfNew + capitalWithdrawn;

    console.log(`  1. Rendimiento de existentes:`);
    console.log(`     Valor actual: ${currentValueOfExisting.toFixed(2)}€`);
    console.log(`     Valor inicio mes: ${monthStartValue.toFixed(2)}€`);
    console.log(`     Capital añadido: ${capitalAddedToOld.toFixed(2)}€`);
    console.log(`     Rendimiento: ${returnOfExisting.toFixed(2)}€`);
    console.log(`\n  2. Rendimiento de nuevas:`);
    console.log(`     Valor actual: ${currentValueOfNew.toFixed(2)}€`);
    console.log(`     Capital inicial: ${capitalAddedToNew.toFixed(2)}€`);
    console.log(`     Rendimiento: ${returnOfNew.toFixed(2)}€`);
    console.log(`\n  3. Total rendimiento: ${totalReturn.toFixed(2)}€`);
    console.log(
      `  4. Verificación: ${monthlyReturn.toFixed(2)}€ === ${totalReturn.toFixed(2)}€ ? ${Math.abs(monthlyReturn - totalReturn) < 0.01 ? "✓" : "✗"}\n`,
    );

    // Mostrar resumen por inversión
    console.log("=== RESUMEN POR INVERSIÓN NUEVA ===");
    for (const inv of investmentsNewThisMonth) {
      const invId = inv._id.toString();
      const currentInvValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);

      const capitalInfo = capitalByInvestment.get(invId) || {
        creation: 0,
        add: 0,
        withdraw: 0,
      };
      const totalCapital = capitalInfo.creation + capitalInfo.add;
      const returnOfThis = currentInvValue - totalCapital;

      console.log(`  ${inv.name}:`);
      console.log(`    Valor actual: ${currentInvValue.toFixed(2)}€`);
      console.log(
        `    Capital inicial: ${totalCapital.toFixed(2)}€ (creation: ${capitalInfo.creation.toFixed(2)}€, add: ${capitalInfo.add.toFixed(2)}€)`,
      );
      console.log(`    Rendimiento: ${returnOfThis.toFixed(2)}€`);
    }
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugCapitalCalculation();
