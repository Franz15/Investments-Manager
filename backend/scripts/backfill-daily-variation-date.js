import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";
const dateArg = process.argv[3] || null;

if (!dateArg) {
  console.error(
    "Uso: node backfill-daily-variation-date.js <userId> <YYYY-MM-DD>",
  );
  process.exit(1);
}

const targetDate = new Date(dateArg);
targetDate.setHours(0, 0, 0, 0);
const targetDateEnd = new Date(targetDate);
targetDateEnd.setDate(targetDateEnd.getDate() + 1);

const getCurrentValue = (inv) =>
  inv.isAutomatedPortfolio
    ? inv.currentPrice || 0
    : (inv.quantity || 0) * (inv.currentPrice || 0);

async function backfillDailyVariationDate() {
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
    let skipped = 0;

    for (const inv of investments) {
      if (!inv.purchaseDate) {
        skipped++;
        continue;
      }
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      if (purchaseDate > targetDate) {
        skipped++;
        continue;
      }

      const existing = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $gte: targetDate, $lt: targetDateEnd },
      });
      if (existing) {
        skipped++;
        continue;
      }

      let totalValue = null;
      const history = await InvestmentHistory.findOne({
        user: userId,
        investment: inv._id,
        date: { $lt: targetDateEnd },
        totalValue: { $exists: true, $ne: null, $gt: 0 },
      })
        .sort({ date: -1 })
        .limit(1);

      if (history && history.totalValue) {
        totalValue = history.totalValue;
      } else {
        totalValue = getCurrentValue(inv);
      }

      await DailyVariation.create({
        investment: inv._id,
        user: userId,
        date: targetDate,
        totalValue: totalValue,
        changeAmount: 0,
        changePercent: 0,
      });
      created++;
      console.log(`✅ ${inv.name}: ${totalValue.toFixed(2)}€`);
    }

    console.log(
      `\nBackfill completado. Creadas: ${created}, Saltadas: ${skipped}`,
    );
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

backfillDailyVariationDate();
