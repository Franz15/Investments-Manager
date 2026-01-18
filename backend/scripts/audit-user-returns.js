import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const toDayKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getOperationAmount = (entry) => {
  let amount = entry.operationAmount;
  if (!amount || amount === 0) {
    if (entry.operationPrice && entry.quantity) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry.operation === "creation" && entry.totalValue) {
      amount = entry.totalValue;
    }
  }
  return amount || 0;
};

const getImpliedCapital = (inv) => {
  if (inv.isAutomatedPortfolio) {
    return inv.quantity || 0;
  }
  const priceToUse = inv.averagePurchasePrice || inv.purchasePrice || 0;
  return (inv.quantity || 0) * priceToUse;
};

const getCurrentValue = (inv) =>
  inv.isAutomatedPortfolio
    ? inv.currentPrice || 0
    : (inv.quantity || 0) * (inv.currentPrice || 0);

const calculateNetCapitalChange = (entries, start, end) => {
  if (!start || !end) return 0;
  const s = new Date(start);
  const e = new Date(end);
  let net = 0;

  entries.forEach((entry) => {
    if (!entry?.date) return;
    const entryDate = new Date(entry.date);
    if (entryDate < s || entryDate > e) return;

    if (entry.operation === "creation" || entry.operation === "add") {
      let amount = getOperationAmount(entry);
      if (amount < 0) amount = 0;
      net += amount;
    } else if (entry.operation === "sell" || entry.operation === "withdraw") {
      const amount = Math.abs(getOperationAmount(entry));
      net -= amount;
    }
  });

  return net;
};

const findVariationValueBefore = async (user, invId, date) => {
  const variation = await DailyVariation.findOne({
    user,
    investment: invId,
    date: { $lt: date },
  })
    .sort({ date: -1 })
    .limit(1);

  if (variation && variation.totalValue) {
    return { value: variation.totalValue, source: "DailyVariation" };
  }

  const history = await InvestmentHistory.findOne({
    user,
    investment: invId,
    date: { $lt: date },
    totalValue: { $exists: true, $ne: null, $gt: 0 },
  })
    .sort({ date: -1 })
    .limit(1);

  if (history && history.totalValue) {
    return { value: history.totalValue, source: "InvestmentHistory" };
  }

  return { value: null, source: "none" };
};

const findVariationValueOnDate = async (user, invId, dayStart, dayEnd) => {
  const variation = await DailyVariation.findOne({
    user,
    investment: invId,
    date: { $gte: dayStart, $lt: dayEnd },
  });

  if (
    variation &&
    variation.totalValue !== null &&
    variation.totalValue !== undefined
  ) {
    return { value: variation.totalValue, source: "DailyVariation(day)" };
  }

  return { value: null, source: "none" };
};

const calculatePortfolioValueAtDate = async (user, investments, dayStart) => {
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  let total = 0;
  const missing = [];

  for (const inv of investments) {
    const { value, source } = await findVariationValueOnDate(
      user,
      inv._id,
      dayStart,
      dayEnd,
    );
    if (value !== null && value !== undefined) {
      total += value;
      continue;
    }

    const fallback = await findVariationValueBefore(user, inv._id, dayStart);
    if (fallback.value !== null && fallback.value !== undefined) {
      total += fallback.value;
      missing.push({ name: inv.name, source: fallback.source });
      continue;
    }

    const currentValue = getCurrentValue(inv);
    total += currentValue;
    missing.push({ name: inv.name, source: "currentValue" });
  }

  return { total, missing };
};

const calculatePortfolioValueBeforeDate = async (user, investments, date) => {
  let total = 0;
  const missing = [];

  for (const inv of investments) {
    const fallback = await findVariationValueBefore(user, inv._id, date);
    if (fallback.value !== null && fallback.value !== undefined) {
      total += fallback.value;
      if (fallback.source !== "DailyVariation") {
        missing.push({ name: inv.name, source: fallback.source });
      }
      continue;
    }

    const currentValue = getCurrentValue(inv);
    total += currentValue;
    missing.push({ name: inv.name, source: "currentValue" });
  }

  return { total, missing };
};

const sumDailyVariations = async (user, investments, start, end) => {
  const variations = await DailyVariation.find({
    user,
    investment: { $in: investments.map((inv) => inv._id) },
    date: { $gte: start, $lte: end },
  });

  let sum = 0;
  let missing = 0;
  variations.forEach((v) => {
    if (v.changeAmount !== null && v.changeAmount !== undefined) {
      sum += v.changeAmount;
    } else {
      missing++;
    }
  });
  return { sum, missing, count: variations.length };
};

