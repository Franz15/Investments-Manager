import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import { saveDailyVariation } from "../services/dailyVariationService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

async function recalculateToday() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`Recalculando variaciones diarias de hoy para ${userId}...`);

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    let updated = 0;
    for (const inv of investments) {
      const totalValue = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      await saveDailyVariation(inv._id, userId, totalValue);
      updated++;
    }

    console.log(`✅ Variaciones actualizadas: ${updated}`);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

recalculateToday();
