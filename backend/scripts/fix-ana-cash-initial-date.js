/**
 * Ajusta en BBDD las subcuentas de efectivo de Ana para que la gráfica
 * "Evolución del Patrimonio Total" muestre el cash correcto.
 *
 * Opciones:
 * 1. Quitar initialDate a las subcuentas cash/savings de Ana
 *    → El backend tratará ese efectivo como existente desde el primer día del histórico.
 *
 * Uso: node scripts/fix-ana-cash-initial-date.js [--dry-run]
 *      --dry-run: solo muestra qué se cambiaría, no escribe en BBDD
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import SubAccount from "../models/SubAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userId = "ana";
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");
  if (dryRun) {
    console.log("*** MODO DRY-RUN: no se modificará la BBDD ***\n");
  }

  const cashSubAccounts = await SubAccount.find({
    user: userId,
    type: { $in: ["cash", "savings"] },
  });

  if (cashSubAccounts.length === 0) {
    console.log("No hay subcuentas cash/savings para Ana.");
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  const withDate = cashSubAccounts.filter((sa) => sa.initialDate != null);
  const withoutDate = cashSubAccounts.filter((sa) => sa.initialDate == null);

  console.log(`Subcuentas cash/savings de Ana: ${cashSubAccounts.length}`);
  console.log(`  Con initialDate: ${withDate.length}`);
  console.log(`  Sin initialDate: ${withoutDate.length}\n`);

  if (withDate.length === 0) {
    console.log("Ninguna tiene initialDate; no hay nada que cambiar.");
    await mongoose.disconnect();
    process.exit(0);
    return;
  }

  console.log("Subcuentas que se modificarían (quitar initialDate):");
  withDate.forEach((sa) => {
    const dateStr = sa.initialDate
      ? new Date(sa.initialDate).toISOString().split("T")[0]
      : "-";
    console.log(
      `  - ${sa.name} (${sa.type}): balance ${sa.balance.toFixed(2)} €, initialDate actual: ${dateStr}`,
    );
  });

  if (!dryRun) {
    let updated = 0;
    for (const sa of withDate) {
      sa.initialDate = undefined;
      await sa.save();
      updated++;
    }
    console.log(`\nActualizadas ${updated} subcuentas (initialDate quitado).`);
  } else {
    console.log("\nEjecuta sin --dry-run para aplicar los cambios.");
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
