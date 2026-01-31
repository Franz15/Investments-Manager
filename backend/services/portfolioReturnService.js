import DailyVariation from "../models/DailyVariation.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { normalizeDay, getSignedOperationAmount } from "./variationEngine.js";

const sumChangesForPeriod = async (userId, investmentIds, start, end) => {
  const variationsAgg = await DailyVariation.aggregate([
    {
      $match: {
        user: userId,
        investment: { $in: investmentIds },
        date: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: ["$changeAmount", 0] } },
      },
    },
  ]);

  return variationsAgg.length > 0 ? variationsAgg[0].total : 0;
};

const getPortfolioValueAtDate = async (userId, investmentIds, date) => {
  const targetDate = normalizeDay(date);
  const variations = await DailyVariation.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $lte: targetDate },
  }).sort({ date: -1 });

  const values = new Map();
  for (const variation of variations) {
    const invId = variation.investment.toString();
    if (!values.has(invId)) {
      values.set(invId, variation.totalValue || 0);
    }
    if (values.size === investmentIds.length) {
      break;
    }
  }

  let total = 0;
  values.forEach((value) => {
    total += value;
  });

  return { total, count: values.size };
};

const getCapitalChangeForPeriod = async (userId, investmentIds, start, end) => {
  const operations = await InvestmentHistory.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $gte: start, $lte: end },
  });

  let capitalChange = 0;
  operations.forEach((op) => {
    capitalChange += getSignedOperationAmount(op);
  });

  return capitalChange;
};

const getCapitalFlowsForPeriod = async (userId, investmentIds, start, end) => {
  const operations = await InvestmentHistory.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $gte: start, $lte: end },
    operation: { $in: ["creation", "add", "withdraw", "sell"] },
  });

  let contributed = 0;
  let withdrawn = 0;
  operations.forEach((op) => {
    const signed = getSignedOperationAmount(op);
    if (signed >= 0) {
      contributed += signed;
    } else {
      withdrawn += Math.abs(signed);
    }
  });

  return { contributed, withdrawn, net: contributed - withdrawn };
};

const getPreviousDailyValuesMap = async (userId, investmentIds, date) => {
  const targetDate = normalizeDay(date);
  const variations = await DailyVariation.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $lt: targetDate },
  }).sort({ date: -1 });

  const map = new Map();
  for (const variation of variations) {
    const invId = variation.investment.toString();
    if (!map.has(invId)) {
      map.set(invId, variation.totalValue || 0);
    }
    if (map.size === investmentIds.length) {
      break;
    }
  }

  return map;
};

const getCapitalChangeMapForDate = async (userId, investmentIds, date) => {
  const dayStart = normalizeDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const operations = await InvestmentHistory.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $gte: dayStart, $lt: dayEnd },
  });

  const map = new Map();
  operations.forEach((op) => {
    const invId = op.investment.toString();
    const current = map.get(invId) || 0;
    map.set(invId, current + getSignedOperationAmount(op));
  });

  return map;
};

const getPortfolioDailyReturn = async (
  userId,
  investments,
  date = new Date(),
) => {
  const investmentIds = investments.map((inv) => inv._id);
  const dayStart = normalizeDay(date);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  const yesterday = new Date(dayStart);
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayVariations = await DailyVariation.find({
    user: userId,
    investment: { $in: investmentIds },
    date: { $gte: yesterday, $lt: dayStart },
  });

  if (yesterdayVariations.length === 0) {
    return { totalChange: 0, percent: 0, totalPrevValue: 0 };
  }

  const capitalChangeMap = await getCapitalChangeMapForDate(
    userId,
    investmentIds,
    dayStart,
  );

  const yesterdayValues = new Map();
  yesterdayVariations.forEach((variation) => {
    const invId = variation.investment.toString();
    if (variation.totalValue !== null && variation.totalValue !== undefined) {
      yesterdayValues.set(invId, variation.totalValue);
    }
  });

  let totalPrevValue = 0;
  let totalChange = 0;

  investments.forEach((inv) => {
    const invId = inv._id.toString();
    const prevValue = yesterdayValues.get(invId);
    if (prevValue === undefined || prevValue === null) {
      return;
    }
    totalPrevValue += prevValue;
    const currentValue = inv.isAutomatedPortfolio
      ? inv.currentPrice || 0
      : (inv.quantity || 0) * (inv.currentPrice || 0);
    const capitalChange = capitalChangeMap.get(invId) || 0;
    totalChange += currentValue - prevValue - capitalChange;
  });

  const percent = totalPrevValue > 0 ? (totalChange / totalPrevValue) * 100 : 0;

  return { totalChange, percent, totalPrevValue };
};

const getPortfolioPeriodReturn = async (
  userId,
  investmentIds,
  periodStart,
  periodEnd,
) => {
  const startDate = normalizeDay(periodStart);
  const endDate = normalizeDay(periodEnd);
  const dayBeforeStart = new Date(startDate);
  dayBeforeStart.setDate(dayBeforeStart.getDate() - 1);

  let { total: startValue } = await getPortfolioValueAtDate(
    userId,
    investmentIds,
    dayBeforeStart,
  );

  if (!startValue || startValue === 0) {
    const fallback = await getPortfolioValueAtDate(
      userId,
      investmentIds,
      startDate,
    );
    startValue = fallback.total;
  }

  const { total: endValue } = await getPortfolioValueAtDate(
    userId,
    investmentIds,
    endDate,
  );
  const totalChange = await sumChangesForPeriod(
    userId,
    investmentIds,
    startDate,
    endDate,
  );
  const percent = startValue > 0 ? (totalChange / startValue) * 100 : 0;

  return {
    totalChange,
    percent,
    startValue,
    endValue,
  };
};

const getPortfolioAccumulatedReturn = async (userId, investmentIds) => {
  const firstVariation = await DailyVariation.findOne({
    user: userId,
    investment: { $in: investmentIds },
  })
    .sort({ date: 1 })
    .limit(1)
    .select("date");

  if (!firstVariation) {
    return {
      totalChange: 0,
      percent: 0,
      startValue: 0,
      startDate: null,
    };
  }

  const startDate = normalizeDay(firstVariation.date);
  const { total: startValue } = await getPortfolioValueAtDate(
    userId,
    investmentIds,
    startDate,
  );
  const totalChange = await sumChangesForPeriod(
    userId,
    investmentIds,
    startDate,
    new Date(),
  );
  const percent = startValue > 0 ? (totalChange / startValue) * 100 : 0;

  return {
    totalChange,
    percent,
    startValue,
    startDate,
  };
};

export {
  getPortfolioValueAtDate,
  getPortfolioDailyReturn,
  getPortfolioPeriodReturn,
  getPortfolioAccumulatedReturn,
  getCapitalChangeForPeriod,
  getCapitalFlowsForPeriod,
};
