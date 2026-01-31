/**
 * Lee la BBDD y muestra EXACTAMENTE lo que hay.
 * Sin asumir nada: cuentas, subcuentas, inversiones, historial.
 *
 * Uso: node scripts/read-db-actual-data.js
 *
 * La app usa la misma lógica para capital y rendimiento:
 * - Capital aportado = suma de operationAmount (o operationPrice*quantity o totalValue en creation) en creation+add.
 * - Capital retirado = suma en sell+withdraw.
 * - Rendimiento = valor actual inversiones - capital (aportado o neto).
 *
 * Si los números no coinciden con la realidad, hay que corregir la BBDD:
 * - InvestmentHistory: que todas las operaciones creation/add tengan operationAmount (o operationPrice y quantity).
 * - Investment: que cada inversión tenga account/subAccount correctos (cuenta principal).
 * - SubAccount: que balance refleje el efectivo real.
 */
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

function resolveOperationAmount(entry) {
  let amount = entry?.operationAmount;
  if (amount == null || amount === 0) {
    if (entry?.operationPrice != null && entry?.quantity != null) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry?.operation === "creation" && entry?.totalValue != null) {
      amount = entry.totalValue;
    }
  }
  return amount ?? 0;
}

function getSignedOperationAmount(entry) {
  if (!["creation", "add", "withdraw", "sell"].includes(entry?.operation))
    return 0;
  const amount = resolveOperationAmount(entry);
  if (entry.operation === "withdraw" || entry.operation === "sell") {
    return -Math.abs(amount);
  }
  return amount;
}

