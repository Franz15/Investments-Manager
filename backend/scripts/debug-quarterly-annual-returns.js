import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugQuarterlyAnnualReturns() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("=== DEBUG DE RENDIMIENTOS TRIMESTRAL Y ANUAL ===\n");

    const userId = "ana";
    const currentDate = new Date();

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    // Calcular valor actual
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });

    console.log(`Valor actual total: ${currentValue.toFixed(2)}€\n`);

    // === RENDIMIENTO ANUAL ===
    console.log("=== RENDIMIENTO ANUAL ===\n");
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    yearStart.setHours(0, 0, 0, 0);

    // Calcular yearStartValue (simplificado)
    let yearStartValue = 0;
    const lastDayOfPreviousYear = new Date(currentYear - 1, 11, 31);
    lastDayOfPreviousYear.setHours(0, 0, 0, 0);
    const lastDayEnd = new Date(lastDayOfPreviousYear);
    lastDayEnd.setDate(lastDayEnd.getDate() + 1);

    const variationsDec31 = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: lastDayOfPreviousYear, $lt: lastDayEnd },
    });

    if (variationsDec31.length > 0) {
      variationsDec31.forEach((v) => {
        yearStartValue += v.totalValue || 0;
      });
    }

    // Identificar inversiones nuevas en el año
    const investmentsNewThisYear = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= yearStart;
    });

    let capitalAddedToNewInvestments = 0;
    let capitalAddedToOldInvestments = 0;
    let capitalWithdrawnThisYear = 0;

    // Procesar operaciones del año
    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      if (entryDate >= yearStart) {
        if (entry.operation === "creation") {
          let amount =
            entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0) ||
            entry.totalValue ||
            0;
          if (amount >= 0) {
            capitalAddedToNewInvestments += amount;
          }
        } else if (entry.operation === "add") {
          let amount =
            entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0);
          if (amount >= 0) {
            capitalAddedToOldInvestments += amount;
          }
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          let amount = Math.abs(
            entry.operationAmount ||
              (entry.operationPrice && entry.quantity
                ? entry.operationPrice * entry.quantity
                : 0),
          );
          capitalWithdrawnThisYear += amount;
        }
      }
    }

    // Verificar inversiones nuevas sin "creation" EN EL AÑO
    for (const inv of investmentsNewThisYear) {
      const hasCreationEntryInYear = allHistoryEntries.some((entry) => {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === inv._id.toString() &&
          entry.operation === "creation" &&
          entryDate >= yearStart
        );
      });

      if (!hasCreationEntryInYear) {
        const firstHistoryEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $gte: yearStart },
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
          capitalAddedToNewInvestments += initialCapital;
          console.log(
            `  Inversión sin "creation" en el año: ${inv.name} - ${initialCapital.toFixed(2)}€`,
          );
        }
      }
    }

    const totalCapitalAddedThisYear =
      capitalAddedToNewInvestments + capitalAddedToOldInvestments;
    const annualReturn =
      currentValue -
      yearStartValue -
      totalCapitalAddedThisYear +
      capitalWithdrawnThisYear;
    const baseValue =
      yearStartValue + totalCapitalAddedThisYear - capitalWithdrawnThisYear;
    const annualReturnPercent =
      baseValue > 0 ? (annualReturn / baseValue) * 100 : 0;

    console.log(`  yearStartValue: ${yearStartValue.toFixed(2)}€`);
    console.log(
      `  capitalAddedToNewInvestments: ${capitalAddedToNewInvestments.toFixed(2)}€`,
    );
    console.log(
      `  capitalAddedToOldInvestments: ${capitalAddedToOldInvestments.toFixed(2)}€`,
    );
    console.log(
      `  capitalWithdrawnThisYear: ${capitalWithdrawnThisYear.toFixed(2)}€`,
    );
    console.log(
      `  totalCapitalAddedThisYear: ${totalCapitalAddedThisYear.toFixed(2)}€`,
    );
    console.log(
      `  annualReturn = ${currentValue.toFixed(2)} - ${yearStartValue.toFixed(2)} - ${totalCapitalAddedThisYear.toFixed(2)} + ${capitalWithdrawnThisYear.toFixed(2)}`,
    );
    console.log(`  annualReturn = ${annualReturn.toFixed(2)}€`);
    console.log(`  annualReturnPercent = ${annualReturnPercent.toFixed(2)}%\n`);

    // === RENDIMIENTO TRIMESTRAL ===
    console.log("=== RENDIMIENTO TRIMESTRAL ===\n");
    const currentMonth = currentDate.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const quarterStart = new Date(
      currentDate.getFullYear(),
      quarterStartMonth,
      1,
    );
    quarterStart.setHours(0, 0, 0, 0);

    // Calcular quarterStartValue (simplificado)
    let quarterStartValue = 0;
    const lastDayOfPreviousQuarter = new Date(quarterStart);
    lastDayOfPreviousQuarter.setDate(lastDayOfPreviousQuarter.getDate() - 1);
    lastDayOfPreviousQuarter.setHours(0, 0, 0, 0);
    const lastDayOfPreviousQuarterEnd = new Date(lastDayOfPreviousQuarter);
    lastDayOfPreviousQuarterEnd.setDate(
      lastDayOfPreviousQuarterEnd.getDate() + 1,
    );

    const variationsLastDay = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: {
        $gte: lastDayOfPreviousQuarter,
        $lt: lastDayOfPreviousQuarterEnd,
      },
    });

    if (variationsLastDay.length > 0) {
      variationsLastDay.forEach((v) => {
        quarterStartValue += v.totalValue || 0;
      });
    }

    // Identificar inversiones nuevas en el trimestre
    const investmentsNewThisQuarter = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= quarterStart;
    });

    let capitalAddedToNewInvestmentsThisQuarter = 0;
    let capitalAddedToOldInvestmentsThisQuarter = 0;
    let capitalWithdrawnThisQuarter = 0;

    // Procesar operaciones del trimestre
    for (const entry of allHistoryEntries) {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);

      if (entryDate >= quarterStart) {
        if (entry.operation === "creation") {
          let amount =
            entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0) ||
            entry.totalValue ||
            0;
          if (amount >= 0) {
            capitalAddedToNewInvestmentsThisQuarter += amount;
          }
        } else if (entry.operation === "add") {
          let amount =
            entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0);
          if (amount >= 0) {
            capitalAddedToOldInvestmentsThisQuarter += amount;
          }
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          let amount = Math.abs(
            entry.operationAmount ||
              (entry.operationPrice && entry.quantity
                ? entry.operationPrice * entry.quantity
                : 0),
          );
          capitalWithdrawnThisQuarter += amount;
        }
      }
    }

    // Verificar inversiones nuevas sin "creation" EN EL TRIMESTRE
    for (const inv of investmentsNewThisQuarter) {
      const hasCreationEntryInQuarter = allHistoryEntries.some((entry) => {
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === inv._id.toString() &&
          entry.operation === "creation" &&
          entryDate >= quarterStart
        );
      });

      if (!hasCreationEntryInQuarter) {
        const firstHistoryEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $gte: quarterStart },
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
          capitalAddedToNewInvestmentsThisQuarter += initialCapital;
          console.log(
            `  Inversión sin "creation" en el trimestre: ${inv.name} - ${initialCapital.toFixed(2)}€`,
          );
        }
      }
    }

    const totalCapitalAddedThisQuarter =
      capitalAddedToNewInvestmentsThisQuarter +
      capitalAddedToOldInvestmentsThisQuarter;
    const quarterlyReturn =
      currentValue -
      quarterStartValue -
      totalCapitalAddedThisQuarter +
      capitalWithdrawnThisQuarter;
    const quarterlyBaseValue =
      quarterStartValue +
      totalCapitalAddedThisQuarter -
      capitalWithdrawnThisQuarter;
    const quarterlyReturnPercent =
      quarterlyBaseValue > 0 ? (quarterlyReturn / quarterlyBaseValue) * 100 : 0;

    console.log(`  quarterStartValue: ${quarterStartValue.toFixed(2)}€`);
    console.log(
      `  capitalAddedToNewInvestmentsThisQuarter: ${capitalAddedToNewInvestmentsThisQuarter.toFixed(2)}€`,
    );
    console.log(
      `  capitalAddedToOldInvestmentsThisQuarter: ${capitalAddedToOldInvestmentsThisQuarter.toFixed(2)}€`,
    );
    console.log(
      `  capitalWithdrawnThisQuarter: ${capitalWithdrawnThisQuarter.toFixed(2)}€`,
    );
    console.log(
      `  totalCapitalAddedThisQuarter: ${totalCapitalAddedThisQuarter.toFixed(2)}€`,
    );
    console.log(
      `  quarterlyReturn = ${currentValue.toFixed(2)} - ${quarterStartValue.toFixed(2)} - ${totalCapitalAddedThisQuarter.toFixed(2)} + ${capitalWithdrawnThisQuarter.toFixed(2)}`,
    );
    console.log(`  quarterlyReturn = ${quarterlyReturn.toFixed(2)}€`);
    console.log(
      `  quarterlyReturnPercent = ${quarterlyReturnPercent.toFixed(2)}%\n`,
    );
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

debugQuarterlyAnnualReturns();
