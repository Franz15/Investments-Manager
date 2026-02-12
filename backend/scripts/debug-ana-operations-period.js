/**
 * Muestra las operaciones de capital de Ana entre 2025-08-08 y 2025-10-15
 * para ver cuánto cash se reduce antes de sumar las subcuentas.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
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

  const investments = await Investment.find({
    user: userId,
    $or: [
      { account: { $exists: true, $ne: null } },
      { "allocations.0": { $exists: true } },
    ],
  }).lean();
  const activeIds = investments.map((inv) => inv._id);
  const invMap = new Map(investments.map((i) => [i._id.toString(), i.name]));

  const startDate = new Date("2025-08-08");
  startDate.setHours(0, 0, 0, 0);
  const subAccountDate = new Date("2025-10-15");
  subAccountDate.setHours(23, 59, 59, 999);

  const operations = await InvestmentHistory.find({
    user: userId,
    investment: { $in: activeIds },
    operation: { $in: ["creation", "add", "withdraw", "sell"] },
    date: { $gte: startDate, $lte: subAccountDate },
  })
    .sort({ date: 1 })
    .lean();

  console.log(
    `Operaciones entre ${getLocalDateKey(startDate)} y ${getLocalDateKey(subAccountDate)}:\n`,
  );

  let cash = 0;
  let totalContributions = 0;
  let totalWithdrawals = 0;

  operations.forEach((op) => {
    const amount = getOpAmount(op);
    const invName =
      invMap.get(op.investment?.toString()) || op.investment?.toString();
    const dateKey = getLocalDateKey(op.date);

    if (op.operation === "creation" || op.operation === "add") {
      cash -= amount;
      totalContributions += amount;
      console.log(
        `${dateKey}  ${op.operation.padEnd(9)}  -${amount.toFixed(2).padStart(10)} €  ${invName}`,
      );
    } else if (op.operation === "withdraw" || op.operation === "sell") {
      cash += amount;
      totalWithdrawals += amount;
      console.log(
        `${dateKey}  ${op.operation.padEnd(9)}  +${amount.toFixed(2).padStart(10)} €  ${invName}`,
      );
    }
  });

  console.log(`\nTotal aportaciones: ${totalContributions.toFixed(2)} €`);
  console.log(`Total retiradas: ${totalWithdrawals.toFixed(2)} €`);
  console.log(
    `Neto (aportaciones - retiradas): ${(totalContributions - totalWithdrawals).toFixed(2)} €`,
  );
  console.log(`\nCash acumulado (empezando en 0): ${cash.toFixed(2)} €`);
  console.log(`\nEl día 2025-10-15 se suman las subcuentas (95,337.33 €)`);
  console.log(
    `Cash después de sumar subcuentas: ${(cash + 95337.33).toFixed(2)} €`,
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
