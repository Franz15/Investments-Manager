import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

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

const toDateKey = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

async function recalculateFromHistory() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(
      `Recalculando DailyVariation desde InvestmentHistory para ${userId}...`,
    );

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    let updated = 0;

    for (const inv of investments) {
      const historyEntries = await InvestmentHistory.find({
        user: userId,
        investment: inv._id,
        totalValue: { $exists: true, $ne: null },
      }).sort({ date: 1 });

      if (historyEntries.length === 0) {
        continue;
      }

      const daysMap = new Map();
      for (const entry of historyEntries) {
        const key = toDateKey(entry.date);
        const existing = daysMap.get(key) || {
          totalValue: null,
          capitalChange: 0,
          date: new Date(key),
        };

        existing.totalValue = entry.totalValue;
        if (entry.operation === "creation" || entry.operation === "add") {
          existing.capitalChange += getOperationAmount(entry);
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          existing.capitalChange -= Math.abs(getOperationAmount(entry));
        }
        daysMap.set(key, existing);
      }

      const dayKeys = Array.from(daysMap.keys()).sort((a, b) => a - b);
      let previousTotalValue = null;

      for (const key of dayKeys) {
        const day = daysMap.get(key);
        let changeAmount = 0;
        let changePercent = 0;

        if (previousTotalValue !== null && previousTotalValue > 0) {
          const valueChange = day.totalValue - previousTotalValue;
          changeAmount = valueChange - day.capitalChange;
          changePercent =
            previousTotalValue > 0
              ? (changeAmount / previousTotalValue) * 100
              : 0;
        }

        await DailyVariation.findOneAndUpdate(
          {
            investment: inv._id,
            user: userId,
            date: {
              $gte: day.date,
              $lt: new Date(day.date.getTime() + 24 * 60 * 60 * 1000),
            },
          },
          {
            investment: inv._id,
            user: userId,
            date: day.date,
            totalValue: day.totalValue,
            changeAmount: parseFloat(changeAmount.toFixed(2)),
            changePercent: parseFloat(changePercent.toFixed(2)),
          },
          { upsert: true, new: true },
        );
        updated++;
        previousTotalValue = day.totalValue;
      }
    }

    console.log(`✅ Variaciones actualizadas: ${updated}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

recalculateFromHistory();
