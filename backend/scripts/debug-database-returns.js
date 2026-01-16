import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugDatabaseReturns() {
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

    console.log(`=== REVISIÓN COMPLETA DE BASE DE DATOS ===\n`);
    console.log(`Total inversiones: ${investments.length}\n`);

    // Calcular currentValue total
    let currentValue = 0;
    console.log("=== VALORES ACTUALES DE INVERSIONES ===");
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
      console.log(
        `  ${inv.name}: ${value.toFixed(2)}€ (${inv.isAutomatedPortfolio ? "Portfolio" : `${inv.quantity || 0} x ${inv.currentPrice || 0}`})`,
      );
    });
    console.log(`\nCurrent Value Total: ${currentValue.toFixed(2)}€\n`);

    // === RENDIMIENTO MENSUAL ===
    console.log("=== RENDIMIENTO MENSUAL ===");
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
      `Mes actual: ${monthStart.toISOString().split("T")[0]} a ${monthEnd.toISOString().split("T")[0]}\n`,
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
      `Inversiones existentes antes del mes: ${investmentsExistingBeforeMonth.length}`,
    );
    console.log(
      `Inversiones nuevas este mes: ${investmentsNewThisMonth.length}\n`,
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

    // Calcular monthStartValue de forma exhaustiva
    const lastDayOfPreviousMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    );
    lastDayOfPreviousMonth.setHours(0, 0, 0, 0);
    const lastDayOfPreviousMonthEnd = new Date(lastDayOfPreviousMonth);
    lastDayOfPreviousMonthEnd.setDate(lastDayOfPreviousMonthEnd.getDate() + 1);

    console.log("=== CÁLCULO DE monthStartValue ===");
    let monthStartValue = 0;
    for (const inv of investmentsExistingBeforeMonth) {
      let invValueAtMonthStart = 0;
      let source = "";

      // 1. Intentar DailyVariation del último día del mes anterior
      const variationLastDay = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $gte: lastDayOfPreviousMonth, $lt: lastDayOfPreviousMonthEnd },
      });

      if (variationLastDay && variationLastDay.totalValue) {
        invValueAtMonthStart = variationLastDay.totalValue;
        source = `DailyVariation (${variationLastDay.date.toISOString().split("T")[0]})`;
      } else {
        // 2. Intentar DailyVariation más reciente anterior al mes
        const lastVariation = await DailyVariation.findOne({
          user: userId,
          investment: inv._id,
          date: { $lt: monthStart },
        })
          .sort({ date: -1 })
          .limit(1);

        if (lastVariation && lastVariation.totalValue) {
          invValueAtMonthStart = lastVariation.totalValue;
          source = `DailyVariation anterior (${lastVariation.date.toISOString().split("T")[0]})`;
        } else {
          // 3. Intentar InvestmentHistory con totalValue
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
            source = `InvestmentHistory (${lastHistory.date.toISOString().split("T")[0]})`;
          } else {
            // 4. Fallback: usar valor actual
            invValueAtMonthStart = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
            source = "Valor actual (fallback)";
          }
        }
      }

      monthStartValue += invValueAtMonthStart;
      console.log(
        `  ${inv.name}: ${invValueAtMonthStart.toFixed(2)}€ [${source}]`,
      );
    }
    console.log(`\nMonth Start Value Total: ${monthStartValue.toFixed(2)}€\n`);

    // Obtener TODAS las operaciones del mes
    console.log("=== OPERACIONES DE CAPITAL DURANTE EL MES ===");
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart, $lte: monthEnd },
    })
      .populate("investment")
      .sort({ date: 1 });

    console.log(`Total operaciones en el mes: ${allHistoryEntries.length}\n`);

    let capitalAddedToNew = 0;
    let capitalAddedToOld = 0;
    let capitalWithdrawn = 0;

    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

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
          const invName =
            entry.investment?.name || entry.investment?.toString() || "Unknown";
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
          capitalAddedToOld += amount;
          const invName =
            entry.investment?.name || entry.investment?.toString() || "Unknown";
          console.log(
            `  ADD: ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
          );
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
        const invName =
          entry.investment?.name || entry.investment?.toString() || "Unknown";
        console.log(
          `  ${entry.operation.toUpperCase()}: ${invName} - ${amount.toFixed(2)}€ [${amountSource}] - ${entry.date.toISOString().split("T")[0]}`,
        );
      }
    }

    const totalCapitalAdded = capitalAddedToNew + capitalAddedToOld;
    console.log(`\nResumen:`);
    console.log(`  Capital añadido (nuevas): ${capitalAddedToNew.toFixed(2)}€`);
    console.log(
      `  Capital añadido (existentes): ${capitalAddedToOld.toFixed(2)}€`,
    );
    console.log(`  Capital añadido (total): ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`  Capital retirado: ${capitalWithdrawn.toFixed(2)}€\n`);

    // Calcular rendimiento mensual
    const monthlyReturn =
      currentValue - monthStartValue - totalCapitalAdded + capitalWithdrawn;

    const monthlyBaseValue =
      monthStartValue + totalCapitalAdded - capitalWithdrawn;
    const monthlyReturnPercent =
      monthlyBaseValue > 0 ? (monthlyReturn / monthlyBaseValue) * 100 : 0;

    console.log("=== CÁLCULO FINAL DEL RENDIMIENTO MENSUAL ===");
    console.log(`  currentValue (TODAS): ${currentValue.toFixed(2)}€`);
    console.log(
      `  monthStartValue (existentes): ${monthStartValue.toFixed(2)}€`,
    );
    console.log(`  totalCapitalAdded: ${totalCapitalAdded.toFixed(2)}€`);
    console.log(`  capitalWithdrawn: ${capitalWithdrawn.toFixed(2)}€`);
    console.log(
      `\n  monthlyReturn = ${currentValue.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${totalCapitalAdded.toFixed(2)} + ${capitalWithdrawn.toFixed(2)}`,
    );
    console.log(`  monthlyReturn = ${monthlyReturn.toFixed(2)}€`);
    console.log(
      `\n  monthlyBaseValue = ${monthStartValue.toFixed(2)} + ${totalCapitalAdded.toFixed(2)} - ${capitalWithdrawn.toFixed(2)}`,
    );
    console.log(`  monthlyBaseValue = ${monthlyBaseValue.toFixed(2)}€`);
    console.log(
      `  monthlyReturnPercent = (${monthlyReturn.toFixed(2)} / ${monthlyBaseValue.toFixed(2)}) * 100`,
    );
    console.log(
      `  monthlyReturnPercent = ${monthlyReturnPercent.toFixed(2)}%\n`,
    );

    // Verificación paso a paso
    console.log("=== VERIFICACIÓN PASO A PASO ===");
    const returnOfExisting =
      currentValueOfExisting - monthStartValue - capitalAddedToOld;
    const returnOfNew = currentValueOfNew - capitalAddedToNew;
    const totalReturn = returnOfExisting + returnOfNew + capitalWithdrawn;

    console.log(
      `  1. Rendimiento de existentes = ${currentValueOfExisting.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${capitalAddedToOld.toFixed(2)} = ${returnOfExisting.toFixed(2)}€`,
    );
    console.log(
      `  2. Rendimiento de nuevas = ${currentValueOfNew.toFixed(2)} - ${capitalAddedToNew.toFixed(2)} = ${returnOfNew.toFixed(2)}€`,
    );
    console.log(`  3. Capital retirado = ${capitalWithdrawn.toFixed(2)}€`);
    console.log(
      `  4. Total rendimiento = ${returnOfExisting.toFixed(2)} + ${returnOfNew.toFixed(2)} + ${capitalWithdrawn.toFixed(2)} = ${totalReturn.toFixed(2)}€`,
    );
    console.log(
      `  5. Verificación: ${monthlyReturn.toFixed(2)}€ === ${totalReturn.toFixed(2)}€ ? ${Math.abs(monthlyReturn - totalReturn) < 0.01 ? "✓" : "✗"}\n`,
    );

    // Revisar inversiones nuevas en detalle
    if (investmentsNewThisMonth.length > 0) {
      console.log("=== DETALLE DE INVERSIONES NUEVAS ===");
      for (const inv of investmentsNewThisMonth) {
        const currentInvValue = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);

        // Buscar la operación de creación
        const creationEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          operation: "creation",
          date: { $gte: monthStart, $lte: monthEnd },
        });

        let initialCapital = 0;
        if (creationEntry) {
          initialCapital =
            creationEntry.operationAmount ||
            (creationEntry.operationPrice && creationEntry.quantity
              ? creationEntry.operationPrice * creationEntry.quantity
              : 0) ||
            creationEntry.totalValue ||
            0;
        }

        const returnOfThisNew = currentInvValue - initialCapital;
        console.log(`  ${inv.name}:`);
        console.log(`    Valor actual: ${currentInvValue.toFixed(2)}€`);
        console.log(`    Capital inicial: ${initialCapital.toFixed(2)}€`);
        console.log(`    Rendimiento: ${returnOfThisNew.toFixed(2)}€`);
      }
      console.log();
    }
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugDatabaseReturns();
