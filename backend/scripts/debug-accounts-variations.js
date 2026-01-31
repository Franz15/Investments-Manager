import mongoose from "mongoose";
import Investment from "../models/Investment.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";

const userId = process.argv[2] || "ana";
const uri =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const toId = (value) => (value?._id ? value._id.toString() : value?.toString());

const getInvestmentTotalValue = (inv) =>
  inv.isAutomatedPortfolio
    ? inv.currentPrice || 0
    : (inv.quantity || 0) * (inv.currentPrice || 0);

const getInvestmentInvestedCapital = (inv) => {
  if (inv.isAutomatedPortfolio) return inv.quantity || 0;
  const avg = inv.averagePurchasePrice || inv.purchasePrice || 0;
  return (inv.quantity || 0) * avg;
};

const getInvestmentAllocations = (inv) => {
  if (Array.isArray(inv.allocations) && inv.allocations.length) {
    return inv.allocations.map((allocation) => ({
      accountId: toId(allocation.account),
      subAccountId: toId(allocation.subAccount),
      amount: Number(allocation.amount) || 0,
      quantity: Number(allocation.quantity) || 0,
      averagePurchasePrice: Number(allocation.averagePurchasePrice) || 0,
    }));
  }
  return [
    {
      accountId: toId(inv.account),
      subAccountId: toId(inv.subAccount),
      amount: getInvestmentInvestedCapital(inv),
      quantity: 0,
      averagePurchasePrice: 0,
    },
  ];
};

const getAllocationMetrics = (inv, predicate) => {
  const allocations = getInvestmentAllocations(inv);
  const totalValue = getInvestmentTotalValue(inv);
  const totalAmount = allocations.reduce(
    (sum, allocation) => sum + (allocation.amount || 0),
    0,
  );

  return allocations.reduce(
    (acc, allocation) => {
      if (!predicate(allocation)) return acc;

      if (inv.isAutomatedPortfolio) {
        const share = totalAmount > 0 ? allocation.amount / totalAmount : 0;
        return {
          currentValue: acc.currentValue + totalValue * share,
          investedCapital: acc.investedCapital + allocation.amount,
          quantity: null,
        };
      }

      if (allocation.quantity > 0 && allocation.averagePurchasePrice > 0) {
        const currentValue = allocation.quantity * (inv.currentPrice || 0);
        const investedCapital =
          allocation.quantity * allocation.averagePurchasePrice;
        return {
          currentValue: acc.currentValue + currentValue,
          investedCapital: acc.investedCapital + investedCapital,
          quantity: acc.quantity + allocation.quantity,
        };
      }

      const share = totalAmount > 0 ? allocation.amount / totalAmount : 0;
      return {
        currentValue: acc.currentValue + totalValue * share,
        investedCapital: acc.investedCapital + allocation.amount,
        quantity: acc.quantity + (inv.quantity || 0) * share,
      };
    },
    { currentValue: 0, investedCapital: 0, quantity: 0 },
  );
};

const main = async () => {
  await mongoose.connect(uri);

  const accounts = await Account.find({ user: userId }).select("_id name");
  const subAccounts = await SubAccount.find({ user: userId }).select(
    "_id name type balance account",
  );
  const investments = await Investment.find({
    user: userId,
    account: { $exists: true, $ne: null },
  }).select(
    "_id name account subAccount allocations quantity averagePurchasePrice purchasePrice currentPrice isAutomatedPortfolio",
  );

  const accountRows = accounts.map((acc) => {
    const accountId = acc._id.toString();
    const accountInvestments = investments.filter((inv) =>
      getInvestmentAllocations(inv).some(
        (a) => a.accountId === accountId && !a.subAccountId,
      ),
    );
    const subs = subAccounts.filter((s) => toId(s.account) === accountId);

    let investedCapital = 0;
    let currentValue = 0;

    accountInvestments.forEach((inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (a) => a.accountId === accountId && !a.subAccountId,
      );
      investedCapital += metrics.investedCapital;
      currentValue += metrics.currentValue;
    });

    subs.forEach((sub) => {
      const subInvestments = investments.filter((inv) =>
        getInvestmentAllocations(inv).some(
          (a) => a.subAccountId === sub._id.toString(),
        ),
      );
      subInvestments.forEach((inv) => {
        const metrics = getAllocationMetrics(
          inv,
          (a) => a.subAccountId === sub._id.toString(),
        );
        investedCapital += metrics.investedCapital;
        currentValue += metrics.currentValue;
      });
    });

    const profitLoss = currentValue - investedCapital;
    const percent =
      investedCapital > 0 ? (profitLoss / investedCapital) * 100 : 0;

    return {
      account: acc.name,
      investedCapital: parseFloat(investedCapital.toFixed(2)),
      currentValue: parseFloat(currentValue.toFixed(2)),
      profitLoss: parseFloat(profitLoss.toFixed(2)),
      percent: parseFloat(percent.toFixed(2)),
    };
  });

  const subRows = subAccounts.map((sub) => {
    const subInvestments = investments.filter((inv) =>
      getInvestmentAllocations(inv).some(
        (a) => a.subAccountId === sub._id.toString(),
      ),
    );
    const investmentsValue = subInvestments.reduce((sum, inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (a) => a.subAccountId === sub._id.toString(),
      );
      return sum + metrics.currentValue;
    }, 0);
    const investedCapital = subInvestments.reduce((sum, inv) => {
      const metrics = getAllocationMetrics(
        inv,
        (a) => a.subAccountId === sub._id.toString(),
      );
      return sum + metrics.investedCapital;
    }, 0);
    const profitLoss = investmentsValue - investedCapital;
    const percent =
      investedCapital > 0 ? (profitLoss / investedCapital) * 100 : 0;
    return {
      subAccount: sub.name,
      type: sub.type,
      balance: sub.balance || 0,
      investedCapital: parseFloat(investedCapital.toFixed(2)),
      currentValue: parseFloat(investmentsValue.toFixed(2)),
      profitLoss: parseFloat(profitLoss.toFixed(2)),
      percent: parseFloat(percent.toFixed(2)),
    };
  });

  console.log(
    JSON.stringify(
      { userId, accounts: accountRows, subAccounts: subRows },
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
