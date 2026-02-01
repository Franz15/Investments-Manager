import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userId = process.argv[2] || "ana";
const targetAccountName = (process.argv[3] || "MyInvestor").toLowerCase();
const uri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const toId = (value) => (value?._id ? value._id.toString() : value?.toString());

const getInvestmentTotalValue = (inv) =>
  inv.isAutomatedPortfolio
    ? inv.currentPrice || 0
    : (inv.quantity || 0) * (inv.currentPrice || 0);

const getInvestmentInvestedCapital = (inv) => {
  if (inv.isAutomatedPortfolio) {
    return inv.quantity || 0;
  }
  const avg = inv.averagePurchasePrice || inv.purchasePrice || 0;
  return (inv.quantity || 0) * avg;
};

const getAllocationMetrics = (inv, allocation, totalAmount, totalValue) => {
  const amount = Number(allocation.amount) || 0;
  if (inv.isAutomatedPortfolio) {
    const share = totalAmount > 0 ? amount / totalAmount : 0;
    return {
      investedCapital: amount,
      currentValue: totalValue * share,
    };
  }
  const allocationQty = Number(allocation.quantity) || 0;
  const allocationAvg = Number(allocation.averagePurchasePrice) || 0;
  if (allocationQty > 0 && allocationAvg > 0) {
    return {
      investedCapital: allocationQty * allocationAvg,
      currentValue: allocationQty * (inv.currentPrice || 0),
    };
  }
  const share = totalAmount > 0 ? amount / totalAmount : 0;
  return {
    investedCapital: amount,
    currentValue: totalValue * share,
  };
};

const describeAllocation = (allocation, accountMap, subMap) => {
  const accountId = toId(allocation.account);
  const subAccountId = toId(allocation.subAccount);
  const account = accountId ? accountMap.get(accountId) : null;
  const subAccount = subAccountId ? subMap.get(subAccountId) : null;
  return {
    accountId,
    subAccountId,
    accountName: account?.name || account?.bankName || null,
    subAccountName: subAccount?.name || null,
  };
};

const addToTotals = (totals, accountId, metrics) => {
  if (!totals.has(accountId)) {
    totals.set(accountId, { investedCapital: 0, currentValue: 0 });
  }
  const entry = totals.get(accountId);
  entry.investedCapital += metrics.investedCapital;
  entry.currentValue += metrics.currentValue;
};

