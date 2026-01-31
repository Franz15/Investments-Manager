import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";
import PeriodVariation from "../models/PeriodVariation.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const args = process.argv.slice(2);
const getArg = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
};

const userId = getArg("--user");
const outputDir = getArg("--out");

const makeStamp = () => {
  const now = new Date();
  const pad = (n) => n.toString().padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const writeJson = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
};

async function run() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const scope = userId ? { user: userId } : {};
  const backupRoot = path.join(process.cwd(), "backups");
  const folderName = outputDir || `variations_backup_${makeStamp()}`;
  const backupPath = path.join(backupRoot, folderName);
  fs.mkdirSync(backupPath, { recursive: true });

  const collections = [
    { name: "investments", model: Investment },
    { name: "investment_history", model: InvestmentHistory },
    { name: "daily_variations", model: DailyVariation },
    { name: "period_variations", model: PeriodVariation },
  ];

  const counts = {};

  for (const collection of collections) {
    const docs = await collection.model.find(scope).lean();
    counts[collection.name] = docs.length;
    writeJson(path.join(backupPath, `${collection.name}.json`), docs);
  }

  const meta = {
    createdAt: new Date().toISOString(),
    user: userId || null,
    counts,
  };
  writeJson(path.join(backupPath, "meta.json"), meta);

  console.log(`Backup guardado en: ${backupPath}`);
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Error creando backup:", error);
  process.exit(1);
});
