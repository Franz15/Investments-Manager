import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";
import { recalculateDailyVariationsForInvestmentFromDate } from "../services/dailyVariationService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const userId = process.argv[2] || "ana";
const dateArg = process.argv[3] || null;
const fromDateArg = process.argv[4] || null;

const targetNames = [
  "Ardtur European Focu R",
  "Kopernik Global ALL-C AE",
  "S1387/Remellan Global SICAV",
  "PSHD/PERSHING SQUARE HOLDINGS LTD",
];

const normalizeDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const parseLocalDate = (value) => {
  if (!value) {
    return null;
  }
  const parts = value.split("-");
  if (parts.length !== 3) {
    return new Date(value);
  }
  const [year, month, day] = parts.map((part) => parseInt(part, 10));
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day);
};

const getLastFriday = () => {
  const today = normalizeDay(new Date());
  const dayOfWeek = today.getDay(); // 0 domingo, 5 viernes
  let diff = (dayOfWeek - 5 + 7) % 7;
  if (diff === 0) {
    diff = 7; // si hoy es viernes, usar el viernes anterior
  }
  const friday = new Date(today);
  friday.setDate(friday.getDate() - diff);
  return friday;
};

const getLatestSourceDate = async (investmentId) => {
  const latestVariation = await DailyVariation.findOne({
    user: userId,
    investment: investmentId,
  })
    .sort({ date: -1 })
    .limit(1);

  const latestUpdate = await InvestmentHistory.findOne({
    user: userId,
    investment: investmentId,
    operation: "update",
  })
    .sort({ date: -1 })
    .limit(1);

  const variationDate = latestVariation?.date
    ? normalizeDay(latestVariation.date)
    : null;
  const updateDate = latestUpdate?.date
    ? normalizeDay(latestUpdate.date)
    : null;

  if (!variationDate && !updateDate) {
    return null;
  }
  if (!variationDate) {
    return updateDate;
  }
  if (!updateDate) {
    return variationDate;
  }
  return variationDate > updateDate ? variationDate : updateDate;
};

async function shiftLatestUpdatesToDate() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const targetDate = dateArg
      ? normalizeDay(parseLocalDate(dateArg))
      : getLastFriday();
    const targetEnd = new Date(targetDate);
    targetEnd.setDate(targetEnd.getDate() + 1);

    console.log(
      `Moviendo updates a ${targetDate.toISOString().split("T")[0]} para ${userId}`,
    );

    for (const name of targetNames) {
      const investment = await Investment.findOne({ user: userId, name });
      if (!investment) {
        console.log(`No encontrada: ${name}`);
        continue;
      }

      const sourceDate = fromDateArg
        ? normalizeDay(parseLocalDate(fromDateArg))
        : await getLatestSourceDate(investment._id);

      if (!sourceDate) {
        console.log(`Sin variaciones para mover: ${name}`);
        continue;
      }

      if (sourceDate.getTime() === targetDate.getTime()) {
        console.log(`Ya está en fecha objetivo: ${name}`);
        continue;
      }

      const sourceEnd = new Date(sourceDate);
      sourceEnd.setDate(sourceEnd.getDate() + 1);

      const todayVariation = await DailyVariation.findOne({
        user: userId,
        investment: investment._id,
        date: { $gte: sourceDate, $lt: sourceEnd },
      }).sort({ date: -1 });

      const targetVariation = await DailyVariation.findOne({
        user: userId,
        investment: investment._id,
        date: { $gte: targetDate, $lt: targetEnd },
      }).sort({ date: -1 });

      if (todayVariation) {
        if (targetVariation) {
          targetVariation.totalValue = todayVariation.totalValue;
          targetVariation.changeAmount = todayVariation.changeAmount;
          targetVariation.changePercent = todayVariation.changePercent;
          await targetVariation.save();
          if (
            todayVariation._id.toString() !== targetVariation._id.toString()
          ) {
            await DailyVariation.deleteOne({ _id: todayVariation._id });
          }
        } else {
          todayVariation.date = targetDate;
          await todayVariation.save();
        }
      }

      const todayUpdate = await InvestmentHistory.findOne({
        user: userId,
        investment: investment._id,
        date: { $gte: sourceDate, $lt: sourceEnd },
        operation: "update",
      }).sort({ date: -1 });

      const targetUpdate = await InvestmentHistory.findOne({
        user: userId,
        investment: investment._id,
        date: { $gte: targetDate, $lt: targetEnd },
        operation: "update",
      }).sort({ date: -1 });

      if (todayUpdate) {
        if (targetUpdate) {
          targetUpdate.currentPrice = todayUpdate.currentPrice;
          targetUpdate.quantity = todayUpdate.quantity;
          targetUpdate.totalValue = todayUpdate.totalValue;
          targetUpdate.dailyChangeAmount = todayUpdate.dailyChangeAmount;
          targetUpdate.dailyChangePercent = todayUpdate.dailyChangePercent;
          targetUpdate.notes = todayUpdate.notes;
          await targetUpdate.save();
          if (todayUpdate._id.toString() !== targetUpdate._id.toString()) {
            await InvestmentHistory.deleteOne({ _id: todayUpdate._id });
          }
        } else {
          todayUpdate.date = targetDate;
          await todayUpdate.save();
        }
      }

      await recalculateDailyVariationsForInvestmentFromDate(
        investment._id,
        userId,
        targetDate,
      );

      console.log(`✔ ${name}`);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

shiftLatestUpdatesToDate();