const main = async () => {
  await mongoose.connect(uri);

  const accounts = await Account.find({ user: userId }).lean();
  const subAccounts = await SubAccount.find({ user: userId }).lean();
  const investments = await Investment.find({
    user: userId,
    $or: [
      { account: { $exists: true, $ne: null } },
      { "allocations.0": { $exists: true } },
    ],
  }).lean();
  const investmentIds = investments.map((inv) => inv._id);
  const histories = await InvestmentHistory.find({
    user: userId,
    investment: { $in: investmentIds },
    operation: { $in: ["creation", "add", "sell", "withdraw"] },
  }).lean();
  const historyByInvestment = new Map();
  histories.forEach((entry) => {
    const invId = toId(entry.investment);
    if (!invId) return;
    if (!historyByInvestment.has(invId)) {
      historyByInvestment.set(invId, {
        accountIds: new Set(),
        subAccountIds: new Set(),
      });
    }
    const bucket = historyByInvestment.get(invId);
    if (entry.account) bucket.accountIds.add(toId(entry.account));
    if (entry.subAccount) bucket.subAccountIds.add(toId(entry.subAccount));
  });

  const accountMap = new Map(accounts.map((a) => [String(a._id), a]));
  const subMap = new Map(subAccounts.map((s) => [String(s._id), s]));

  const targetAccounts = accounts.filter((a) => {
    const name = `${a.name || ""} ${a.bankName || ""}`.toLowerCase();
    return name.includes(targetAccountName);
  });
  const targetAccountIds = new Set(targetAccounts.map((a) => String(a._id)));
  const targetSubAccountIds = new Set(
    subAccounts
      .filter((s) => targetAccountIds.has(String(s.account)))
      .map((s) => String(s._id)),
  );
  const targetCashTotal = subAccounts
    .filter((s) => targetAccountIds.has(String(s.account)))
    .reduce((sum, sub) => sum + (Number(sub.balance) || 0), 0);

  const totalsByAccount = new Map();
  const issues = {
    missingAccount: [],
    unknownAccount: [],
    unknownSubAccount: [],
    mismatchedSubAccount: [],
    primaryAccountMismatch: [],
    platformMismatch: [],
    historyMismatch: [],
  };
  const targetAllocations = [];

  investments.forEach((inv) => {
    const totalValue = getInvestmentTotalValue(inv);
    const investedCapital = getInvestmentInvestedCapital(inv);
    const allocations = Array.isArray(inv.allocations) ? inv.allocations : [];
    const totalAmount = allocations.reduce(
      (sum, allocation) => sum + (Number(allocation.amount) || 0),
      0,
    );
    const hasAllocationQuantities =
      !inv.isAutomatedPortfolio &&
      allocations.some(
        (allocation) =>
          (Number(allocation.quantity) || 0) > 0 &&
          (Number(allocation.averagePurchasePrice) || 0) > 0,
      );

    if (allocations.length === 0) {
      const allocationMatchesTarget =
        (inv.account && targetAccountIds.has(toId(inv.account))) ||
        (inv.subAccount && targetSubAccountIds.has(toId(inv.subAccount)));
      if (
        inv.platformUrl &&
        inv.platformUrl.toLowerCase().includes(targetAccountName) &&
        !allocationMatchesTarget
      ) {
        issues.platformMismatch.push({
          investment: inv.name,
          platformUrl: inv.platformUrl,
          reason: "platformUrl coincide pero account no",
        });
      }
      const allocation = {
        account: inv.account || null,
        subAccount: inv.subAccount || null,
        amount: investedCapital,
      };
      const accountId = toId(allocation.account);
      if (!accountId) {
        issues.missingAccount.push({
          investment: inv.name,
          reason: "sin account y sin allocations",
        });
        addToTotals(totalsByAccount, "__missing__", {
          investedCapital,
          currentValue: totalValue,
        });
      } else {
        addToTotals(totalsByAccount, accountId, {
          investedCapital,
          currentValue: totalValue,
        });
        if (
          targetAccountIds.has(accountId) ||
          (allocation.subAccount &&
            targetSubAccountIds.has(toId(allocation.subAccount)))
        ) {
          targetAllocations.push({
            investment: inv.name,
            accountId,
            subAccountId: toId(allocation.subAccount),
            investedCapital: Number(investedCapital.toFixed(2)),
            currentValue: Number(totalValue.toFixed(2)),
            source: "investment.account",
          });
        }
      }
      return;
    }

    if (totalAmount === 0 && !hasAllocationQuantities) {
      const allocationMatchesTarget =
        targetAccountIds.has(toId(allocations[0]?.account)) ||
        (allocations[0]?.subAccount &&
          targetSubAccountIds.has(toId(allocations[0]?.subAccount)));
      if (
        inv.platformUrl &&
        inv.platformUrl.toLowerCase().includes(targetAccountName) &&
        !allocationMatchesTarget
      ) {
        issues.platformMismatch.push({
          investment: inv.name,
          platformUrl: inv.platformUrl,
          reason: "platformUrl coincide pero allocations no",
        });
      }
      const first = allocations[0];
      const accountId = toId(first.account);
      const subAccountId = toId(first.subAccount);
      if (!accountId) {
        issues.missingAccount.push({
          investment: inv.name,
          reason: "allocations sin account (totalAmount=0)",
        });
        addToTotals(totalsByAccount, "__missing__", {
          investedCapital,
          currentValue: totalValue,
        });
      } else {
        addToTotals(totalsByAccount, accountId, {
          investedCapital,
          currentValue: totalValue,
        });
        if (
          targetAccountIds.has(accountId) ||
          (subAccountId && targetSubAccountIds.has(subAccountId))
        ) {
          targetAllocations.push({
            investment: inv.name,
            accountId,
            subAccountId,
            investedCapital: Number(investedCapital.toFixed(2)),
            currentValue: Number(totalValue.toFixed(2)),
            source: "fallback-first-allocation",
          });
        }
      }
      return;
    }

    const allocationAccountIds = new Set(
      allocations.map((allocation) => toId(allocation.account)).filter(Boolean),
    );
    const primaryAccountId = toId(inv.account);
    if (
      primaryAccountId &&
      allocationAccountIds.size > 0 &&
      !allocationAccountIds.has(primaryAccountId)
    ) {
      issues.primaryAccountMismatch.push({
        investment: inv.name,
        primaryAccountId,
        allocationAccountIds: Array.from(allocationAccountIds),
      });
    }

    if (inv.platformUrl) {
      const allocationMatchesTarget =
        Array.from(allocationAccountIds).some((id) =>
          targetAccountIds.has(id),
        ) ||
        allocations.some(
          (allocation) =>
            allocation.subAccount &&
            targetSubAccountIds.has(toId(allocation.subAccount)),
        );
      if (
        inv.platformUrl.toLowerCase().includes(targetAccountName) &&
        !allocationMatchesTarget
      ) {
        issues.platformMismatch.push({
          investment: inv.name,
          platformUrl: inv.platformUrl,
          reason: "platformUrl coincide pero allocations no",
        });
      }
    }

    allocations.forEach((allocation) => {
      const accountId = toId(allocation.account);
      const subAccountId = toId(allocation.subAccount);
      const metrics = getAllocationMetrics(
        inv,
        allocation,
        totalAmount,
        totalValue,
      );

      if (!accountId) {
        issues.missingAccount.push({
          investment: inv.name,
          reason: "allocation sin account",
        });
        addToTotals(totalsByAccount, "__missing__", metrics);
        return;
      }

      if (!accountMap.has(accountId)) {
        issues.unknownAccount.push({
          investment: inv.name,
          accountId,
        });
      }

      if (subAccountId) {
        const sub = subMap.get(subAccountId);
        if (!sub) {
          issues.unknownSubAccount.push({
            investment: inv.name,
            accountId,
            subAccountId,
          });
        } else if (String(sub.account) !== accountId) {
          issues.mismatchedSubAccount.push({
            investment: inv.name,
            accountId,
            subAccountId,
            subAccountAccountId: String(sub.account),
          });
        }
      }

      addToTotals(totalsByAccount, accountId, metrics);

      if (
        targetAccountIds.has(accountId) ||
        (subAccountId && targetSubAccountIds.has(subAccountId))
      ) {
        const detail = describeAllocation(allocation, accountMap, subMap);
        targetAllocations.push({
          investment: inv.name,
          accountId,
          accountName: detail.accountName,
          subAccountId,
          subAccountName: detail.subAccountName,
          investedCapital: Number(metrics.investedCapital.toFixed(2)),
          currentValue: Number(metrics.currentValue.toFixed(2)),
          source: "allocation",
        });
      }
    });

    const history = historyByInvestment.get(toId(inv._id));
    if (history) {
      const historyMatchesTarget =
        Array.from(history.accountIds).some((id) => targetAccountIds.has(id)) ||
        Array.from(history.subAccountIds).some((id) =>
          targetSubAccountIds.has(id),
        );
      const allocationMatchesTarget =
        Array.from(allocationAccountIds).some((id) =>
          targetAccountIds.has(id),
        ) ||
        allocations.some(
          (allocation) =>
            allocation.subAccount &&
            targetSubAccountIds.has(toId(allocation.subAccount)),
        );
      if (historyMatchesTarget && !allocationMatchesTarget) {
        issues.historyMismatch.push({
          investment: inv.name,
          historyAccounts: Array.from(history.accountIds),
          historySubAccounts: Array.from(history.subAccountIds),
          allocationAccounts: Array.from(allocationAccountIds),
        });
      }
    }
  });

  const totalsList = Array.from(totalsByAccount.entries())
    .map(([accountId, data]) => {
      const account = accountMap.get(accountId);
      return {
        accountId,
        accountName:
          account?.name ||
          account?.bankName ||
          (accountId === "__missing__" ? "Sin cuenta" : null),
        investedCapital: Number(data.investedCapital.toFixed(2)),
        currentValue: Number(data.currentValue.toFixed(2)),
      };
    })
    .sort((a, b) => b.currentValue - a.currentValue);

  console.log(
    JSON.stringify(
      {
        userId,
        targetAccountName,
        targetAccounts: targetAccounts.map((a) => ({
          id: String(a._id),
          name: a.name,
          bankName: a.bankName,
        })),
        targetCashTotal: Number(targetCashTotal.toFixed(2)),
        totalsByAccount: totalsList,
        targetInvestmentsValue: Number(
          (
            totalsByAccount.get(targetAccounts[0]?._id?.toString?.() || "")
              ?.currentValue || 0
          ).toFixed(2),
        ),
        targetTotalBalance: Number(
          (
            targetCashTotal +
            (totalsByAccount.get(targetAccounts[0]?._id?.toString?.() || "")
              ?.currentValue || 0)
          ).toFixed(2),
        ),
        targetAllocations: targetAllocations.sort(
          (a, b) => b.currentValue - a.currentValue,
        ),
        issues,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
