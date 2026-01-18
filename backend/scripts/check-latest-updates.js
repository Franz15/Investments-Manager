import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import DailyVariation from "../models/DailyVariation.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const targetNames = [
  "Ardtur European Focu R",
  "Kopernik Global ALL-C AE",
  "S1387/Remellan Global SICAV",
  "PSHD/PERSHING SQUARE HOLDINGS LTD",
];

const formatLocal = (date) => (date ? date.toLocaleDateString("es-ES") : "N/A");

async function checkLatestUpdates() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`\n=== Últimas fechas (${userId}) ===\n`);

    for (const name of targetNames) {
      const investment = await Investment.findOne({ user: userId, name });
      if (!investment) {
        console.log(`No encontrada: ${name}`);
        continue;
      }

      const latestVariation = await DailyVariation.findOne({
        user: userId,
        investment: investment._id,
      })
        .sort({ date: -1 })
        .limit(1);

      const latestUpdate = await InvestmentHistory.findOne({
        user: userId,
        investment: investment._id,
        operation: "update",
      })
        .sort({ date: -1 })
        .limit(1);

      console.log(`${name}`);
      console.log(
        `  DailyVariation: ${latestVariation?.date?.toISOString() || "N/A"} (local ${formatLocal(latestVariation?.date)})`,
      );
      console.log(
        `  InvestmentHistory update: ${latestUpdate?.date?.toISOString() || "N/A"} (local ${formatLocal(latestUpdate?.date)})`,
      );
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkLatestUpdates();
