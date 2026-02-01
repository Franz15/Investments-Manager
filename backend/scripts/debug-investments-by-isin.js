import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Investment from "../models/Investment.js";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userId = process.argv[2] || "ana";
const isinArg = process.argv[3] || "";
const rawIsins = isinArg
  .split(/[,\s]+/)
  .map((v) => v.trim().toUpperCase())
  .filter(Boolean);

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

const main = async () => {
  if (!rawIsins.length) {
    console.error("Uso: node debug-investments-by-isin.js <userId> <ISINs>");
    process.exit(1);
  }

  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager",
  );

  const [accounts, subAccounts] = await Promise.all([
    Account.find({ user: userId }).lean(),
    SubAccount.find({ user: userId }).lean(),
  ]);
  const accountMap = new Map(accounts.map((a) => [String(a._id), a]));
  const subMap = new Map(subAccounts.map((s) => [String(s._id), s]));

  const investments = await Investment.find({
    user: userId,
    isin: { $in: rawIsins },
  }).lean();

  const results = investments.map((inv) => {
    const accountId = toId(inv.account);
    const subAccountId = toId(inv.subAccount);
    const account = accountId ? accountMap.get(accountId) : null;
    const subAccount = subAccountId ? subMap.get(subAccountId) : null;
    const allocations = Array.isArray(inv.allocations) ? inv.allocations : [];

    const allocationsDetail = allocations.map((allocation) => {
      const allocAccountId = toId(allocation.account);
      const allocSubAccountId = toId(allocation.subAccount);
      const allocAccount = allocAccountId
        ? accountMap.get(allocAccountId)
        : null;
      const allocSubAccount = allocSubAccountId
        ? subMap.get(allocSubAccountId)
        : null;
      return {
        accountId: allocAccountId,
        accountName: allocAccount?.name || allocAccount?.bankName || null,
        subAccountId: allocSubAccountId,
        subAccountName: allocSubAccount?.name || null,
        amount: Number(allocation.amount) || 0,
        quantity: Number(allocation.quantity) || 0,
        averagePurchasePrice: Number(allocation.averagePurchasePrice) || 0,
      };
    });

    return {
      id: toId(inv._id),
      name: inv.name,
      isin: inv.isin,
      accountId,
      accountName: account?.name || account?.bankName || null,
      subAccountId,
      subAccountName: subAccount?.name || null,
      platformUrl: inv.platformUrl || null,
      isAutomatedPortfolio: Boolean(inv.isAutomatedPortfolio),
      quantity: Number(inv.quantity) || 0,
      averagePurchasePrice:
        Number(inv.averagePurchasePrice) || Number(inv.purchasePrice) || 0,
      currentPrice: Number(inv.currentPrice) || 0,
      investedCapital: Number(getInvestmentInvestedCapital(inv).toFixed(2)),
      currentValue: Number(getInvestmentTotalValue(inv).toFixed(2)),
      allocations: allocationsDetail,
    };
  });

  console.log(
    JSON.stringify(
      {
        userId,
        requestedIsins: rawIsins,
        found: results.length,
        investments: results,
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
