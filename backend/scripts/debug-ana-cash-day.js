/**
 * Simula el cálculo de cash para Ana el día 2025-10-15 (cuando todas sus subcuentas tienen initialDate)
 * para ver si se están sumando correctamente.
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

async function main() {
  const userId = "ana";
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  // Obtener datos como lo hace balance-daily
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

  // Encontrar startDate
  const allDates = [
    ...allCapitalOperations.map((op) => new Date(op.date)),
    ...allTransactions.map((t) => new Date(t.date)),
  ];
  const startDate = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : new Date();
  startDate.setHours(0, 0, 0, 0);
  const startDateKey = getLocalDateKey(startDate);

  console.log(`startDate: ${startDateKey}\n`);

  // Separar subcuentas como lo hace balance-daily
  const cashSubAccountsWithDate = cashSubAccounts.filter(
    (sa) => sa.initialDate && (sa.type === "cash" || sa.type === "savings"),
  );
  const cashSubAccountsWithoutDate = cashSubAccounts.filter(
    (sa) => !sa.initialDate && (sa.type === "cash" || sa.type === "savings"),
  );

  let initialCash = currentCashBalance;
  const subAccountsAfterStart = [];

  cashSubAccountsWithDate.forEach((subAcc) => {
    const subAccDateKey = getLocalDateKey(subAcc.initialDate);
    if (subAccDateKey <= startDateKey) {
      console.log(
        `Subcuenta "${subAcc.name}" (${subAcc.balance.toFixed(2)} €) → ANTES de startDate (${subAccDateKey} <= ${startDateKey})`,
      );
    } else {
      console.log(
        `Subcuenta "${subAcc.name}" (${subAcc.balance.toFixed(2)} €) → DESPUÉS de startDate (${subAccDateKey} > ${startDateKey}) → se resta de initialCash`,
      );
      subAccountsAfterStart.push(subAcc);
      initialCash -= subAcc.balance;
    }
  });

  console.log(
    `\ninitialCash después de restar subAccountsAfterStart: ${initialCash.toFixed(2)} €`,
  );
  console.log(
    `Subcuentas que se deben sumar el día 2025-10-15: ${subAccountsAfterStart.length}`,
  );
  subAccountsAfterStart.forEach((sa) => {
    console.log(`  - ${sa.name}: ${sa.balance.toFixed(2)} €`);
  });

  const totalToAdd = subAccountsAfterStart.reduce(
    (sum, sa) => sum + sa.balance,
    0,
  );
  console.log(`\nTotal a sumar el 2025-10-15: ${totalToAdd.toFixed(2)} €`);
  console.log(
    `Cash esperado después del 2025-10-15: ${(initialCash + totalToAdd).toFixed(2)} €`,
  );
  console.log(`Cash actual en BBDD: ${currentCashBalance.toFixed(2)} €`);

  // Simular el día 2025-10-15
  const targetDate = new Date("2025-10-15");
  const targetDateKey = getLocalDateKey(targetDate);
  console.log(`\n=== SIMULACIÓN DÍA ${targetDateKey} ===`);

  let simulatedCash = initialCash;
  console.log(`Cash al inicio del día: ${simulatedCash.toFixed(2)} €`);

  // Aplicar subcuentas con initialDate = 2025-10-15
  subAccountsAfterStart.forEach((subAcc) => {
    const subAccDateKey = getLocalDateKey(subAcc.initialDate);
    if (subAccDateKey === targetDateKey) {
      console.log(
        `  Sumando subcuenta "${subAcc.name}": +${subAcc.balance.toFixed(2)} €`,
      );
      simulatedCash += subAcc.balance;
    } else {
      console.log(
        `  Subcuenta "${subAcc.name}" NO se suma (initialDate=${subAccDateKey} !== ${targetDateKey})`,
      );
    }
  });

  console.log(`Cash al final del día: ${simulatedCash.toFixed(2)} €`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