const listMissingCapitalEntries = (entries, investments, start, end) => {
  const missing = [];
  const s = new Date(start);
  const e = new Date(end);

  investments.forEach((inv) => {
    if (!inv.purchaseDate) return;
    const purchaseDate = new Date(inv.purchaseDate);
    purchaseDate.setHours(0, 0, 0, 0);
    if (purchaseDate < s || purchaseDate > e) return;

    const invId = inv._id?.toString();
    const hasCapitalEntry = entries.some((entry) => {
      const entryInvId =
        entry.investment?.toString() || entry.investment?._id?.toString();
      if (entryInvId !== invId) return false;
      const entryDate = new Date(entry.date);
      if (entryDate < s || entryDate > e) return false;
      return entry.operation === "creation" || entry.operation === "add";
    });

    if (!hasCapitalEntry) {
      missing.push(inv.name);
    }
  });

  return missing;
};

const collectCapitalChangesByInvestment = (entries, start, end) => {
  const s = new Date(start);
  const e = new Date(end);
  const capitalByInvestment = new Map();

  entries.forEach((entry) => {
    if (!entry?.date) return;
    const entryDate = new Date(entry.date);
    if (entryDate < s || entryDate > e) return;
    const invId =
      entry.investment?.toString() || entry.investment?._id?.toString();
    if (!invId) return;

    if (entry.operation === "creation" || entry.operation === "add") {
      let amount = getOperationAmount(entry);
      if (amount < 0) amount = 0;
      capitalByInvestment.set(
        invId,
        (capitalByInvestment.get(invId) || 0) + amount,
      );
    } else if (entry.operation === "sell" || entry.operation === "withdraw") {
      const amount = Math.abs(getOperationAmount(entry));
      capitalByInvestment.set(
        invId,
        (capitalByInvestment.get(invId) || 0) - amount,
      );
    }
  });

  return capitalByInvestment;
};

const sumAllDailyVariations = async (user, investments) => {
  const variations = await DailyVariation.find({
    user,
    investment: { $in: investments.map((inv) => inv._id) },
  });

  let sum = 0;
  let missing = 0;
  variations.forEach((v) => {
    if (v.changeAmount !== null && v.changeAmount !== undefined) {
      sum += v.changeAmount;
    } else {
      missing++;
    }
  });

  return { sum, missing, count: variations.length };
};

