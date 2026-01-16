import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugAllReturns() {
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

    console.log(`=== ANÁLISIS COMPLETO DE RENDIMIENTOS ===\n`);
    console.log(`Total inversiones: ${investments.length}\n`);

    // Calcular currentValue total
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });
    console.log(`Current Value Total: ${currentValue.toFixed(2)}€\n`);

    // === RENDIMIENTO MENSUAL ===
    console.log("=== RENDIMIENTO MENSUAL ===");
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);

    const investmentsExistingBeforeMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

    console.log(
      `Inversiones existentes antes del mes: ${investmentsExistingBeforeMonth.length}`,
    );

    let currentValueOfExisting = 0;
    investmentsExistingBeforeMonth.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValueOfExisting += value;
    });
    console.log(
      `Current Value (existentes): ${currentValueOfExisting.toFixed(2)}€`,
    );

    let currentValueOfNew = currentValue - currentValueOfExisting;
    console.log(`Current Value (nuevas): ${currentValueOfNew.toFixed(2)}€\n`);

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
      const variationLastDay = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $gte: lastDayOfPreviousMonth, $lt: lastDayOfPreviousMonthEnd },
      });

      if (variationLastDay && variationLastDay.totalValue) {
        monthStartValue += variationLastDay.totalValue;
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
          monthStartValue += lastHistory.totalValue;
        } else {
          const invCurrentValue = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          monthStartValue += invCurrentValue;
        }
      }
    }
    console.log(`Month Start Value: ${monthStartValue.toFixed(2)}€\n`);

    // Obtener operaciones del mes
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    const monthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    monthEnd.setHours(23, 59, 59, 999);

    let capitalAddedToNew = 0;
    let capitalAddedToOld = 0;
    let capitalWithdrawn = 0;

    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      if (entryDate >= monthStart && entryDate <= monthEnd) {
        if (entry.operation === "creation") {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.totalValue) {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            capitalAddedToNew += amount;
          }
        } else if (entry.operation === "add") {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            capitalAddedToOld += amount;
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
          capitalWithdrawn += amount;
        }
      }
    }

    const totalCapitalAdded = capitalAddedToNew + capitalAddedToOld;
    console.log(`Capital añadido (nuevas): ${capitalAddedToNew.toFixed(2)}€`);
    console.log(
      `Capital añadido (existentes): ${capitalAddedToOld.toFixed(2)}€`,
    );
    console.log(`Capital añadido (total): ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`Capital retirado: ${capitalWithdrawn.toFixed(2)}€\n`);

    // Calcular rendimiento mensual
    const monthlyReturn =
      currentValue - monthStartValue - totalCapitalAdded + capitalWithdrawn;

    const monthlyBaseValue =
      monthStartValue + totalCapitalAdded - capitalWithdrawn;
    const monthlyReturnPercent =
      monthlyBaseValue > 0 ? (monthlyReturn / monthlyBaseValue) * 100 : 0;

    console.log("CÁLCULO MENSUAL:");
    console.log(`  currentValue: ${currentValue.toFixed(2)}€`);
    console.log(`  monthStartValue: ${monthStartValue.toFixed(2)}€`);
    console.log(`  totalCapitalAdded: ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`  capitalWithdrawn: ${capitalWithdrawn.toFixed(2)}€`);
    console.log(
      `  monthlyReturn = ${currentValue.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${totalCapitalAdded.toFixed(2)} + ${capitalWithdrawn.toFixed(2)}`,
    );
    console.log(`  monthlyReturn = ${monthlyReturn.toFixed(2)}€`);
    console.log(
      `  monthlyReturnPercent = ${monthlyReturnPercent.toFixed(2)}%\n`,
    );

    // Verificar el cálculo paso a paso
    console.log("VERIFICACIÓN PASO A PASO:");
    console.log(
      `  1. Rendimiento de existentes = ${currentValueOfExisting.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${capitalAddedToOld.toFixed(2)} = ${(currentValueOfExisting - monthStartValue - capitalAddedToOld).toFixed(2)}€`,
    );
    console.log(
      `  2. Rendimiento de nuevas = ${currentValueOfNew.toFixed(2)} - ${capitalAddedToNew.toFixed(2)} = ${(currentValueOfNew - capitalAddedToNew).toFixed(2)}€`,
    );
    console.log(
      `  3. Total rendimiento = ${(currentValueOfExisting - monthStartValue - capitalAddedToOld + (currentValueOfNew - capitalAddedToNew) + capitalWithdrawn).toFixed(2)}€\n`,
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugAllReturns();
