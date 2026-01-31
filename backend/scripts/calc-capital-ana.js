/**
 * Calcula a mano el capital invertido de Ana desde la BBDD.
 * Usa la misma lógica que /stats: todo el historial del usuario;
 * para "add" solo operationAmount (quantity en add es total acumulado).
 *
 * Uso: node scripts/calc-capital-ana.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import User from "../models/User.js";
import SubAccount from "../models/SubAccount.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

function getOperationAmountForStats(entry) {
  const op = entry?.operation;
  if (op === "add") return entry?.operationAmount ?? 0;
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

function getSignedOperationAmountForStats(entry) {
  if (!["creation", "add", "withdraw", "sell"].includes(entry?.operation))
    return 0;
  const amount = getOperationAmountForStats(entry);
  if (entry.operation === "withdraw" || entry.operation === "sell")
    return -Math.abs(amount);
  return amount;
}

async function main() {
  const userId = "ana";
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);

  const user = await User.findOne({ id: userId }).select("id name").lean();
  if (!user) {
    console.log("Usuario 'ana' no encontrado. Listando usuarios:");
    const users = await User.find({}).select("id name").lean();
    users.forEach((u) => console.log(`  id: ${u.id}  name: ${u.name}`));
    await mongoose.disconnect();
    return;
  }
  console.log("Usuario:", user.id, "-", user.name);
  console.log("");

  const entries = await InvestmentHistory.find({
    user: userId,
    operation: { $in: ["creation", "add", "sell", "withdraw"] },
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const investmentIds = [
    ...new Set(entries.map((e) => e.investment?.toString()).filter(Boolean)),
  ];
  const investments = await Investment.find({ _id: { $in: investmentIds } })
    .select("_id name")
    .lean();
  const invMap = new Map(investments.map((i) => [i._id.toString(), i.name]));

  let totalContributed = 0;
  let totalWithdrawn = 0;

  console.log("--- OPERACIONES (orden cronológico) ---");
  console.log("");

  for (const entry of entries) {
    const signed = getSignedOperationAmountForStats(entry);
    const amount = getOperationAmountForStats(entry);
    const invName =
      invMap.get(entry.investment?.toString()) ||
      entry.investment?.toString() ||
      "?";
    const dateStr = new Date(entry.date).toISOString().split("T")[0];

    if (signed >= 0) {
      totalContributed += signed;
      console.log(
        `${dateStr}  ${entry.operation.padEnd(10)}  +${amount.toFixed(2).padStart(12)} €  (${invName})  → Aportado acum: ${totalContributed.toFixed(2)} €`,
      );
    } else {
      totalWithdrawn += Math.abs(signed);
      console.log(
        `${dateStr}  ${entry.operation.padEnd(10)}  -${Math.abs(amount).toFixed(2).padStart(12)} €  (${invName})  → Retirado acum: ${totalWithdrawn.toFixed(2)} €`,
      );
    }
  }

  const netInvested = Math.max(0, totalContributed - totalWithdrawn);

  // Efectivo: subcuentas cash, savings e investment (igual que /stats)
  const cashSavingsSubs = await SubAccount.find({
    user: userId,
    type: { $in: ["cash", "savings"] },
  }).lean();
  const investmentSubs = await SubAccount.find({
    user: userId,
    type: "investment",
  }).lean();
  const totalCashSavings =
    cashSavingsSubs.reduce((s, sub) => s + (Number(sub.balance) || 0), 0) +
    investmentSubs.reduce((s, sub) => s + (Number(sub.balance) || 0), 0);

  const capitalAportadoIncluyeEfectivo = netInvested + totalCashSavings;

  console.log("");
  console.log("--- TOTALES (solo historial) ---");
  console.log(
    "  Total aportado (creation + add):  ",
    totalContributed.toFixed(2),
    "€",
  );
  console.log(
    "  Total retirado (sell + withdraw): ",
    totalWithdrawn.toFixed(2),
    "€",
  );
  console.log(
    "  Capital neto invertido (aportado - retirado):",
    netInvested.toFixed(2),
    "€",
  );
  console.log("");
  console.log("--- EFECTIVO (subcuentas) ---");
  console.log(
    "  Subcuentas cash + savings:",
    cashSavingsSubs
      .reduce((s, sub) => s + (Number(sub.balance) || 0), 0)
      .toFixed(2),
    "€",
  );
  console.log(
    "  Subcuentas investment (saldo disponible):",
    investmentSubs
      .reduce((s, sub) => s + (Number(sub.balance) || 0), 0)
      .toFixed(2),
    "€",
  );
  console.log("  Efectivo total:", totalCashSavings.toFixed(2), "€");
  console.log("");
  console.log("--- CAPITAL APORTADO (INCLUYE EFECTIVO) ---");
  console.log(
    "  Neto invertido (historial) + Efectivo =",
    capitalAportadoIncluyeEfectivo.toFixed(2),
    "€",
  );
  console.log("");
  console.log("  Número de operaciones:", entries.length);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
