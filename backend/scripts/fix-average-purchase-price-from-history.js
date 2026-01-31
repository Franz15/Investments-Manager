/**
 * Recalcula investment.averagePurchasePrice (y allocations) desde InvestmentHistory.
 * Corrige distorsión por importes/cantidades duplicados: usa solo el historial como fuente.
 *
 * En historial: creation → quantity = total inicial; add → usamos operationAmount/operationPrice como delta.
 * Uso: node scripts/fix-average-purchase-price-from-history.js [userId]
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { resolveOperationAmount } from "../services/variationEngine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const getAllocationKey = (accountId, subAccountId) =>
  `${accountId?.toString?.() || accountId}-${subAccountId?.toString?.() || subAccountId || "none"}`;

async function rebuildAveragePurchasePriceAndAllocations(investments, scope) {
  let updated = 0;

  for (const investment of investments) {
    const histories = await InvestmentHistory.find({
      ...scope,
      investment: investment._id,
      operation: { $in: ["creation", "add", "withdraw", "sell"] },
    }).sort({ date: 1, createdAt: 1 });

    if (histories.length === 0) continue;

    const allocationState = new Map();
    const ensureBucket = (accountId, subAccountId) => {
      const key = getAllocationKey(accountId, subAccountId);
      if (!allocationState.has(key)) {
        allocationState.set(key, {
          account: accountId,
          subAccount: subAccountId || null,
          quantity: 0,
          cost: 0,
        });
      }
      return allocationState.get(key);
    };

    histories.forEach((entry) => {
      const accountId =
        entry.account ||
        investment.account?._id?.toString?.() ||
        investment.account;
      const subAccountId =
        entry.subAccount ||
        investment.subAccount?._id?.toString?.() ||
        investment.subAccount ||
        null;
      const bucket = ensureBucket(accountId, subAccountId);

      const amount = resolveOperationAmount(entry);
      // creation: quantity = total inicial. add: quantity en BD = total acumulado → delta = operationAmount/operationPrice
      let qtyDelta = 0;
      if (entry.operation === "creation") {
        qtyDelta =
          entry.quantity ||
          (entry.operationPrice ? amount / entry.operationPrice : 0);
      } else if (entry.operation === "add") {
        qtyDelta = entry.operationPrice
          ? (entry.operationAmount || 0) / entry.operationPrice
          : 0;
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        qtyDelta = entry.operationPrice
          ? Math.abs(entry.operationAmount || 0) / entry.operationPrice
          : 0;
        if (
          (!qtyDelta || qtyDelta === 0) &&
          bucket.quantity > 0 &&
          bucket.cost > 0
        ) {
          qtyDelta = Math.abs(amount) / (bucket.cost / bucket.quantity);
        }
      }

      if (entry.operation === "creation" || entry.operation === "add") {
        if (entry.operation === "creation") {
          bucket.quantity = qtyDelta;
          bucket.cost = amount || 0;
        } else {
          bucket.quantity += qtyDelta || 0;
          bucket.cost += amount || 0;
        }
        return;
      }

      if (entry.operation === "withdraw" || entry.operation === "sell") {
        const avgCost = bucket.quantity > 0 ? bucket.cost / bucket.quantity : 0;
        const costReduction = avgCost * (qtyDelta || 0);
        bucket.quantity = Math.max(0, bucket.quantity - (qtyDelta || 0));
        bucket.cost = Math.max(0, bucket.cost - costReduction);
      }
    });

    const allocations = Array.from(allocationState.values())
      .filter((item) => item.cost > 0 || item.quantity > 0)
      .map((item) => ({
        account: item.account,
        subAccount: item.subAccount || null,
        amount: item.cost,
        quantity: item.quantity,
        averagePurchasePrice: item.quantity > 0 ? item.cost / item.quantity : 0,
      }));

    if (allocations.length === 0) continue;

    const totalQty = allocations.reduce(
      (sum, alloc) => sum + (alloc.quantity || 0),
      0,
    );
    const totalCost = allocations.reduce(
      (sum, alloc) => sum + (alloc.amount || 0),
      0,
    );

    const newAvgPrice = totalQty > 0 ? totalCost / totalQty : 0;
    const prevAvg =
      investment.averagePurchasePrice ?? investment.purchasePrice ?? 0;
    const changed =
      Math.abs((newAvgPrice || 0) - (prevAvg || 0)) > 0.001 ||
      Math.abs((investment.quantity || 0) - totalQty) > 0.001;

    if (!changed) continue;

    investment.allocations = allocations;
    investment.account = allocations[0].account;
    investment.subAccount = allocations[0].subAccount || null;
    if (!investment.isAutomatedPortfolio && totalQty > 0) {
      investment.quantity = totalQty;
      investment.averagePurchasePrice = newAvgPrice;
    }

    await investment.save();
    updated++;
    if (!investment.isAutomatedPortfolio) {
      console.log(
        `${investment.name}: precio medio ${(prevAvg || 0).toFixed(4)} → ${(newAvgPrice || 0).toFixed(4)}, quantity ${(investment.quantity ?? 0).toFixed(2)} → ${totalQty.toFixed(2)}`,
      );
    }
  }

  return updated;
}

async function main() {
  const userIdArg = process.argv[2];
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  const query = { account: { $exists: true, $ne: null } };
  if (userIdArg) query.user = userIdArg;
  const scope = userIdArg ? { user: userIdArg } : {};

  const investments = await Investment.find(query);
  console.log(`Inversiones a revisar: ${investments.length}\n`);

  const updated = await rebuildAveragePurchasePriceAndAllocations(
    investments,
    scope,
  );
  console.log(`\nActualizadas: ${updated}`);

  await mongoose.disconnect();
  console.log("Desconectado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