async function auditUserReturns() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`=== AUDITORÍA DE RENDIMIENTOS (${userId}) ===\n`);

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      console.log("No hay inversiones.");
      return;
    }

    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
    }).sort({ date: 1 });

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const endToday = new Date(today);
    endToday.setHours(23, 59, 59, 999);

    const currentTotalValue = investments.reduce(
      (sum, inv) => sum + getCurrentValue(inv),
      0,
    );

    console.log(`Inversiones: ${investments.length}`);
    console.log(`Valor actual total: ${currentTotalValue.toFixed(2)}€\n`);

    // === DIARIO ===
    const dailyCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      today,
      endToday,
    );
    const yesterdayValue = await calculatePortfolioValueAtDate(
      userId,
      investments,
      yesterday,
    );
    const dailyReturnCalc =
      currentTotalValue - yesterdayValue.total - dailyCapitalChange;
    const dailyVariations = await sumDailyVariations(
      userId,
      investments,
      today,
      endToday,
    );

    console.log("=== DIARIO ===");
    console.log(
      `Valor ayer (con fallback): ${yesterdayValue.total.toFixed(2)}€`,
    );
    console.log(`Capital neto hoy: ${dailyCapitalChange.toFixed(2)}€`);
    console.log(`Cambio diario (calc): ${dailyReturnCalc.toFixed(2)}€`);
    console.log(
      `Suma DailyVariation hoy: ${dailyVariations.sum.toFixed(2)}€ (registros: ${dailyVariations.count}, sin changeAmount: ${dailyVariations.missing})\n`,
    );

    const todayVariationsList = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: today, $lte: endToday },
    });
    const todayVariationsMap = new Map();
    todayVariationsList.forEach((v) => {
      const invId = v.investment?.toString() || v.investment?._id?.toString();
      if (invId) {
        todayVariationsMap.set(invId, v);
      }
    });

    const yesterdayVariationsMap = new Map();
    const yesterdayVariationsList = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: yesterday, $lt: today },
    });
    yesterdayVariationsList.forEach((v) => {
      const invId = v.investment?.toString() || v.investment?._id?.toString();
      if (invId) {
        yesterdayVariationsMap.set(invId, v);
      }
    });

    const capitalByInvestmentToday = collectCapitalChangesByInvestment(
      allHistoryEntries,
      today,
      endToday,
    );
    const dailyDiscrepancies = [];

    for (const inv of investments) {
      if (!inv.purchaseDate) continue;
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      if (purchaseDate >= today) continue;

      const invId = inv._id?.toString();
      const currentValue = getCurrentValue(inv);

      let yesterdayValueInv = null;
      if (yesterdayVariationsMap.has(invId)) {
        yesterdayValueInv = yesterdayVariationsMap.get(invId).totalValue;
      } else {
        const fallback = await findVariationValueBefore(
          userId,
          inv._id,
          yesterday,
        );
        yesterdayValueInv = fallback.value;
      }

      if (yesterdayValueInv === null || yesterdayValueInv === undefined) {
        continue;
      }

      const capitalChangeInv = capitalByInvestmentToday.get(invId) || 0;
      const expectedChange =
        currentValue - yesterdayValueInv - capitalChangeInv;

      const todayVariation = todayVariationsMap.get(invId);
      const reportedChange =
        todayVariation?.changeAmount !== null &&
        todayVariation?.changeAmount !== undefined
          ? todayVariation.changeAmount
          : null;

      if (reportedChange === null) {
        dailyDiscrepancies.push({
          name: inv.name,
          expected: expectedChange,
          reported: null,
        });
        continue;
      }

      const diff = expectedChange - reportedChange;
      if (Math.abs(diff) >= 10) {
        dailyDiscrepancies.push({
          name: inv.name,
          expected: expectedChange,
          reported: reportedChange,
          diff,
        });
      }
    }

    if (dailyDiscrepancies.length > 0) {
      console.log("Diferencias diarias por inversión (>=10€):");
      dailyDiscrepancies
        .sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0))
        .slice(0, 15)
        .forEach((d) => {
          const reported = d.reported === null ? "N/A" : d.reported.toFixed(2);
          const diff = d.diff === undefined ? "N/A" : d.diff.toFixed(2);
          console.log(
            `  - ${d.name}: esperado ${d.expected.toFixed(2)}€ vs registrado ${reported}€ (diff ${diff}€)`,
          );
        });
      console.log("");
    }

    // === MENSUAL ===
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(today);
    monthEnd.setHours(23, 59, 59, 999);

    const monthStartValue = await calculatePortfolioValueBeforeDate(
      userId,
      investments,
      monthStart,
    );
    const monthCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      monthStart,
      monthEnd,
    );
    const monthlyReturnCalc =
      currentTotalValue - monthStartValue.total - monthCapitalChange;
    const monthlyVariations = await sumDailyVariations(
      userId,
      investments,
      monthStart,
      monthEnd,
    );

    console.log("=== MENSUAL ===");
    console.log(
      `Valor inicio mes (fallback): ${monthStartValue.total.toFixed(2)}€`,
    );
    console.log(`Capital neto mes: ${monthCapitalChange.toFixed(2)}€`);
    console.log(`Rendimiento mensual (calc): ${monthlyReturnCalc.toFixed(2)}€`);
    console.log(
      `Suma DailyVariation mes: ${monthlyVariations.sum.toFixed(2)}€ (registros: ${monthlyVariations.count}, sin changeAmount: ${monthlyVariations.missing})\n`,
    );
    const missingMonthCapital = listMissingCapitalEntries(
      allHistoryEntries,
      investments,
      monthStart,
      monthEnd,
    );
    if (missingMonthCapital.length > 0) {
      console.log(
        `Inversiones sin capital registrado en el mes: ${missingMonthCapital.join(", ")}`,
      );
    }

    // === TRIMESTRAL ===
    const currentMonth = today.getMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3;
    const quarterStart = new Date(today.getFullYear(), quarterStartMonth, 1);
    quarterStart.setHours(0, 0, 0, 0);
    const quarterEnd = new Date(today);
    quarterEnd.setHours(23, 59, 59, 999);

    const quarterStartValue = await calculatePortfolioValueBeforeDate(
      userId,
      investments,
      quarterStart,
    );
    const quarterCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      quarterStart,
      quarterEnd,
    );
    const quarterlyReturnCalc =
      currentTotalValue - quarterStartValue.total - quarterCapitalChange;
    const quarterlyVariations = await sumDailyVariations(
      userId,
      investments,
      quarterStart,
      quarterEnd,
    );

    console.log("\n=== TRIMESTRAL ===");
    console.log(
      `Valor inicio trimestre (fallback): ${quarterStartValue.total.toFixed(2)}€`,
    );
    console.log(`Capital neto trimestre: ${quarterCapitalChange.toFixed(2)}€`);
    console.log(
      `Rendimiento trimestral (calc): ${quarterlyReturnCalc.toFixed(2)}€`,
    );
    console.log(
      `Suma DailyVariation trimestre: ${quarterlyVariations.sum.toFixed(2)}€ (registros: ${quarterlyVariations.count}, sin changeAmount: ${quarterlyVariations.missing})`,
    );

    // === ANUAL ===
    const yearStart = new Date(today.getFullYear(), 0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date(today);
    yearEnd.setHours(23, 59, 59, 999);

    const yearStartValue = await calculatePortfolioValueBeforeDate(
      userId,
      investments,
      yearStart,
    );
    const annualCapitalChange = calculateNetCapitalChange(
      allHistoryEntries,
      yearStart,
      yearEnd,
    );
    const annualReturnCalc =
      currentTotalValue - yearStartValue.total - annualCapitalChange;
    const annualVariations = await sumDailyVariations(
      userId,
      investments,
      yearStart,
      yearEnd,
    );

    console.log("\n=== ANUAL ===");
    console.log(
      `Valor inicio año (fallback): ${yearStartValue.total.toFixed(2)}€`,
    );
    console.log(`Capital neto año: ${annualCapitalChange.toFixed(2)}€`);
    console.log(`Rendimiento anual (calc): ${annualReturnCalc.toFixed(2)}€`);
    console.log(
      `Suma DailyVariation año: ${annualVariations.sum.toFixed(2)}€ (registros: ${annualVariations.count}, sin changeAmount: ${annualVariations.missing})\n`,
    );

    // === ACUMULADO ===
    let totalInvestedCapital = 0;
    allHistoryEntries.forEach((entry) => {
      if (entry.operation === "creation" || entry.operation === "add") {
        let amount = getOperationAmount(entry);
        if (amount < 0) amount = 0;
        totalInvestedCapital += amount;
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        const amount = Math.abs(getOperationAmount(entry));
        totalInvestedCapital -= amount;
      }
    });

    // Imputar capital si faltan operaciones de creation/add
    const missingCapitalInvestments = investments.filter((inv) => {
      const invId = inv._id?.toString();
      const hasCapitalEntry = allHistoryEntries.some((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === invId &&
          (entry.operation === "creation" || entry.operation === "add")
        );
      });
      return !hasCapitalEntry;
    });

    let impliedTotal = 0;
    missingCapitalInvestments.forEach((inv) => {
      let implied = getImpliedCapital(inv);
      if (implied === 0) {
        implied = getCurrentValue(inv);
      }
      impliedTotal += implied;
    });

    const totalInvestedWithFallback = totalInvestedCapital + impliedTotal;
    const accumulatedReturn = currentTotalValue - totalInvestedWithFallback;

    console.log("=== ACUMULADO ===");
    console.log(
      `Capital invertido (histórico): ${totalInvestedCapital.toFixed(2)}€`,
    );
    console.log(
      `Capital imputado (sin creation/add): ${impliedTotal.toFixed(2)}€`,
    );
    console.log(
      `Capital total (con fallback): ${totalInvestedWithFallback.toFixed(2)}€`,
    );
    console.log(
      `Rendimiento acumulado (calc): ${accumulatedReturn.toFixed(2)}€`,
    );

    if (missingCapitalInvestments.length > 0) {
      console.log(
        `Inversiones sin capital registrado: ${missingCapitalInvestments
          .map((inv) => inv.name)
          .join(", ")}`,
      );
    }

    const totalVariations = await sumAllDailyVariations(userId, investments);
    console.log(
      `Suma DailyVariation total: ${totalVariations.sum.toFixed(2)}€ (registros: ${totalVariations.count}, sin changeAmount: ${totalVariations.missing})`,
    );
    console.log(
      `Diferencia acumulado vs variaciones: ${(accumulatedReturn - totalVariations.sum).toFixed(2)}€\n`,
    );

    console.log("\n=== ANOMALÍAS POTENCIALES ===");
    if (yesterdayValue.missing.length > 0) {
      console.log(
        `Faltan valores diarios (ayer). Fallback usado para: ${yesterdayValue.missing
          .map((m) => `${m.name}(${m.source})`)
          .join(", ")}`,
      );
    }
    if (monthStartValue.missing.length > 0) {
      console.log(
        `Faltan valores de inicio de mes. Fallback usado para: ${monthStartValue.missing
          .map((m) => `${m.name}(${m.source})`)
          .join(", ")}`,
      );
    }
    if (quarterStartValue.missing.length > 0) {
      console.log(
        `Faltan valores de inicio de trimestre. Fallback usado para: ${quarterStartValue.missing
          .map((m) => `${m.name}(${m.source})`)
          .join(", ")}`,
      );
    }
    if (yearStartValue.missing.length > 0) {
      console.log(
        `Faltan valores de inicio de año. Fallback usado para: ${yearStartValue.missing
          .map((m) => `${m.name}(${m.source})`)
          .join(", ")}`,
      );
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

auditUserReturns();
