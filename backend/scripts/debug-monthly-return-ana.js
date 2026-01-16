import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugMonthlyReturnAna() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB\n");

    const userId = "ana";
    const currentDate = new Date();
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);

    // Obtener todas las inversiones
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    console.log(`Total inversiones: ${investments.length}\n`);

    // Calcular currentValue total
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
      console.log(
        `- ${inv.name}: ${value.toFixed(2)}€ (creada: ${new Date(inv.purchaseDate).toISOString().split("T")[0]})`,
      );
    });

    console.log(`\nCurrent Value Total: ${currentValue.toFixed(2)}€\n`);

    // Filtrar inversiones que existían antes del mes
    const investmentsExistingBeforeMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

    console.log(
      `Inversiones que existían antes del mes: ${investmentsExistingBeforeMonth.length}`,
    );

    let currentValueOfExisting = 0;
    investmentsExistingBeforeMonth.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValueOfExisting += value;
    });

    console.log(
      `Current Value (solo existentes): ${currentValueOfExisting.toFixed(2)}€\n`,
    );

    // Calcular monthStartValue
    const lastDayOfPreviousMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    );
    lastDayOfPreviousMonth.setHours(0, 0, 0, 0);
    const lastDayOfPreviousMonthEnd = new Date(lastDayOfPreviousMonth);
    lastDayOfPreviousMonthEnd.setDate(lastDayOfPreviousMonthEnd.getDate() + 1);

    const existingInvestmentIds = investmentsExistingBeforeMonth.map(
      (inv) => inv._id,
    );

    const variationsLastDay = await DailyVariation.find({
      user: userId,
      investment: { $in: existingInvestmentIds },
      date: { $gte: lastDayOfPreviousMonth, $lt: lastDayOfPreviousMonthEnd },
    });

    let monthStartValue = 0;
    if (variationsLastDay.length > 0) {
      variationsLastDay.forEach((v) => {
        monthStartValue += v.totalValue || 0;
      });
      console.log(
        `Month Start Value (desde DailyVariation): ${monthStartValue.toFixed(2)}€`,
      );
    } else {
      console.log("No hay variaciones del último día del mes anterior");
    }

    // Obtener operaciones de capital del mes
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

    console.log("\nOperaciones de capital durante el mes:");
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
            console.log(
              `  CREATION: ${amount.toFixed(2)}€ (${new Date(entry.date).toISOString().split("T")[0]}) - ${entry.investment}`,
            );
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
            console.log(
              `  ADD: ${amount.toFixed(2)}€ (${new Date(entry.date).toISOString().split("T")[0]}) - ${entry.investment}`,
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
          capitalWithdrawn += amount;
          console.log(
            `  ${entry.operation.toUpperCase()}: ${amount.toFixed(2)}€ (${new Date(entry.date).toISOString().split("T")[0]}) - ${entry.investment}`,
          );
        }
      }
    }

    const totalCapitalAdded = capitalAddedToNew + capitalAddedToOld;

    console.log(`\nCapital añadido (nuevas): ${capitalAddedToNew.toFixed(2)}€`);
    console.log(
      `Capital añadido (existentes): ${capitalAddedToOld.toFixed(2)}€`,
    );
    console.log(`Capital añadido (total): ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`Capital retirado: ${capitalWithdrawn.toFixed(2)}€\n`);

    // Calcular rendimiento mensual
    const monthlyReturn =
      currentValueOfExisting -
      monthStartValue -
      totalCapitalAdded +
      capitalWithdrawn;

    console.log("=== CÁLCULO DEL RENDIMIENTO MENSUAL ===");
    console.log(
      `Current Value (existentes): ${currentValueOfExisting.toFixed(2)}€`,
    );
    console.log(`Month Start Value: ${monthStartValue.toFixed(2)}€`);
    console.log(`Capital Añadido: ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`Capital Retirado: ${capitalWithdrawn.toFixed(2)}€`);
    console.log(
      `\nMonthly Return = ${currentValueOfExisting.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${totalCapitalAdded.toFixed(2)} + ${capitalWithdrawn.toFixed(2)}`,
    );
    console.log(`Monthly Return = ${monthlyReturn.toFixed(2)}€\n`);

    // También calcular con currentValue total para comparar
    const monthlyReturnWithAll =
      currentValue - monthStartValue - totalCapitalAdded + capitalWithdrawn;
    console.log(
      `Monthly Return (con todas las inversiones): ${monthlyReturnWithAll.toFixed(2)}€`,
    );
    console.log(
      `Diferencia: ${(monthlyReturnWithAll - monthlyReturn).toFixed(2)}€\n`,
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugMonthlyReturnAna();
