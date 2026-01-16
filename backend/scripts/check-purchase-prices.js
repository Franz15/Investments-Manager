import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function checkPurchasePrices() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log(
      "=== VERIFICACIÓN DE purchasePrice EN INVERSIONES NUEVAS ===\n",
    );

    const userId = "ana";
    const currentDate = new Date();

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);

    const investmentsNewThisMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= monthStart;
    });

    console.log(
      `Inversiones nuevas este mes: ${investmentsNewThisMonth.length}\n`,
    );

    // Obtener operaciones del mes
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart },
    }).sort({ date: 1 });

    for (const inv of investmentsNewThisMonth) {
      const hasCreationEntry = allHistoryEntries.some((entry) => {
        const entryInvId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        return (
          entryInvId === inv._id.toString() && entry.operation === "creation"
        );
      });

      const currentValue = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);

      console.log(`\n${inv.name}:`);
      console.log(
        `  - Tiene operación "creation": ${hasCreationEntry ? "Sí" : "No"}`,
      );
      console.log(
        `  - purchasePrice: ${inv.purchasePrice || "null/undefined"}`,
      );
      console.log(`  - quantity: ${inv.quantity || 0}`);
      console.log(`  - currentPrice: ${inv.currentPrice || 0}`);
      console.log(
        `  - isAutomatedPortfolio: ${inv.isAutomatedPortfolio || false}`,
      );
      console.log(`  - Valor actual: ${currentValue.toFixed(2)}€`);

      // Calcular capital inicial según la lógica del código
      let initialCapital = 0;

      if (!hasCreationEntry) {
        const firstHistoryEntry = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $gte: monthStart },
        })
          .sort({ date: 1 })
          .limit(1);

        if (
          firstHistoryEntry &&
          (firstHistoryEntry.operation === "creation" ||
            firstHistoryEntry.operation === "add")
        ) {
          initialCapital =
            firstHistoryEntry.operationAmount ||
            (firstHistoryEntry.operationPrice && firstHistoryEntry.quantity
              ? firstHistoryEntry.operationPrice * firstHistoryEntry.quantity
              : 0);
          console.log(
            `  - Capital desde historial: ${initialCapital.toFixed(2)}€`,
          );
        }

        if (initialCapital === 0) {
          if (inv.isAutomatedPortfolio) {
            initialCapital = inv.quantity || 0;
          } else {
            initialCapital = (inv.quantity || 0) * (inv.purchasePrice || 0);
          }
          console.log(
            `  - Capital desde purchasePrice*quantity: ${initialCapital.toFixed(2)}€`,
          );
        }

        if (initialCapital === 0) {
          initialCapital = inv.isAutomatedPortfolio
            ? inv.currentPrice || 0
            : (inv.quantity || 0) * (inv.currentPrice || 0);
          console.log(
            `  - Capital desde valor actual (fallback): ${initialCapital.toFixed(2)}€`,
          );
        }
      } else {
        // Buscar la operación creation
        const creationEntry = allHistoryEntries.find((entry) => {
          const entryInvId =
            entry.investment?.toString() || entry.investment?._id?.toString();
          return (
            entryInvId === inv._id.toString() && entry.operation === "creation"
          );
        });

        if (creationEntry) {
          initialCapital =
            creationEntry.operationAmount ||
            (creationEntry.operationPrice && creationEntry.quantity
              ? creationEntry.operationPrice * creationEntry.quantity
              : 0) ||
            creationEntry.totalValue ||
            0;
          console.log(
            `  - Capital desde operación "creation": ${initialCapital.toFixed(2)}€`,
          );
        }
      }

      const returnOfThis = currentValue - initialCapital;
      console.log(
        `  - Capital inicial calculado: ${initialCapital.toFixed(2)}€`,
      );
      console.log(`  - Rendimiento: ${returnOfThis.toFixed(2)}€`);
    }
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkPurchasePrices();
