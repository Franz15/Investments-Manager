import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function finalDebugReturn() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("=== DEBUG FINAL DEL RENDIMIENTO MENSUAL ===\n");

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

    const investmentsNewThisMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= monthStart;
    });

    // Obtener TODAS las operaciones (sin filtrar por fecha para verificar hasCreationEntry)
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    // Obtener operaciones del mes
    const monthHistoryEntries = allHistoryEntries.filter((entry) => {
      const entryDate = new Date(entry.date);
      entryDate.setHours(0, 0, 0, 0);
      return entryDate >= monthStart && entryDate <= monthEnd;
    });

    console.log(`Inversiones nuevas: ${investmentsNewThisMonth.length}`);
    console.log(`Operaciones totales: ${allHistoryEntries.length}`);
    console.log(`Operaciones del mes: ${monthHistoryEntries.length}\n`);

    let capitalAddedToNew = 0;
    let capitalAddedToOld = 0;

    // Procesar operaciones del mes
    for (const entry of monthHistoryEntries) {
      const entryInvId =
        entry.investment?.toString() || entry.investment?._id?.toString();
      const isNewInvestment = investmentsNewThisMonth.some(
        (inv) => inv._id.toString() === entryInvId,
      );

      if (entry.operation === "creation") {
        const amount =
          entry.operationAmount ||
          (entry.operationPrice && entry.quantity
            ? entry.operationPrice * entry.quantity
            : 0) ||
          entry.totalValue ||
          0;
        if (amount > 0) {
          capitalAddedToNew += amount;
        }
      } else if (entry.operation === "add") {
        const amount =
          entry.operationAmount ||
          (entry.operationPrice && entry.quantity
            ? entry.operationPrice * entry.quantity
            : 0);
        if (amount > 0) {
          if (isNewInvestment) {
            capitalAddedToNew += amount;
          } else {
            capitalAddedToOld += amount;
          }
        }
      }
    }

    console.log(`Capital añadido (de operaciones):`);
    console.log(`  - Nuevas: ${capitalAddedToNew.toFixed(2)}€`);
    console.log(`  - Existentes: ${capitalAddedToOld.toFixed(2)}€\n`);

    // Verificar inversiones nuevas sin "creation" EN EL MES
    console.log(
      `Verificando inversiones nuevas sin operación "creation" EN EL MES:`,
    );
    let missingCapital = 0;

    for (const inv of investmentsNewThisMonth) {
      // Verificar si tiene "creation" EN EL MES
      const hasCreationEntryInMonth = monthHistoryEntries.some((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        const entryDate = new Date(entry.date);
        entryDate.setHours(0, 0, 0, 0);
        return (
          entryInvId === inv._id.toString() &&
          entry.operation === "creation" &&
          entryDate >= monthStart
        );
      });

      // También verificar si tiene "creation" en CUALQUIER fecha (por si acaso)
      const hasCreationEntryAnywhere = allHistoryEntries.some((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === inv._id.toString() && entry.operation === "creation"
        );
      });

      if (!hasCreationEntryInMonth) {
        console.log(`\n  ${inv.name}:`);
        console.log(
          `    - Tiene "creation" en el mes: ${hasCreationEntryInMonth ? "Sí" : "No"}`,
        );
        console.log(
          `    - Tiene "creation" en cualquier fecha: ${hasCreationEntryAnywhere ? "Sí" : "No"}`,
        );

        // Buscar primera entrada del mes
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
          console.log(
            `    - Capital desde historial (${firstHistoryEntry.operation}): ${initialCapital.toFixed(2)}€`,
          );
        }

        if (initialCapital === 0) {
          if (inv.isAutomatedPortfolio) {
            initialCapital = inv.quantity || 0;
          } else {
            initialCapital = (inv.quantity || 0) * (inv.purchasePrice || 0);
          }
          console.log(
            `    - Capital desde purchasePrice*quantity: ${initialCapital.toFixed(2)}€`,
          );
        }

        if (initialCapital === 0) {
          initialCapital = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          console.log(
            `    - Capital desde valor actual (fallback): ${initialCapital.toFixed(2)}€`,
          );
        }

        missingCapital += initialCapital;
        console.log(`    - Capital a agregar: ${initialCapital.toFixed(2)}€`);
      }
    }

    const totalCapitalAdded =
      capitalAddedToNew + capitalAddedToOld + missingCapital;

    console.log(`\n=== RESUMEN FINAL ===`);
    console.log(`Capital añadido:`);
    console.log(
      `  - De operaciones "creation"/"add": ${(capitalAddedToNew + capitalAddedToOld).toFixed(2)}€`,
    );
    console.log(
      `  - De inversiones sin "creation": ${missingCapital.toFixed(2)}€`,
    );
    console.log(`  - TOTAL: ${totalCapitalAdded.toFixed(2)}€\n`);

    // Calcular valores
    let currentValue = 0;
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      currentValue += value;
    });

    const investmentsExistingBeforeMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

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

    const monthlyReturn = currentValue - monthStartValue - totalCapitalAdded;
    const monthlyBaseValue = monthStartValue + totalCapitalAdded;
    const monthlyReturnPercent =
      monthlyBaseValue > 0 ? (monthlyReturn / monthlyBaseValue) * 100 : 0;

    console.log(`Cálculo final:`);
    console.log(`  currentValue: ${currentValue.toFixed(2)}€`);
    console.log(`  monthStartValue: ${monthStartValue.toFixed(2)}€`);
    console.log(`  totalCapitalAdded: ${totalCapitalAdded.toFixed(2)}€`);
    console.log(
      `  monthlyReturn = ${currentValue.toFixed(2)} - ${monthStartValue.toFixed(2)} - ${totalCapitalAdded.toFixed(2)}`,
    );
    console.log(`  monthlyReturn = ${monthlyReturn.toFixed(2)}€`);
    console.log(
      `  monthlyReturnPercent = ${monthlyReturnPercent.toFixed(2)}%\n`,
    );
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

finalDebugReturn();
