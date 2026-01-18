import mongoose from "mongoose";
import dotenv from "dotenv";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const toAmount = (entry) => {
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

async function auditCapitalOps() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`=== AUDITORÍA DE OPERACIONES (${userId}) ===\n`);

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });
    const investmentMap = new Map(
      investments.map((inv) => [inv._id.toString(), inv.name]),
    );

    const historyEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      operation: { $in: ["creation", "add", "sell", "withdraw"] },
    }).sort({ date: 1 });

    if (historyEntries.length === 0) {
      console.log("No hay operaciones de capital.");
      return;
    }

    const missingAmount = [];
    const suspiciousAmount = [];

    historyEntries.forEach((entry) => {
      const invId =
        entry.investment?.toString() || entry.investment?._id?.toString();
      const invName = investmentMap.get(invId) || invId || "N/A";

      const derived = toAmount(entry);
      const opAmount = entry.operationAmount || 0;
      const hasDerived =
        (entry.operationPrice && entry.quantity) ||
        (entry.operation === "creation" && entry.totalValue);

      if (
        (!entry.operationAmount || entry.operationAmount === 0) &&
        hasDerived
      ) {
        missingAmount.push({
          date: entry.date,
          operation: entry.operation,
          investment: invName,
          operationAmount: entry.operationAmount,
          derived,
        });
      }

      if (entry.operationAmount && hasDerived) {
        const diff = Math.abs(opAmount - derived);
        if (diff > 50 && diff / Math.max(derived, 1) > 0.05) {
          suspiciousAmount.push({
            date: entry.date,
            operation: entry.operation,
            investment: invName,
            operationAmount: opAmount,
            derived,
            diff,
          });
        }
      }
    });

    console.log(`Operaciones de capital: ${historyEntries.length}`);
    console.log(
      `Sin operationAmount (pero derivable): ${missingAmount.length}`,
    );
    missingAmount.slice(0, 15).forEach((m) => {
      console.log(
        `  - ${m.date.toISOString().split("T")[0]} ${m.operation.toUpperCase()} ${m.investment}: derivado ${m.derived.toFixed(2)}€`,
      );
    });

    console.log(
      `\nDiferencias sospechosas (operationAmount vs derivado): ${suspiciousAmount.length}`,
    );
    suspiciousAmount.slice(0, 15).forEach((s) => {
      console.log(
        `  - ${s.date.toISOString().split("T")[0]} ${s.operation.toUpperCase()} ${s.investment}: op ${s.operationAmount.toFixed(2)}€ vs derivado ${s.derived.toFixed(2)}€ (diff ${s.diff.toFixed(2)}€)`,
      );
    });
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

auditCapitalOps();
