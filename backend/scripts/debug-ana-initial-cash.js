/**
 * Calcula el initialCash de Ana como lo hace balance-daily, incluyendo el "deshacer" de operaciones.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import SubAccount from "../models/SubAccount.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

function getLocalDateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function getOperationAmountForStats(entry) {
  const op = entry?.operation;
  if (op === "add") {
    return entry?.operationAmount ?? 0;
  }
  if (op === "creation") {
    return (
      entry?.operationAmount ??
      (entry?.operationPrice != null && entry?.quantity != null
        ? entry.operationPrice * entry.quantity
        : (entry?.totalValue ?? 0))
    );
  }
  if (op === "sell" || op === "withdraw") {
    const amount =
      entry?.operationAmount ??
      (entry?.operationPrice != null && entry?.quantity != null
        ? entry.operationPrice * entry.quantity
        : 0);
    return amount || 0;
  }
  return 0;
}

const getOpAmount = (op) => Math.abs(getOperationAmountForStats(op) || 0);

async function main() {
  const userId = "ana";
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  const cashSubAccounts = await SubAccount.find({
    user: userId,
    type: { $in: ["cash", "savings"] },
  }).lean();

  const currentCashBalance = cashSubAccounts.reduce(
    (sum, sa) => sum + sa.balance,
    0,
  );

  const investments = await Investment.find({
    user: userId,
    $or: [
      { account: { $exists: true, $ne: null } },
      { "allocations.0": { $exists: true } },
    ],
  }).lean();
  const activeIds = investments.map((inv) => inv._id);

  const allCapitalOperations = await InvestmentHistory.find({
    user: userId,
    investment: { $in: activeIds },
    operation: { $in: ["creation", "add", "withdraw", "sell"] },
  })
    .sort({ date: 1 })
    .lean();

  const allTransactions = await Transaction.find({ user: userId })
    .sort({ date: 1 })
    .lean();

  const allDates = [
    ...allCapitalOperations.map((op) => new Date(op.date)),
    ...allTransactions.map((t) => new Date(t.date)),
  ];
  const startDate = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : new Date();
  startDate.setHours(0, 0, 0, 0);
  const startDateNormalized = new Date(startDate);
  startDateNormalized.setHours(0, 0, 0, 0);
  const startDateKey = getLocalDateKey(startDateNormalized);

  console.log(`startDate: ${startDateKey}\n`);

  const cashSubAccountsWithDate = cashSubAccounts.filter(
    (sa) => sa.initialDate && (sa.type === "cash" || sa.type === "savings"),
  );
  const cashSubAccountsWithoutDate = cashSubAccounts.filter(
    (sa) => !sa.initialDate && (sa.type === "cash" || sa.type === "savings"),
  );

  let initialCash = currentCashBalance;
  const subAccountsAfterStart = [];
  const subAccountsBeforeStart = [];

  cashSubAccountsWithDate.forEach((subAcc) => {
    const subAccDateKey = getLocalDateKey(subAcc.initialDate);
    if (subAccDateKey <= startDateKey) {
      subAccountsBeforeStart.push(subAcc);
    } else {
      subAccountsAfterStart.push(subAcc);
      initialCash -= subAcc.balance;
    }
  });

  console.log(`1. Cash actual: ${currentCashBalance.toFixed(2)} €`);
  console.log(
    `2. Después de restar subAccountsAfterStart: ${initialCash.toFixed(2)} €`,
  );
  console.log(
    `   (restadas ${subAccountsAfterStart.length} subcuentas con total ${subAccountsAfterStart.reduce((s, sa) => s + sa.balance, 0).toFixed(2)} €)\n`,
  );

  const hasCashAtStart =
    subAccountsBeforeStart.length > 0 || cashSubAccountsWithoutDate.length > 0;

  if (hasCashAtStart) {
    console.log("3. Deshaciendo operaciones de capital desde startDate...");
    let contributionsUndone = 0;
    let withdrawalsUndone = 0;

    allCapitalOperations.forEach((op) => {
      const opDate = new Date(op.date);
      opDate.setHours(0, 0, 0, 0);
      if (opDate >= startDateNormalized) {
        const amount = getOpAmount(op);
        if (op.operation === "creation" || op.operation === "add") {
          initialCash += amount;
          contributionsUndone += amount;
        } else if (op.operation === "withdraw" || op.operation === "sell") {
          initialCash -= amount;
          withdrawalsUndone += amount;
        }
      }
    });

    console.log(
      `   Aportaciones deshechas: +${contributionsUndone.toFixed(2)} €`,
    );
    console.log(`   Retiradas deshechas: -${withdrawalsUndone.toFixed(2)} €`);
    console.log(
      `   Cash después de deshacer capital: ${initialCash.toFixed(2)} €\n`,
    );

    console.log("4. Deshaciendo transacciones desde startDate...");
    let incomeUndone = 0;
    let expenseUndone = 0;

    allTransactions.forEach((transaction) => {
      const transDate = new Date(transaction.date);
      transDate.setHours(0, 0, 0, 0);
      if (transDate >= startDateNormalized) {
        if (transaction.type === "income") {
          initialCash -= transaction.amount;
          incomeUndone += transaction.amount;
        } else if (transaction.type === "expense") {
          initialCash += transaction.amount;
          expenseUndone += transaction.amount;
        }
      }
    });

    console.log(`   Ingresos deshechos: -${incomeUndone.toFixed(2)} €`);
    console.log(`   Gastos deshechos: +${expenseUndone.toFixed(2)} €`);
    console.log(
      `   Cash después de deshacer transacciones: ${initialCash.toFixed(2)} €\n`,
    );
  } else {
    console.log("3. No hay cash al inicio, initialCash = 0\n");
    initialCash = 0;
  }

  initialCash = Math.max(0, initialCash);

  console.log(`5. initialCash FINAL: ${initialCash.toFixed(2)} €`);
  console.log(
    `\nEste es el cash con el que empieza la gráfica el día ${startDateKey}.`,
  );
  console.log(
    `Luego, el día 2025-10-15 se suman ${subAccountsAfterStart.reduce((s, sa) => s + sa.balance, 0).toFixed(2)} € de subcuentas.`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
