import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function explainAnaReturn() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("=== EXPLICACIÓN DEL RENDIMIENTO MENSUAL DE ANA ===\n");

    const userId = "ana";
    const currentDate = new Date();

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

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
      `Período: ${monthStart.toISOString().split("T")[0]} a ${monthEnd.toISOString().split("T")[0]}\n`,
    );

    // Separar inversiones
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

    // Calcular valores actuales
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

    console.log(`1. VALOR ACTUAL TOTAL: ${currentValue.toFixed(2)}€`);
    console.log(
      `   - Inversiones existentes: ${currentValueOfExisting.toFixed(2)}€`,
    );
    console.log(`   - Inversiones nuevas: ${currentValueOfNew.toFixed(2)}€\n`);

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

    console.log(
      `2. VALOR AL INICIO DEL MES (solo existentes): ${monthStartValue.toFixed(2)}€\n`,
    );

    // Obtener operaciones del mes
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart, $lte: monthEnd },
    }).sort({ date: 1 });

    let capitalAddedToNew = 0;
    let capitalAddedToOld = 0;
    let capitalWithdrawn = 0;

    // Procesar operaciones registradas
    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      const invId =
        entry.investment?.toString() || entry.investment?._id?.toString();
      const isNewInvestment = investmentsNewThisMonth.some(
        (inv) => inv._id.toString() === invId,
      );

      let amount = 0;

      if (entry.operation === "creation") {
        amount =
          entry.operationAmount ||
          (entry.operationPrice && entry.quantity
            ? entry.operationPrice * entry.quantity
            : 0) ||
          entry.totalValue ||
          0;
        amount = amount || 0;
        if (amount >= 0) {
          capitalAddedToNew += amount;
        }
      } else if (entry.operation === "add") {
        amount =
          entry.operationAmount ||
          (entry.operationPrice && entry.quantity
            ? entry.operationPrice * entry.quantity
            : 0);
        amount = amount || 0;
        if (amount >= 0) {
          if (isNewInvestment) {
            capitalAddedToNew += amount;
          } else {
            capitalAddedToOld += amount;
          }
        }
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        amount = Math.abs(
          entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0) ||
            0,
        );
        capitalWithdrawn += amount;
      }
    }

    // Verificar inversiones nuevas sin operación "creation"
    for (const inv of investmentsNewThisMonth) {
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
          date: { $gte: monthStart },
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

        // Si no hay historial, usar purchasePrice * quantity
        if (initialCapital === 0) {
          if (inv.isAutomatedPortfolio) {
            initialCapital = inv.quantity || 0;
          } else {
            initialCapital = (inv.quantity || 0) * (inv.purchasePrice || 0);
          }
        }

        // Último recurso: valor actual
        if (initialCapital === 0) {
          initialCapital = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
        }

        if (initialCapital > 0) {
          capitalAddedToNew += initialCapital;
          console.log(`   Inversión sin "creation": ${inv.name}`);
          console.log(`     - purchasePrice: ${inv.purchasePrice || "N/A"}`);
          console.log(`     - quantity: ${inv.quantity || 0}`);
          console.log(
            `     - Capital calculado: ${initialCapital.toFixed(2)}€\n`,
          );
        }
      }
    }

    const totalCapitalAdded = capitalAddedToNew + capitalAddedToOld;

    console.log(`3. CAPITAL AÑADIDO DURANTE EL MES:`);
    console.log(`   - A inversiones nuevas: ${capitalAddedToNew.toFixed(2)}€`);
    console.log(
      `   - A inversiones existentes: ${capitalAddedToOld.toFixed(2)}€`,
    );
    console.log(`   - Total: ${totalCapitalAdded.toFixed(2)}€\n`);

    console.log(`4. CAPITAL RETIRADO: ${capitalWithdrawn.toFixed(2)}€\n`);

    // Calcular rendimiento
    const monthlyReturn =
      currentValue - monthStartValue - totalCapitalAdded + capitalWithdrawn;

    const monthlyBaseValue =
      monthStartValue + totalCapitalAdded - capitalWithdrawn;
    const monthlyReturnPercent =
      monthlyBaseValue > 0 ? (monthlyReturn / monthlyBaseValue) * 100 : 0;

    console.log(`=== CÁLCULO DEL RENDIMIENTO MENSUAL ===\n`);
    console.log(`Fórmula:`);
    console.log(
      `  Rendimiento = Valor Actual - Valor Inicio Mes - Capital Añadido + Capital Retirado\n`,
    );
    console.log(`Cálculo:`);
    console.log(
      `  Rendimiento = ${currentValue.toFixed(2)}€ - ${monthStartValue.toFixed(2)}€ - ${totalCapitalAdded.toFixed(2)}€ + ${capitalWithdrawn.toFixed(2)}€`,
    );
    console.log(`  Rendimiento = ${monthlyReturn.toFixed(2)}€\n`);
    console.log(`Porcentaje:`);
    console.log(
      `  Base = ${monthStartValue.toFixed(2)}€ + ${totalCapitalAdded.toFixed(2)}€ - ${capitalWithdrawn.toFixed(2)}€ = ${monthlyBaseValue.toFixed(2)}€`,
    );
    console.log(
      `  Porcentaje = (${monthlyReturn.toFixed(2)}€ / ${monthlyBaseValue.toFixed(2)}€) × 100 = ${monthlyReturnPercent.toFixed(2)}%\n`,
    );

    // Desglose
    console.log(`=== DESGLOSE DETALLADO ===\n`);
    const returnOfExisting =
      currentValueOfExisting - monthStartValue - capitalAddedToOld;
    const returnOfNew = currentValueOfNew - capitalAddedToNew;

    console.log(`Rendimiento de inversiones existentes:`);
    console.log(
      `  ${currentValueOfExisting.toFixed(2)}€ (valor actual) - ${monthStartValue.toFixed(2)}€ (valor inicio) - ${capitalAddedToOld.toFixed(2)}€ (capital añadido) = ${returnOfExisting.toFixed(2)}€\n`,
    );

    console.log(`Rendimiento de inversiones nuevas:`);
    console.log(
      `  ${currentValueOfNew.toFixed(2)}€ (valor actual) - ${capitalAddedToNew.toFixed(2)}€ (capital inicial) = ${returnOfNew.toFixed(2)}€\n`,
    );

    console.log(`Total rendimiento:`);
    console.log(
      `  ${returnOfExisting.toFixed(2)}€ + ${returnOfNew.toFixed(2)}€ + ${capitalWithdrawn.toFixed(2)}€ = ${(returnOfExisting + returnOfNew + capitalWithdrawn).toFixed(2)}€\n`,
    );
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

explainAnaReturn();