async function main() {
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  const usersFromAccounts = await Account.distinct("user");
  const usersFromInv = await Investment.distinct("user");
  const userIds = [...new Set([...usersFromAccounts, ...usersFromInv])].filter(
    Boolean,
  );

  for (const userId of userIds) {
    console.log("\n" + "=".repeat(80));
    console.log("USUARIO:", userId);
    console.log("=".repeat(80));

    const accounts = await Account.find({ user: userId }).lean();
    console.log("\n--- CUENTAS (Account) ---");
    console.log("Total:", accounts.length);
    for (const a of accounts) {
      console.log(
        `  _id: ${a._id}  name: "${a.name || ""}"  bankName: "${a.bankName || ""}"`,
      );
    }

    const subAccounts = await SubAccount.find({ user: userId }).lean();
    console.log("\n--- SUBCUENTAS (SubAccount) ---");
    console.log("Total:", subAccounts.length);
    for (const s of subAccounts) {
      const acc = accounts.find((a) => String(a._id) === String(s.account));
      console.log(
        `  _id: ${s._id}  name: "${s.name || ""}"  type: ${s.type}  balance: ${Number(s.balance) ?? 0}  account: ${s.account} (${acc?.name ?? "?"})`,
      );
    }

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    })
      .populate("account", "name bankName")
      .populate("subAccount", "name type")
      .lean();

    console.log(
      "\n--- INVERSIONES (Investment) - cuenta principal account/subAccount ---",
    );
    console.log("Total:", investments.length);

    let totalValueFromInv = 0;
    let totalCostBasisFromInv = 0;
    const byAccountId = {};

    for (const inv of investments) {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      const costBasis = inv.isAutomatedPortfolio
        ? inv.quantity || 0
        : (inv.quantity || 0) *
          (inv.averagePurchasePrice || inv.purchasePrice || 0);
      totalValueFromInv += value;
      totalCostBasisFromInv += costBasis;

      const accId = inv.account ? String(inv.account._id || inv.account) : "";
      if (!byAccountId[accId])
        byAccountId[accId] = { value: 0, costBasis: 0, names: [] };
      byAccountId[accId].value += value;
      byAccountId[accId].costBasis += costBasis;
      byAccountId[accId].names.push(inv.name);

      const accName =
        inv.account?.name || inv.account?.bankName || accId || "?";
      const subName = inv.subAccount?.name || (inv.subAccount ? "?" : "—");
      console.log(
        `  "${inv.name}"  account: ${accName}  subAccount: ${subName}  value: ${value.toFixed(2)}  costBasis: ${costBasis.toFixed(2)}  allocations: ${inv.allocations?.length ?? 0}`,
      );
    }

    console.log(
      "\n  Suma valor actual (desde Investment):",
      totalValueFromInv.toFixed(2),
    );
    console.log(
      "  Suma coste (quantity*avgPrice) desde Investment:",
      totalCostBasisFromInv.toFixed(2),
    );

    console.log(
      "\n--- TOTALES POR CUENTA (por investment.account principal) ---",
    );
    for (const [accId, data] of Object.entries(byAccountId)) {
      const acc = accounts.find((a) => String(a._id) === accId);
      const name = acc ? acc.name || acc.bankName : accId || "Sin cuenta";
      console.log(
        `  ${name}:  valor ${data.value.toFixed(2)}  costBasis ${data.costBasis.toFixed(2)}  (${data.names.length} inversiones)`,
      );
    }

    const invIds = investments.map((i) => i._id);
    const historyEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: invIds },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    })
      .sort({ date: 1 })
      .lean();

    console.log(
      "\n--- HISTORIAL (InvestmentHistory) - creation, add, sell, withdraw ---",
    );
    console.log("Total entradas:", historyEntries.length);

    let sumCreationAdd = 0;
    let sumSellWithdraw = 0;
    const byOp = { creation: 0, add: 0, sell: 0, withdraw: 0 };

    for (const entry of historyEntries) {
      const signed = getSignedOperationAmount(entry);
      const amount = resolveOperationAmount(entry);
      if (entry.operation === "creation" || entry.operation === "add") {
        sumCreationAdd += signed;
        byOp[entry.operation] += signed;
      } else {
        sumSellWithdraw += Math.abs(signed);
        byOp[entry.operation] += Math.abs(signed);
      }
    }

    console.log("  creation (suma amount):", byOp.creation.toFixed(2));
    console.log("  add (suma amount):", byOp.add.toFixed(2));
    console.log("  sell (suma amount):", byOp.sell.toFixed(2));
    console.log("  withdraw (suma amount):", byOp.withdraw.toFixed(2));
    console.log("  TOTAL APORTADO (creation+add):", sumCreationAdd.toFixed(2));
    console.log(
      "  TOTAL RETIRADO (sell+withdraw):",
      sumSellWithdraw.toFixed(2),
    );
    console.log(
      "  NETO (aportado - retirado):",
      (sumCreationAdd - sumSellWithdraw).toFixed(2),
    );

    const totalEfectivo = subAccounts.reduce(
      (s, sub) => s + (Number(sub.balance) || 0),
      0,
    );
    const capitalNeto = sumCreationAdd - sumSellWithdraw;
    const capitalAportadoIncluyeEfectivo = capitalNeto + totalEfectivo;

    console.log("\n--- CÓMO DEBERÍA MOSTRARSE EN APP ---");
    console.log("  Efectivo total (subcuentas):", totalEfectivo.toFixed(2));
    console.log(
      "  Capital neto invertido (historial):",
      capitalNeto.toFixed(2),
    );
    console.log(
      "  Capital aportado (INCLUYE EFECTIVO) = neto + efectivo:",
      capitalAportadoIncluyeEfectivo.toFixed(2),
    );
    console.log("  Valor actual inversiones:", totalValueFromInv.toFixed(2));
    console.log(
      "  Rendimiento acumulado (solo inversiones) = valor inv - neto inv:",
      (totalValueFromInv - capitalNeto).toFixed(2),
    );

    const subsByAccount = {};
    for (const s of subAccounts) {
      const accId = String(s.account);
      if (!subsByAccount[accId])
        subsByAccount[accId] = { balance: 0, list: [] };
      subsByAccount[accId].balance += Number(s.balance) ?? 0;
      subsByAccount[accId].list.push(s.name);
    }
    console.log("\n--- SALDO EFECTIVO POR CUENTA (SubAccount.balance) ---");
    for (const [accId, data] of Object.entries(subsByAccount)) {
      const acc = accounts.find((a) => String(a._id) === accId);
      const name = acc ? acc.name || acc.bankName : accId;
      console.log(
        `  ${name}:  balance total subcuentas ${data.balance.toFixed(2)}  (${data.list.join(", ")})`,
      );
    }
  }

  await mongoose.disconnect();
  console.log("\nDesconectado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
