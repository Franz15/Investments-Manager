import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";
import PeriodVariation from "../models/PeriodVariation.js";
import { resolveOperationAmount } from "../services/variationEngine.js";
import { recalculateDailyVariationsForInvestmentFromDate } from "../services/dailyVariationService.js";
import { recalculateAllPeriodVariations } from "../services/periodVariationService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const userId = getArg("--user");

const isCapitalOperation = (op) =>
  ["creation", "add", "withdraw", "sell"].includes(op);

const getAllocationKey = (accountId, subAccountId) =>
  `${accountId?.toString?.() || accountId}-${subAccountId?.toString?.() || subAccountId || "none"}`;

const normalizeDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

async function normalizeHistoryEntries(investmentsMap, scope) {
  const histories = await InvestmentHistory.find(scope).sort({ date: 1 });
  let updated = 0;

  for (const entry of histories) {
    let changed = false;
    const invId = entry.investment?.toString();
    const investment = investmentsMap.get(invId);

    if (isCapitalOperation(entry.operation)) {
      if (!entry.account && investment) {
        entry.account =
          investment.account?._id?.toString?.() || investment.account;
        entry.subAccount =
          investment.subAccount?._id?.toString?.() ||
          investment.subAccount ||
          null;
        changed = true;
      }

      const resolvedAmount = resolveOperationAmount(entry);
      if (
        (!entry.operationAmount || entry.operationAmount === 0) &&
        resolvedAmount
      ) {
        entry.operationAmount = resolvedAmount;
        changed = true;
      }
    }

    if (entry.operation === "update") {
      if (investment && investment.isAutomatedPortfolio) {
        if (entry.totalValue !== entry.currentPrice) {
          entry.totalValue = entry.currentPrice;
          changed = true;
        }
      } else if (
        entry.currentPrice !== undefined &&
        entry.quantity !== undefined
      ) {
        const expected = entry.currentPrice * entry.quantity;
        if (Math.abs((entry.totalValue || 0) - expected) > 0.01) {
          entry.totalValue = expected;
          changed = true;
        }
      }
    }

    if (changed) {
      await entry.save();
      updated += 1;
    }
  }

  return updated;
}

async function removeDuplicateUpdates(investments, scope) {
  let removed = 0;

  for (const investment of investments) {
    const updates = await InvestmentHistory.find({
      ...scope,
      investment: investment._id,
      operation: "update",
    }).sort({ date: 1 });

    const byDay = new Map();
    updates.forEach((entry) => {
      const key = normalizeDay(entry.date).getTime();
      const stamp =
        entry.updatedAt ||
        entry.createdAt ||
        entry.date ||
        entry._id?.getTimestamp?.();
      const existing = byDay.get(key);
      if (!existing || (stamp && stamp > existing.stamp)) {
        byDay.set(key, { entry, stamp });
      }
    });

    const keepIds = new Set(
      Array.from(byDay.values()).map((v) => v.entry._id.toString()),
    );
    const toDelete = updates.filter(
      (entry) => !keepIds.has(entry._id.toString()),
    );

    if (toDelete.length > 0) {
      await InvestmentHistory.deleteMany({
        _id: { $in: toDelete.map((entry) => entry._id) },
      });
      removed += toDelete.length;
    }
  }

  return removed;
}

