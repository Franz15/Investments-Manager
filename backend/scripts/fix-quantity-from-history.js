/**
 * Corrige investment.quantity usando la última entrada de historial por inversión.
 * En InvestmentHistory, entry.quantity es la cantidad TOTAL después de esa operación
 * (no el delta). Así se corrige si las cantidades se duplicaron por sumar deltas en lugar de usar el total.
 *
 * Uso: node scripts/fix-quantity-from-history.js [userId]
 * Sin userId: corrige todas las inversiones de todos los usuarios.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

async function main() {
  const userIdArg = process.argv[2];
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  const query = { account: { $exists: true, $ne: null } };
  if (userIdArg) query.user = userIdArg;

  const investments = await Investment.find(query);
  console.log(`Inversiones a revisar: ${investments.length}\n`);

  let updated = 0;
  for (const inv of investments) {
    const lastEntry = await InvestmentHistory.findOne({
      user: inv.user,
      investment: inv._id,
      operation: { $in: ["creation", "add", "sell", "withdraw", "update"] },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    if (
      !lastEntry ||
      (lastEntry.quantity == null && lastEntry.operation === "update")
    ) {
      continue;
    }

    const correctQuantity = lastEntry.quantity;
    if (correctQuantity == null) continue;

    const currentQty = inv.quantity ?? 0;
    const diff = Math.abs((currentQty || 0) - correctQuantity);
    if (diff < 0.0001) continue;

    console.log(
      `${inv.name} (${inv._id}): quantity actual ${currentQty} -> ${correctQuantity} (última entrada: ${lastEntry.operation} ${new Date(lastEntry.date).toISOString().split("T")[0]})`,
    );
    inv.quantity = correctQuantity;
    await inv.save();
    updated++;
  }

  console.log(`\nActualizadas: ${updated}`);
  await mongoose.disconnect();
  console.log("Desconectado.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
