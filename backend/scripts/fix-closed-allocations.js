/**
 * Script para corregir las allocations de TODAS las inversiones cerradas.
 * Las pone a amount=0, quantity=0 para que no cuenten como capital invertido.
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "..", ".env") });

async function fixClosedAllocations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB");

    const Investment = (await import("../models/Investment.js")).default;

    const closedInvestments = await Investment.find({ status: "closed" });

    console.log(
      `\nEncontradas ${closedInvestments.length} inversiones cerradas:\n`,
    );

    let fixed = 0;

    for (const inv of closedInvestments) {
      const hasNonZeroAllocations =
        Array.isArray(inv.allocations) &&
        inv.allocations.some((a) => a.amount > 0 || a.quantity > 0);

      if (!hasNonZeroAllocations) {
        console.log(
          `  [${inv.user}] ${inv.name} - allocations ya están a cero ✓`,
        );
        continue;
      }

      const oldAllocations = inv.allocations.map((a) => ({
        account: a.account,
        amount: a.amount,
        quantity: a.quantity,
      }));

      inv.allocations = inv.allocations.map((alloc) => {
        const obj = alloc.toObject ? alloc.toObject() : { ...alloc };
        obj.amount = 0;
        obj.quantity = 0;
        obj.averagePurchasePrice = 0;
        return obj;
      });

      await inv.save();

      console.log(`  [${inv.user}] ${inv.name}`);
      oldAllocations.forEach((old) => {
        console.log(
          `    Cuenta ${old.account}: ${old.amount?.toFixed(2)}€ / ${old.quantity} uds → 0`,
        );
      });
      console.log(`    ✅ Corregida`);
      fixed++;
    }

    console.log(`\n========================================`);
    console.log(`Resumen: ${fixed} inversiones corregidas`);
    console.log(`========================================`);

    await mongoose.disconnect();
    console.log("Desconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

fixClosedAllocations();