async function rebuildAllocations(investments, scope) {
  let updated = 0;

  for (const investment of investments) {
    const histories = await InvestmentHistory.find({
      ...scope,
      investment: investment._id,
      operation: { $in: ["creation", "add", "withdraw", "sell"] },
    }).sort({ date: 1, createdAt: 1 });

    if (histories.length === 0) {
      continue;
    }

    const allocationState = new Map();
    const ensureBucket = (accountId, subAccountId) => {
      const key = getAllocationKey(accountId, subAccountId);
      if (!allocationState.has(key)) {
        allocationState.set(key, {
          account: accountId,
          subAccount: subAccountId || null,
          quantity: 0,
          cost: 0,
        });
      }
      return allocationState.get(key);
    };

    histories.forEach((entry) => {
      const accountId =
        entry.account ||
        investment.account?._id?.toString?.() ||
        investment.account;
      const subAccountId =
        entry.subAccount ||
        investment.subAccount?._id?.toString?.() ||
        investment.subAccount ||
        null;
      const bucket = ensureBucket(accountId, subAccountId);

      const amount = resolveOperationAmount(entry);
      // Para "creation": entry.quantity = total inicial. Para "add": entry.quantity en BD es el total acumulado (no delta).
      // Usar delta en unidades: operationAmount/operationPrice para add; para sell/withdraw, unidades retiradas.
      let qtyDelta = 0;
      if (entry.operation === "creation") {
        qtyDelta =
          entry.quantity ||
          (entry.operationPrice ? amount / entry.operationPrice : 0);
      } else if (entry.operation === "add") {
        qtyDelta = entry.operationPrice
          ? (entry.operationAmount || 0) / entry.operationPrice
          : 0;
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        // Unidades vendidas/retiradas = operationAmount / operationPrice (entry.quantity en BD es el restante, no el delta)
        qtyDelta = entry.operationPrice
          ? Math.abs(entry.operationAmount || 0) / entry.operationPrice
          : 0;
        if (
          (!qtyDelta || qtyDelta === 0) &&
          bucket.quantity > 0 &&
          bucket.cost > 0
        ) {
          qtyDelta = Math.abs(amount) / (bucket.cost / bucket.quantity);
        }
      }

      if (entry.operation === "creation" || entry.operation === "add") {
        if (entry.operation === "creation") {
          bucket.quantity = qtyDelta;
          bucket.cost = amount || 0;
        } else {
          bucket.quantity += qtyDelta || 0;
          bucket.cost += amount || 0;
        }
        return;
      }

      if (entry.operation === "withdraw" || entry.operation === "sell") {
        const avgCost = bucket.quantity > 0 ? bucket.cost / bucket.quantity : 0;
        const costReduction = avgCost * (qtyDelta || 0);
        bucket.quantity = Math.max(0, bucket.quantity - (qtyDelta || 0));
        bucket.cost = Math.max(0, bucket.cost - costReduction);
      }
    });

    const allocations = Array.from(allocationState.values())
      .filter((item) => item.cost > 0 || item.quantity > 0)
      .map((item) => ({
        account: item.account,
        subAccount: item.subAccount || null,
        amount: item.cost,
        quantity: item.quantity,
        averagePurchasePrice: item.quantity > 0 ? item.cost / item.quantity : 0,
      }));

    if (allocations.length > 0) {
      investment.allocations = allocations;
      investment.account = allocations[0].account;
      investment.subAccount = allocations[0].subAccount || null;

      if (!investment.isAutomatedPortfolio) {
        const totalQty = allocations.reduce(
          (sum, alloc) => sum + (alloc.quantity || 0),
          0,
        );
        const totalCost = allocations.reduce(
          (sum, alloc) => sum + (alloc.amount || 0),
          0,
        );
        if (totalQty > 0) {
          investment.quantity = totalQty;
          investment.averagePurchasePrice = totalCost / totalQty;
        }
      }

      await investment.save();
      updated += 1;
    }
  }

  return updated;
}

async function recalculateVariations(investments, scope) {
  await DailyVariation.deleteMany(scope);
  await PeriodVariation.deleteMany(scope);

  let updated = 0;

  for (const investment of investments) {
    const firstEntry = await InvestmentHistory.findOne({
      ...scope,
      investment: investment._id,
    })
      .sort({ date: 1 })
      .limit(1);

    if (!firstEntry) {
      continue;
    }

    const result = await recalculateDailyVariationsForInvestmentFromDate(
      investment._id,
      investment.user,
      firstEntry.date,
    );
    updated += result.updated || 0;
  }

  if (userId) {
    await recalculateAllPeriodVariations(userId);
  } else {
    const users = Array.from(
      new Set(investments.map((inv) => inv.user)),
    ).filter(Boolean);
    for (const user of users) {
      await recalculateAllPeriodVariations(user);
    }
  }

  return updated;
}

async function run() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const scope = userId ? { user: userId } : {};
  const investments = await Investment.find(scope);
  const investmentsMap = new Map(
    investments.map((inv) => [inv._id.toString(), inv]),
  );

  const normalizedCount = await normalizeHistoryEntries(investmentsMap, scope);
  const removedUpdates = await removeDuplicateUpdates(investments, scope);
  const allocationsUpdated = await rebuildAllocations(investments, scope);
  const dailyUpdated = await recalculateVariations(investments, scope);

  console.log("Normalización de historial:", normalizedCount);
  console.log("Updates duplicados eliminados:", removedUpdates);
  console.log("Inversiones con allocations recalculadas:", allocationsUpdated);
  console.log("Variaciones diarias recalculadas:", dailyUpdated);

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Error en migración:", error);
  process.exit(1);
});
