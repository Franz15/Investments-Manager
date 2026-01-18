import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import {
  recalculateDailyVariationsForInvestmentFromDate,
  saveDailyVariation,
} from "../services/dailyVariationService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const targetUser = process.argv[2] || null;

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

const getInitialCapital = (inv) => {
  if (inv.isAutomatedPortfolio) {
    return inv.quantity || 0;
  }
  const priceToUse = inv.averagePurchasePrice || inv.purchasePrice || 0;
  return (inv.quantity || 0) * priceToUse;
};

async function syncUserData() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const users = targetUser
      ? [targetUser]
      : await InvestmentHistory.distinct("user");

    for (const userId of users) {
      if (!userId || userId === "null") continue;

      console.log(`\n=== Sincronizando ${userId} ===`);
      const investments = await Investment.find({
        user: userId,
        account: { $exists: true, $ne: null },
      });

      if (investments.length === 0) {
        console.log("Sin inversiones.");
        continue;
      }

      const investmentIds = investments.map((inv) => inv._id);
      const historyEntries = await InvestmentHistory.find({
        user: userId,
        investment: { $in: investmentIds },
      }).sort({ date: 1 });

      let updatedOperationAmount = 0;
      for (const entry of historyEntries) {
        if (
          entry.operation === "creation" ||
          entry.operation === "add" ||
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          const amount = getOperationAmount(entry);
          if (!entry.operationAmount || entry.operationAmount === 0) {
            entry.operationAmount = amount;
            await entry.save();
            updatedOperationAmount++;
          }
        }
      }

      console.log(`OperationAmount actualizados: ${updatedOperationAmount}`);

      let createdCreation = 0;
      for (const inv of investments) {
        const hasCreationEntry = historyEntries.some((entry) => {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return (
            entryInvId === inv._id.toString() &&
            (entry.operation === "creation" || entry.operation === "add")
          );
        });

        if (!hasCreationEntry) {
          let operationAmount = getInitialCapital(inv);
          if (!operationAmount || operationAmount === 0) {
            operationAmount = inv.isAutomatedPortfolio
              ? inv.currentPrice || 0
              : (inv.quantity || 0) * (inv.currentPrice || 0);
          }

          if (!operationAmount || operationAmount === 0) {
            continue;
          }

          const operationPrice = inv.isAutomatedPortfolio
            ? null
            : inv.averagePurchasePrice ||
              inv.purchasePrice ||
              inv.currentPrice ||
              0;
          const creationDate = inv.purchaseDate
            ? new Date(inv.purchaseDate)
            : new Date();
          creationDate.setHours(0, 0, 0, 0);

          await InvestmentHistory.create({
            user: userId,
            investment: inv._id,
            date: creationDate,
            currentPrice: operationPrice || inv.currentPrice || 0,
            quantity: inv.quantity || 0,
            totalValue: operationAmount,
            notes: "Backfill creation entry (sync)",
            operation: "creation",
            operationAmount: operationAmount,
            operationPrice: operationPrice,
            dailyChangeAmount: 0,
            dailyChangePercent: 0,
          });
          createdCreation++;
        }
      }

      console.log(`Creation backfill: ${createdCreation}`);

      let recalculated = 0;
      for (const inv of investments) {
        const earliest = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          totalValue: { $exists: true, $ne: null },
        })
          .sort({ date: 1 })
          .limit(1);

        if (earliest && earliest.date) {
          await recalculateDailyVariationsForInvestmentFromDate(
            inv._id,
            userId,
            earliest.date,
          );
          recalculated++;
        }

        const totalValue = inv.isAutomatedPortfolio
          ? inv.currentPrice
          : (inv.quantity || 0) * (inv.currentPrice || 0);
        await saveDailyVariation(inv._id, userId, totalValue);
      }

      console.log(`DailyVariation recalculadas: ${recalculated}`);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

syncUserData();
