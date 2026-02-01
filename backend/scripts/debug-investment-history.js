import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userId = process.argv[2];
const investmentId = process.argv[3];

const toId = (value) => (value?._id ? value._id.toString() : value?.toString());

const main = async () => {
  if (!userId || !investmentId) {
    console.error(
      "Uso: node debug-investment-history.js <userId> <investmentId>",
    );
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

  const entries = await InvestmentHistory.find({
    user: userId,
    investment: investmentId,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const formatted = entries.map((entry) => {
    const accountId = toId(entry.account);
    const subAccountId = toId(entry.subAccount);
    const account = accountId ? accountMap.get(accountId) : null;
    const sub = subAccountId ? subMap.get(subAccountId) : null;
    return {
      id: toId(entry._id),
      date: entry.date,
      operation: entry.operation,
      operationAmount: entry.operationAmount ?? null,
      operationPrice: entry.operationPrice ?? null,
      quantity: entry.quantity ?? null,
      totalValue: entry.totalValue ?? null,
      accountId,
      accountName: account?.name || account?.bankName || null,
      subAccountId,
      subAccountName: sub?.name || null,
      notes: entry.notes || null,
    };
  });

  console.log(
    JSON.stringify(
      { userId, investmentId, count: formatted.length, entries: formatted },
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
