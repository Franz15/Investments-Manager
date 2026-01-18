import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const getInitialCapital = (inv) => {
  if (inv.isAutomatedPortfolio) {
    return inv.quantity || 0;
  }
  const priceToUse = inv.averagePurchasePrice || inv.purchasePrice || 0;
  return (inv.quantity || 0) * priceToUse;
};

async function backfillCreationEntries() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    let created = 0;

    for (const inv of investments) {
      const hasCapitalEntry = await InvestmentHistory.findOne({
        user: userId,
        investment: inv._id,
        operation: { $in: ["creation", "add"] },
      }).limit(1);

      if (hasCapitalEntry) {
        continue;
      }

      let operationAmount = getInitialCapital(inv);
      if (!operationAmount || operationAmount === 0) {
        operationAmount = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);
      }

      if (!operationAmount || operationAmount === 0) {
        console.log(`⚠️  Sin capital estimable: ${inv.name}`);
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

      const historyEntry = new InvestmentHistory({
        user: userId,
        investment: inv._id,
        date: creationDate,
        currentPrice: operationPrice || inv.currentPrice || 0,
        quantity: inv.quantity || 0,
        totalValue: operationAmount,
        notes: "Backfill creation entry (auto)",
        operation: "creation",
        operationAmount: operationAmount,
        operationPrice: operationPrice,
        dailyChangeAmount: 0,
        dailyChangePercent: 0,
      });

      await historyEntry.save();
      created++;
      console.log(
        `✅ Creada entrada creation para ${inv.name} (${operationAmount.toFixed(2)}€)`,
      );
    }

    console.log(`\nEntradas creadas: ${created}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

backfillCreationEntries();
