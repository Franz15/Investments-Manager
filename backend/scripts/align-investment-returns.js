import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { saveDailyVariation } from "../services/dailyVariationService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";

const targets = {
  "Ardtur European Focu R": 811.23,
  "Kopernik Global ALL-C AE": 1015.06,
  "S1387/Remellan Global SICAV": -920.52,
  "PSHD/PERSHING SQUARE HOLDINGS LTD": -193.2,
};

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

async function alignInvestmentReturns() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    for (const [name, targetReturn] of Object.entries(targets)) {
      const investment = await Investment.findOne({
        user: userId,
        name,
      });

      if (!investment) {
        console.log(`No encontrada inversión: ${name}`);
        continue;
      }

      const historyEntries = await InvestmentHistory.find({
        user: userId,
        investment: investment._id,
        operation: { $in: ["creation", "add", "sell", "withdraw"] },
      });

      let netCapital = 0;
      historyEntries.forEach((entry) => {
        if (entry.operation === "creation" || entry.operation === "add") {
          netCapital += getOperationAmount(entry);
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          netCapital -= Math.abs(getOperationAmount(entry));
        }
      });

      const targetTotalValue = netCapital + targetReturn;
      if (investment.isAutomatedPortfolio) {
        investment.currentPrice = targetTotalValue;
      } else {
        const quantity = investment.quantity || 0;
        if (quantity <= 0) {
          console.log(`Cantidad inválida para ${name}, no se ajusta.`);
          continue;
        }
        investment.currentPrice = targetTotalValue / quantity;
      }

      await investment.save();

      const totalValue = investment.isAutomatedPortfolio
        ? investment.currentPrice
        : (investment.quantity || 0) * (investment.currentPrice || 0);

      await saveDailyVariation(investment._id, userId, totalValue);

      console.log(
        `${name}: capital ${netCapital.toFixed(2)}€ → objetivo ${targetReturn.toFixed(2)}€ (valor total ${totalValue.toFixed(2)}€)`,
      );
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

alignInvestmentReturns();
