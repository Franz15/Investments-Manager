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

const backupPath = getArg("--backup");
const confirm = args.includes("--yes");

if (!backupPath) {
  console.error("Debes indicar --backup <ruta>");
  process.exit(1);
}

if (!confirm) {
  console.error(
    "Rollback cancelado. Ejecuta con --yes para confirmar la restauración.",
  );
  process.exit(1);
}

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf-8"));

async function run() {
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const metaPath = path.join(backupPath, "meta.json");
  if (!fs.existsSync(metaPath)) {
    throw new Error("No se encontró meta.json en el backup");
  }

  const meta = readJson(metaPath);
  const scope = meta.user ? { user: meta.user } : null;

  const collections = [
    { name: "investments", model: Investment },
    { name: "investment_history", model: InvestmentHistory },
    { name: "daily_variations", model: DailyVariation },
    { name: "period_variations", model: PeriodVariation },
  ];

  for (const collection of collections) {
    const filePath = path.join(backupPath, `${collection.name}.json`);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Falta el archivo ${collection.name}.json`);
    }
    const docs = readJson(filePath);

    if (scope) {
      await collection.model.deleteMany(scope);
    } else {
      await collection.model.deleteMany({});
    }

    if (docs.length > 0) {
      await collection.model.insertMany(docs, { ordered: false });
    }
  }

  console.log("Rollback completado correctamente.");
  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Error en rollback:", error);
  process.exit(1);
});
