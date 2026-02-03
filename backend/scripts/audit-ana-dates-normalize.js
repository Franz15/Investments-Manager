/**
 * Auditoría de fechas para Ana y normalización:
 * - Efectivo (cash/savings) sin initialDate o inconsistente → 15 Octubre
 * - Inversiones: purchaseDate o primera operación creation → 15 Enero si falta o inconsistente
 *
 * Uso: node scripts/audit-ana-dates-normalize.js [--apply]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Transaction from "../models/Transaction.js";
import Debt from "../models/Debt.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const USER_ID = "ana";
const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

// Fechas por defecto: 15 Oct efectivo, 15 Ene inversión (año 2025 por defecto)
const DEFAULT_CASH_DATE = new Date(Date.UTC(2025, 9, 15, 12, 0, 0)); // 15 Oct 2025
const DEFAULT_INV_DATE = new Date(Date.UTC(2025, 0, 15, 12, 0, 0)); // 15 Ene 2025

function dateStr(d) {
  if (!d) return "(null)";
  return new Date(d).toISOString().split("T")[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  await mongoose.connect(MONGODB_URI);

  console.log("=== AUDITORÍA FECHAS ANA ===\n");

  const accounts = await Account.find({ user: USER_ID }).lean();
  const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));

  // --- Subcuentas cash/savings ---
  const cashSubs = await SubAccount.find({
    user: USER_ID,
    type: { $in: ["cash", "savings"] },
  }).lean();
  console.log("--- Efectivo (cash/savings) ---");
  const cashToNormalize = [];
  for (const s of cashSubs) {
    const acc = accountById.get(String(s.account));
    const hasDate = !!s.initialDate;
    const ok = hasDate && dateStr(s.initialDate).startsWith("2025-10-15");
    console.log(
      `  ${s.name} (${acc?.name || "?"})  balance: ${s.balance}  initialDate: ${dateStr(s.initialDate)}  ${ok ? "OK" : "→ 15 Oct"}`,
    );
    if (!ok) cashToNormalize.push(s);
  }

  // --- Inversiones ---
  const investments = await Investment.find({
    user: USER_ID,
    status: { $ne: "closed" },
    $or: [
      { account: { $exists: true, $ne: null } },
      { "allocations.0": { $exists: true } },
    ],
  }).lean();

  const creationDates = await InvestmentHistory.find({
    user: USER_ID,
    operation: "creation",
  })
    .select("investment date")
    .sort({ date: 1 })
    .lean();
  const firstCreationByInv = new Map();
  creationDates.forEach((e) => {
    const id = e.investment?.toString();
    if (id && !firstCreationByInv.has(id))
      firstCreationByInv.set(id, new Date(e.date));
  });

  console.log("\n--- Inversiones (fecha compra / creation) ---");
  const invToNormalize = [];
  for (const inv of investments) {
    const purchaseDate = inv.purchaseDate ? new Date(inv.purchaseDate) : null;
    const firstCreation = firstCreationByInv.get(inv._id.toString());
    const refDate = purchaseDate || firstCreation;
    const refStr = refDate ? dateStr(refDate) : "(sin fecha)";
    const ok =
      refDate && refDate.getUTCMonth() === 0 && refDate.getUTCDate() === 15; // 15 Ene
    console.log(
      `  ${inv.name}  purchaseDate: ${dateStr(inv.purchaseDate)}  firstCreation: ${dateStr(firstCreation)}  ref: ${refStr}  ${ok ? "OK" : "→ 15 Ene"}`,
    );
    if (!refDate || !ok)
      invToNormalize.push({ inv, firstCreation, purchaseDate });
  }

  // --- Transacciones ---
  const transactions = await Transaction.find({ user: USER_ID })
    .sort({ date: 1 })
    .lean();
  console.log(
    `\n--- Transacciones --- Total: ${transactions.length}  Primera: ${transactions.length ? dateStr(transactions[0].date) : "-"}  Última: ${transactions.length ? dateStr(transactions[transactions.length - 1].date) : "-"}`,
  );

  // --- Deudas ---
  const debts = await Debt.find({ user: USER_ID, status: "active" }).lean();
  console.log(
    `\n--- Deudas activas --- Total: ${debts.length}  Suma: ${debts.reduce((s, d) => s + (d.remainingAmount || 0), 0).toFixed(2)} €`,
  );

  // --- Aplicar normalización ---
  if (apply && (cashToNormalize.length > 0 || invToNormalize.length > 0)) {
    console.log("\n=== APLICANDO NORMALIZACIÓN ===\n");
    for (const s of cashToNormalize) {
      const sub = await SubAccount.findById(s._id);
      if (sub) {
        sub.initialDate = DEFAULT_CASH_DATE;
        await sub.save();
        console.log(`  Subcuenta "${sub.name}" → initialDate 15 Oct 2025`);
      }
    }
    for (const { inv } of invToNormalize) {
      const doc = await Investment.findById(inv._id);
      if (doc) {
        doc.purchaseDate = DEFAULT_INV_DATE;
        await doc.save();
        console.log(`  Inversión "${doc.name}" → purchaseDate 15 Ene 2025`);
      }
    }
    // Crear entradas de historial "creation" si faltan para que exista una creation el 15 Ene
    for (const { inv, firstCreation } of invToNormalize) {
      if (!firstCreation) {
        const doc = await Investment.findById(inv._id);
        if (doc) {
          const existing = await InvestmentHistory.findOne({
            user: USER_ID,
            investment: doc._id,
            operation: "creation",
          });
          if (!existing) {
            const InvestmentHistoryModel = (
              await import("../models/InvestmentHistory.js")
            ).default;
            const totalVal = doc.isAutomatedPortfolio
              ? doc.currentPrice
              : (doc.quantity || 0) * (doc.currentPrice || 0);
            await InvestmentHistoryModel.create({
              user: USER_ID,
              investment: doc._id,
              date: DEFAULT_INV_DATE,
              currentPrice: doc.currentPrice || 0,
              quantity: doc.quantity || 0,
              totalValue: totalVal,
              operation: "creation",
              operationAmount: doc.isAutomatedPortfolio
                ? doc.quantity
                : (doc.quantity || 0) *
                  (doc.purchasePrice || doc.averagePurchasePrice || 0),
            });
            console.log(
              `  Historial creation creado para "${doc.name}" 15 Ene 2025`,
            );
          }
        }
      }
    }
  } else if (cashToNormalize.length > 0 || invToNormalize.length > 0) {
    console.log("\nEjecuta con --apply para normalizar fechas.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
