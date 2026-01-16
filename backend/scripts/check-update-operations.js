import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function checkUpdateOperations() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("=== VERIFICACIÓN DE OPERACIONES 'update' EN EL MES ===\n");

    const userId = "ana";
    const currentDate = new Date();

    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);

    const monthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );
    monthEnd.setHours(23, 59, 59, 999);

    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    // Obtener TODAS las operaciones del mes
    const allHistoryEntries = await InvestmentHistory.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart, $lte: monthEnd },
    })
      .populate("investment")
      .sort({ date: 1 });

    console.log(`Total operaciones en el mes: ${allHistoryEntries.length}\n`);

    // Agrupar por tipo de operación
    const operationsByType = {};
    let totalUpdateAmount = 0;

    for (const entry of allHistoryEntries) {
      const opType = entry.operation || "unknown";
      if (!operationsByType[opType]) {
        operationsByType[opType] = [];
      }
      operationsByType[opType].push(entry);

      // Verificar operaciones "update" con operationAmount
      if (entry.operation === "update" && entry.operationAmount) {
        totalUpdateAmount += entry.operationAmount || 0;
        const invName =
          entry.investment?.name || entry.investment?.toString() || "Unknown";
        console.log(
          `⚠️ UPDATE con operationAmount: ${invName} - ${entry.operationAmount}€ - ${entry.date.toISOString().split("T")[0]}`,
        );
      }
    }

    console.log(`\nResumen por tipo de operación:`);
    for (const [opType, entries] of Object.entries(operationsByType)) {
      console.log(`  ${opType}: ${entries.length} operaciones`);
    }

    if (totalUpdateAmount > 0) {
      console.log(
        `\n⚠️ ATENCIÓN: Hay ${totalUpdateAmount.toFixed(2)}€ en operationAmount de operaciones "update"`,
      );
      console.log(`   Estas NO deberían contarse como capital añadido.\n`);
    } else {
      console.log(`\n✓ No hay operaciones "update" con operationAmount.\n`);
    }

    // Verificar si hay operaciones "add" a inversiones nuevas
    const investmentsNewThisMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate >= monthStart;
    });

    console.log(`Verificando operaciones "add" a inversiones nuevas:`);
    let addToNewAmount = 0;
    for (const entry of allHistoryEntries) {
      if (entry.operation === "add") {
        const invId =
          entry.investment?.toString() || entry.investment?._id?.toString();
        const isNewInvestment = investmentsNewThisMonth.some(
          (inv) => inv._id.toString() === invId,
        );

        if (isNewInvestment) {
          const amount =
            entry.operationAmount ||
            (entry.operationPrice && entry.quantity
              ? entry.operationPrice * entry.quantity
              : 0);
          if (amount > 0) {
            addToNewAmount += amount;
            const invName = entry.investment?.name || "Unknown";
            console.log(`  ADD a nueva: ${invName} - ${amount.toFixed(2)}€`);
          }
        }
      }
    }

    if (addToNewAmount > 0) {
      console.log(
        `\nTotal ADD a inversiones nuevas: ${addToNewAmount.toFixed(2)}€\n`,
      );
    } else {
      console.log(`  No hay operaciones "add" a inversiones nuevas.\n`);
    }
  } catch (error) {
    console.error("Error:", error);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

checkUpdateOperations();
