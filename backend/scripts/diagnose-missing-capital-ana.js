/**
 * Diagnóstico: dónde pueden faltar ~14k de capital para Ana.
 * - Operaciones "add" sin operationAmount (contamos 0)
 * - Operaciones "creation" con amount 0 o fallback
 * - Subcuentas no incluidas o con balance dudoso
 *
 * Uso: node scripts/diagnose-missing-capital-ana.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

async function main() {
  const userId = "ana";
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);

  console.log("=== DIAGNÓSTICO CAPITAL FALTANTE (Ana) ===\n");

  // 1) Operaciones creation/add donde estamos contando 0 o posible fallo
  const entries = await InvestmentHistory.find({
    user: userId,
    operation: { $in: ["creation", "add"] },
  })
    .sort({ date: 1 })
    .lean();

  const investments = await Investment.find({ user: userId })
    .select("_id name")
    .lean();
  const invMap = new Map(investments.map((i) => [i._id.toString(), i.name]));

  let addWithNoAmount = 0;
  let sumAddMissingEstimated = 0;
  let creationWithFallback = 0;

  // Por inversión: última quantity conocida (para estimar delta en "add" sin operationAmount)
  const lastQtyByInv = new Map();

  console.log("--- 1) Operaciones 'add' SIN operationAmount (contamos 0) ---");
  for (const e of entries) {
    const invId = e.investment?.toString();
    const invName = invMap.get(invId) || invId;
    const dateStr = new Date(e.date).toISOString().split("T")[0];
    if (e.operation === "creation" || e.operation === "add") {
      const qty = e.quantity ?? 0;
      if (e.operation === "add") {
        const hasAmount = e.operationAmount != null && e.operationAmount !== 0;
        if (!hasAmount) {
          addWithNoAmount++;
          const prevQty = lastQtyByInv.get(invId);
          const delta =
            prevQty != null && e.operationPrice != null ? qty - prevQty : null;
          const estimatedFromDelta =
            delta != null && delta > 0 && e.operationPrice
              ? delta * e.operationPrice
              : null;
          if (estimatedFromDelta != null)
            sumAddMissingEstimated += estimatedFromDelta;
          console.log(
            `  ${dateStr}  add  inv: ${invName}  operationAmount: ${e.operationAmount ?? "null"}  operationPrice: ${e.operationPrice ?? "null"}  quantity: ${e.quantity ?? "null"}  prevQty: ${prevQty ?? "—"}  delta: ${delta ?? "—"}  totalValue: ${e.totalValue ?? "null"}`,
          );
          if (estimatedFromDelta != null)
            console.log(
              `    → Estimado (delta * operationPrice): ${estimatedFromDelta.toFixed(2)} €  SUMA FALTANTE ESTIMADA: ${sumAddMissingEstimated.toFixed(2)} €`,
            );
        }
      }
      lastQtyByInv.set(invId, qty);
    }
    if (e.operation === "creation") {
      const hasAmount = e.operationAmount != null && e.operationAmount !== 0;
      if (
        !hasAmount &&
        (e.operationPrice == null || e.quantity == null) &&
        (e.totalValue == null || e.totalValue === 0)
      ) {
        creationWithFallback++;
        console.log(
          `  ${dateStr}  creation  inv: ${invName}  sin operationAmount ni price*quantity ni totalValue`,
        );
      }
    }
  }
  if (addWithNoAmount === 0 && creationWithFallback === 0) {
    console.log("  Ninguna operación creation/add con importe 0 o faltante.\n");
  } else {
    console.log(`  Total 'add' sin operationAmount: ${addWithNoAmount}`);
    console.log(
      `  SUMA ESTIMADA FALTANTE (delta*operationPrice en esos add): ${sumAddMissingEstimated.toFixed(2)} €`,
    );
    console.log(`  Total 'creation' sin importe: ${creationWithFallback}\n`);
  }

  // 2) Todas las subcuentas de Ana (todos los tipos) por si falta alguna
  const allSubs = await SubAccount.find({ user: userId })
    .populate("account", "name bankName")
    .lean();
  console.log("--- 2) Todas las subcuentas de Ana (cualquier tipo) ---");
  let totalAllSubs = 0;
  const byType = {};
  for (const s of allSubs) {
    const bal = Number(s.balance) || 0;
    totalAllSubs += bal;
    byType[s.type] = (byType[s.type] || 0) + bal;
    const accName = s.account?.name || s.account?.bankName || s.account || "?";
    console.log(
      `  ${s.type.padEnd(12)}  balance: ${bal.toFixed(2).padStart(12)}  account: ${accName}  name: ${s.name || ""}`,
    );
  }
  console.log(`  Suma TODAS las subcuentas: ${totalAllSubs.toFixed(2)} €`);
  console.log(`  Por tipo: ${JSON.stringify(byType)}`);
  const cashSavingsInv =
    (byType.cash || 0) + (byType.savings || 0) + (byType.investment || 0);
  console.log(
    `  cash+savings+investment (lo que usa /stats): ${cashSavingsInv.toFixed(2)} €\n`,
  );

  // 3) Cuentas sin subcuentas de tipo cash/savings/investment (por si el efectivo está en otro sitio)
  const accounts = await Account.find({ user: userId }).lean();
  console.log("--- 3) Cuentas de Ana ---");
  for (const a of accounts) {
    const subs = allSubs.filter((s) => String(s.account) === String(a._id));
    const total = subs.reduce((sum, s) => sum + (Number(s.balance) || 0), 0);
    const types = subs
      .map((s) => `${s.type}:${(Number(s.balance) || 0).toFixed(0)}`)
      .join(", ");
    console.log(
      `  ${a.name || a.bankName || a._id}  subcuentas: ${subs.length}  suma balance: ${total.toFixed(2)}  [${types}]`,
    );
  }

  // 4) Coste actual por inversión vs suma historial por inversión (dónde está el hueco)
  const invsWithAccount = await Investment.find({
    user: userId,
    account: { $exists: true, $ne: null },
  }).lean();
  const historyByInv = new Map();
  for (const e of entries) {
    const id = e.investment?.toString();
    if (!id) continue;
    const amt =
      e.operation === "add"
        ? (e.operationAmount ?? 0)
        : e.operation === "creation"
          ? (e.operationAmount ??
            (e.operationPrice != null && e.quantity != null
              ? e.operationPrice * e.quantity
              : (e.totalValue ?? 0)) ??
            0)
          : 0;
    historyByInv.set(id, (historyByInv.get(id) || 0) + (amt || 0));
  }
  let costBasisTotal = 0;
  let historyTotal = 0;
  const gaps = [];
  console.log(
    "\n--- 4) Por inversión: coste (quantity*avgPrice) vs historial ---",
  );
  for (const inv of invsWithAccount) {
    const id = inv._id.toString();
    const costBasis = inv.isAutomatedPortfolio
      ? inv.quantity || 0
      : (inv.quantity || 0) *
        (inv.averagePurchasePrice || inv.purchasePrice || 0);
    const histSum = historyByInv.get(id) || 0;
    costBasisTotal += costBasis;
    historyTotal += histSum;
    const diff = costBasis - histSum;
    if (Math.abs(diff) > 0.5) {
      gaps.push({ name: inv.name, costBasis, histSum, diff });
    }
  }
  for (const g of gaps) {
    console.log(
      `  "${g.name}"  coste: ${g.costBasis.toFixed(2)}  historial: ${g.histSum.toFixed(2)}  DIFERENCIA: ${g.diff.toFixed(2)} €`,
    );
  }
  console.log(`  TOTAL coste inversiones: ${costBasisTotal.toFixed(2)} €`);
  console.log(`  TOTAL historial (creation+add): ${historyTotal.toFixed(2)} €`);
  console.log(
    `  DIFERENCIA GLOBAL (coste - historial): ${(costBasisTotal - historyTotal).toFixed(2)} €  ← posible capital “faltante”`,
  );

  // 5) Inversiones FANTASMA: tienen coste pero CERO en historial (ninguna creation/add)
  const fantasmas = invsWithAccount.filter((inv) => {
    const id = inv._id.toString();
    const costBasis = inv.isAutomatedPortfolio
      ? inv.quantity || 0
      : (inv.quantity || 0) *
        (inv.averagePurchasePrice || inv.purchasePrice || 0);
    const histSum = historyByInv.get(id) || 0;
    return costBasis > 0.01 && histSum < 0.01;
  });
  console.log(
    "\n--- 5) INVERSIONES FANTASMA (Ana): coste > 0 y historial = 0 ---",
  );
  if (fantasmas.length === 0) {
    console.log("  Ninguna.");
  } else {
    let sumFantasma = 0;
    fantasmas.forEach((inv) => {
      const costBasis = inv.isAutomatedPortfolio
        ? inv.quantity || 0
        : (inv.quantity || 0) *
          (inv.averagePurchasePrice || inv.purchasePrice || 0);
      sumFantasma += costBasis;
      console.log(
        `  "${inv.name}"  _id: ${inv._id}  coste: ${costBasis.toFixed(2)} €  (quantity: ${inv.quantity ?? 0}  avgPrice: ${inv.averagePurchasePrice ?? inv.purchasePrice ?? "—"})`,
      );
    });
    console.log(
      `  Total inversiones fantasma: ${fantasmas.length}  Suma coste: ${sumFantasma.toFixed(2)} €`,
    );
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
