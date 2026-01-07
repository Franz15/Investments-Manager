import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

// Importar modelos
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";

async function checkInvestmentsDetail() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    // Obtener usuarios únicos
    const users = await Investment.distinct("user");
    console.log(`Usuarios encontrados: ${users.join(", ")}\n`);

    for (const userId of users) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`USUARIO: ${userId}`);
      console.log("=".repeat(80));

      // Obtener todas las inversiones del usuario
      const investments = await Investment.find({
        user: userId,
        account: { $exists: true, $ne: null },
      })
        .populate("account")
        .populate("subAccount")
        .sort({ createdAt: 1 });

      console.log(`\nTotal inversiones: ${investments.length}\n`);

      for (const inv of investments) {
        console.log(`\n${"-".repeat(80)}`);
        console.log(`INVERSIÓN: ${inv.name}`);
        console.log(`ID: ${inv._id}`);
        console.log(
          `Tipo: ${inv.type}${inv.isAutomatedPortfolio ? " (Cartera Automatizada)" : ""}`,
        );
        console.log(`Símbolo: ${inv.symbol || "N/A"}`);
        console.log(`Cuenta: ${inv.account?.name || inv.account || "N/A"}`);
        console.log(
          `Subcuenta: ${inv.subAccount?.name || inv.subAccount || "N/A"}`,
        );

        if (inv.isAutomatedPortfolio) {
          console.log(`Capital inicial: ${inv.quantity?.toFixed(2) || 0}€`);
          console.log(`Valor actual: ${inv.currentPrice?.toFixed(2) || 0}€`);
        } else {
          console.log(`Cantidad: ${inv.quantity || 0} unidades`);
          console.log(
            `Precio de compra: ${inv.purchasePrice?.toFixed(2) || 0}€`,
          );
          console.log(
            `Precio medio: ${inv.averagePurchasePrice?.toFixed(2) || inv.purchasePrice?.toFixed(2) || 0}€`,
          );
          console.log(`Precio actual: ${inv.currentPrice?.toFixed(2) || 0}€`);
          const totalValue = (inv.quantity || 0) * (inv.currentPrice || 0);
          console.log(`Valor total actual: ${totalValue.toFixed(2)}€`);
        }

        // Obtener operaciones de capital
        const capitalOperations = await InvestmentHistory.find({
          user: userId,
          investment: inv._id,
          operation: { $in: ["creation", "add", "withdraw"] },
          operationAmount: { $exists: true, $ne: null },
        }).sort({ date: 1 });

        console.log(`\nOperaciones de capital (${capitalOperations.length}):`);
        if (capitalOperations.length > 0) {
          capitalOperations.forEach((op, idx) => {
            console.log(
              `  ${idx + 1}. ${op.date.toISOString().split("T")[0]} - ${op.operation.toUpperCase()}: ${op.operationAmount.toFixed(2)}€`,
            );
            if (op.notes) console.log(`     Notas: ${op.notes}`);
          });
        } else {
          console.log("  (Sin operaciones de capital registradas)");
        }

        // Obtener primera y última variación diaria
        const [firstVariation, lastVariation] = await Promise.all([
          DailyVariation.findOne({
            user: userId,
            investment: inv._id,
          }).sort({ date: 1 }),
          DailyVariation.findOne({
            user: userId,
            investment: inv._id,
          }).sort({ date: -1 }),
        ]);

        if (firstVariation || lastVariation) {
          console.log(`\nVariaciones diarias:`);
          if (firstVariation) {
            console.log(
              `  Primera: ${firstVariation.date.toISOString().split("T")[0]} - Valor: ${firstVariation.totalValue?.toFixed(2) || 0}€`,
            );
          }
          if (lastVariation) {
            console.log(
              `  Última: ${lastVariation.date.toISOString().split("T")[0]} - Valor: ${lastVariation.totalValue?.toFixed(2) || 0}€`,
            );
          }
          const totalVariations = await DailyVariation.countDocuments({
            user: userId,
            investment: inv._id,
          });
          console.log(`  Total registros: ${totalVariations}`);
        }

        // Obtener entradas de historial con totalValue
        const historyWithValue = await InvestmentHistory.find({
          user: userId,
          investment: inv._id,
          totalValue: { $exists: true, $ne: null, $gt: 0 },
        })
          .sort({ date: -1 })
          .limit(5);

        if (historyWithValue.length > 0) {
          console.log(`\nÚltimas 5 entradas de historial con valor:`);
          historyWithValue.forEach((h, idx) => {
            console.log(
              `  ${idx + 1}. ${h.date.toISOString().split("T")[0]} - Valor: ${h.totalValue.toFixed(2)}€${h.operation ? ` (${h.operation})` : ""}`,
            );
          });
        }
      }

      // Resumen de operaciones de capital
      const allCapitalOps = await InvestmentHistory.find({
        user: userId,
        operation: { $in: ["creation", "add", "withdraw"] },
        operationAmount: { $exists: true, $ne: null },
      }).sort({ date: 1 });

      console.log(`\n${"-".repeat(80)}`);
      console.log(`RESUMEN DE OPERACIONES DE CAPITAL:`);
      console.log(`Total operaciones: ${allCapitalOps.length}`);

      const totalContributions = allCapitalOps
        .filter((op) => op.operation === "creation" || op.operation === "add")
        .reduce((sum, op) => sum + (op.operationAmount || 0), 0);
      const totalWithdrawals = allCapitalOps
        .filter((op) => op.operation === "withdraw")
        .reduce((sum, op) => sum + Math.abs(op.operationAmount || 0), 0);

      console.log(`Total aportaciones: ${totalContributions.toFixed(2)}€`);
      console.log(`Total retiradas: ${totalWithdrawals.toFixed(2)}€`);
      console.log(
        `Neto: ${(totalContributions - totalWithdrawals).toFixed(2)}€`,
      );

      // Resumen de subcuentas
      const subAccounts = await SubAccount.find({
        user: userId,
        type: { $in: ["cash", "savings"] },
      });

      console.log(`\n${"-".repeat(80)}`);
      console.log(`SUBCUENTAS DE EFECTIVO/AHORRO:`);
      console.log(`Total: ${subAccounts.length}`);
      subAccounts.forEach((sa) => {
        console.log(
          `  - ${sa.name} (${sa.type}): ${sa.balance.toFixed(2)}€${sa.initialDate ? ` - Fecha inicial: ${new Date(sa.initialDate).toISOString().split("T")[0]}` : " - Sin fecha inicial"}`,
        );
      });
      const totalCash = subAccounts.reduce((sum, sa) => sum + sa.balance, 0);
      console.log(`Total efectivo: ${totalCash.toFixed(2)}€`);
    }

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkInvestmentsDetail();
