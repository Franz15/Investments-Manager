import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const getOperationAmount = (entry) => {
  let amount = entry.operationAmount;
  if (!amount || amount === 0) {
    if (entry.operationPrice && entry.quantity) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry.operation === "creation" && entry.totalValue) {
      amount = entry.totalValue;
    }
  }
  return amount || 0;
};

const getCurrentValue = (inv) =>
  inv.isAutomatedPortfolio
    ? inv.currentPrice || 0
    : (inv.quantity || 0) * (inv.currentPrice || 0);

async function sumUserInvestmentReturns() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    if (investments.length === 0) {
      console.log(`No hay inversiones para ${userId}`);
      return;
    }

    const investmentIds = investments.map((inv) => inv._id);
    const historyEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investmentIds },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    }).sort({ date: 1 });

    const capitalByInvestment = new Map();
    historyEntries.forEach((entry) => {
      const invId =
        entry.investment?.toString() || entry.investment?._id?.toString();
      if (!invId) return;

      const prev = capitalByInvestment.get(invId) || {
        added: 0,
        withdrawn: 0,
      };

      if (entry.operation === "creation" || entry.operation === "add") {
        prev.added += getOperationAmount(entry);
      } else if (entry.operation === "sell" || entry.operation === "withdraw") {
        prev.withdrawn += Math.abs(getOperationAmount(entry));
      }
      capitalByInvestment.set(invId, prev);
    });

    let totalCurrentValue = 0;
    let totalNetCapital = 0;
    let totalReturn = 0;

    const rows = investments.map((inv) => {
      const invId = inv._id.toString();
      const currentValue = getCurrentValue(inv);
      const capital = capitalByInvestment.get(invId) || {
        added: 0,
        withdrawn: 0,
      };
      const netCapital = capital.added - capital.withdrawn;
      const returnAmount = currentValue - netCapital;
      const returnPercent =
        netCapital > 0 ? (returnAmount / netCapital) * 100 : null;

      totalCurrentValue += currentValue;
      totalNetCapital += netCapital;
      totalReturn += returnAmount;

      return {
        name: inv.name,
        currentValue,
        netCapital,
        returnAmount,
        returnPercent,
      };
    });

    rows.sort((a, b) => b.returnAmount - a.returnAmount);

    console.log(`\n=== Rendimientos por inversión (${userId}) ===\n`);
    rows.forEach((row) => {
      const percentText =
        row.returnPercent === null ? "N/A" : `${row.returnPercent.toFixed(2)}%`;
      console.log(
        `${row.name} | Actual: ${row.currentValue.toFixed(2)}€ | Capital: ${row.netCapital.toFixed(2)}€ | Rend.: ${row.returnAmount.toFixed(2)}€ (${percentText})`,
      );
    });

    const totalPercent =
      totalNetCapital > 0 ? (totalReturn / totalNetCapital) * 100 : 0;
    console.log("\n=== Totales ===");
    console.log(`Valor actual total: ${totalCurrentValue.toFixed(2)}€`);
    console.log(`Capital neto total: ${totalNetCapital.toFixed(2)}€`);
    console.log(
      `Rendimiento total: ${totalReturn.toFixed(2)}€ (${totalPercent.toFixed(2)}%)`,
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

sumUserInvestmentReturns();
