import mongoose from "mongoose";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

async function checkWithdrawOperations() {
  try {
    // Conectar a MongoDB
    const mongoUri =
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/investments-manager";
    await mongoose.connect(mongoUri);
    console.log("✅ Conectado a MongoDB\n");

    // Obtener todos los usuarios únicos
    const users = await InvestmentHistory.distinct("user");
    console.log(`📊 Encontrados ${users.length} usuario(s)\n`);

    for (const userId of users) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`👤 Usuario: ${userId}`);
      console.log("=".repeat(80));

      // Buscar todas las operaciones withdraw y sell
      const withdrawOperations = await InvestmentHistory.find({
        user: userId,
        operation: { $in: ["withdraw", "sell"] },
      })
        .populate("investment")
        .sort({ date: 1 });

      if (withdrawOperations.length === 0) {
        console.log("✅ No hay operaciones de retiro/venta\n");
        continue;
      }

      console.log(
        `\n📋 Encontradas ${withdrawOperations.length} operación(es) de retiro/venta:\n`,
      );

      let totalSubtracted = 0;
      const operationsByInvestment = {};

      for (const op of withdrawOperations) {
        const invId =
          op.investment?._id?.toString() || op.investment?.toString() || "N/A";
        const invName = op.investment?.name || "Inversión no encontrada";

        // Calcular el amount
        let amount = op.operationAmount;
        if (!amount || amount === 0) {
          if (op.operationPrice && op.quantity) {
            amount = op.operationPrice * op.quantity;
          }
        }
        amount = Math.abs(amount || 0);
        totalSubtracted += amount;

        // Agrupar por inversión
        if (!operationsByInvestment[invId]) {
          operationsByInvestment[invId] = {
            name: invName,
            operations: [],
            total: 0,
          };
        }
        operationsByInvestment[invId].operations.push({
          date: op.date,
          operation: op.operation,
          amount: amount,
          operationAmount: op.operationAmount,
          operationPrice: op.operationPrice,
          quantity: op.quantity,
          totalValue: op.totalValue,
          notes: op.notes,
        });
        operationsByInvestment[invId].total += amount;

        // Obtener valor actual de la inversión para validación
        const investment = await Investment.findOne({
          _id: invId,
          user: userId,
        });
        let currentValue = 0;
        if (investment) {
          currentValue = investment.isAutomatedPortfolio
            ? investment.currentPrice
            : investment.quantity * investment.currentPrice;
        }

        // Marcar como sospechosa si el amount es muy grande
        const isSuspicious = investment && amount > currentValue * 1.5;

        console.log(
          `  📅 ${op.date.toISOString().split("T")[0]} - ${op.operation.toUpperCase()}`,
        );
        console.log(`     Inversión: ${invName}`);
        console.log(`     Amount calculado: ${amount.toFixed(2)}€`);
        console.log(
          `     operationAmount (BD): ${op.operationAmount || "null/undefined"}`,
        );
        console.log(`     operationPrice: ${op.operationPrice || "null"}`);
        console.log(`     quantity: ${op.quantity || "null"}`);
        console.log(`     totalValue: ${op.totalValue || "null"}`);
        console.log(`     Valor actual inversión: ${currentValue.toFixed(2)}€`);
        if (op.notes) {
          console.log(`     Notas: ${op.notes}`);
        }
        if (isSuspicious) {
          console.log(
            `     ⚠️  SOSPECHOSA: El amount (${amount.toFixed(2)}€) es > 150% del valor actual (${currentValue.toFixed(2)}€)`,
          );
        }
        console.log("");
      }

      console.log("\n📊 Resumen por inversión:");
      console.log("-".repeat(80));
      for (const [invId, data] of Object.entries(operationsByInvestment)) {
        console.log(`\n  ${data.name} (${invId}):`);
        console.log(`    Total restado: ${data.total.toFixed(2)}€`);
        console.log(`    Número de operaciones: ${data.operations.length}`);
        for (const op of data.operations) {
          console.log(
            `      - ${op.date.toISOString().split("T")[0]}: ${op.amount.toFixed(2)}€ (${op.operation})`,
          );
        }
      }

      console.log(
        "\n💰 Total general restado:",
        totalSubtracted.toFixed(2),
        "€",
      );
      console.log("");

      // Obtener todas las inversiones para calcular el capital invertido total
      const allInvestments = await Investment.find({ user: userId });
      const allHistoryEntries = await InvestmentHistory.find({
        user: userId,
        investment: { $in: allInvestments.map((inv) => inv._id) },
      }).sort({ date: 1 });

      let totalInvestedCapital = 0;
      for (const entry of allHistoryEntries) {
        if (entry.operation === "creation" || entry.operation === "add") {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            } else if (entry.totalValue && entry.operation === "creation") {
              amount = entry.totalValue;
            }
          }
          amount = amount || 0;
          if (amount >= 0) {
            totalInvestedCapital += amount;
          }
        } else if (
          entry.operation === "sell" ||
          entry.operation === "withdraw"
        ) {
          let amount = entry.operationAmount;
          if (!amount || amount === 0) {
            if (entry.operationPrice && entry.quantity) {
              amount = entry.operationPrice * entry.quantity;
            }
          }
          amount = Math.abs(amount || 0);
          totalInvestedCapital -= amount;
        }
      }

      let currentValue = 0;
      for (const inv of allInvestments) {
        if (inv.isAutomatedPortfolio) {
          currentValue += inv.currentPrice || 0;
        } else {
          currentValue += (inv.quantity || 0) * (inv.currentPrice || 0);
        }
      }

      const totalReturn = currentValue - totalInvestedCapital;

      console.log("\n📈 Cálculo del rendimiento acumulado:");
      console.log("-".repeat(80));
      console.log(
        `  Capital invertido total: ${totalInvestedCapital.toFixed(2)}€`,
      );
      console.log(`  Valor actual total: ${currentValue.toFixed(2)}€`);
      console.log(
        `  Rendimiento acumulado: ${totalReturn.toFixed(2)}€ (${((totalReturn / totalInvestedCapital) * 100).toFixed(2)}%)`,
      );
      console.log(
        `  Total restado por withdraw/sell: ${totalSubtracted.toFixed(2)}€`,
      );
      console.log("");
    }

    await mongoose.disconnect();
    console.log("\n✅ Desconectado de MongoDB");
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkWithdrawOperations();
