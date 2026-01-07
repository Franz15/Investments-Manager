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
import SubAccount from "../models/SubAccount.js";
import Debt from "../models/Debt.js";
import DailyVariation from "../models/DailyVariation.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

async function compareBalanceCalculations() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "ana";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`ANÁLISIS DE BALANCE PARA: ${userId}`);
    console.log("=".repeat(80));

    // ===== CÁLCULO DE /stats (Balance Total) =====
    console.log(`\n${"-".repeat(80)}`);
    console.log("CÁLCULO DE /stats (Balance Total):");
    console.log("-".repeat(80));

    // Cash + Savings
    const cashSavingsSubAccounts = await SubAccount.find({
      user: userId,
      type: { $in: ["cash", "savings"] },
    });
    const totalCashSavings = cashSavingsSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );
    console.log(`\n1. Cash + Savings (subcuentas tipo cash/savings):`);
    cashSavingsSubAccounts.forEach((sa) => {
      console.log(`   - ${sa.name}: ${sa.balance.toFixed(2)}€`);
    });
    console.log(`   TOTAL: ${totalCashSavings.toFixed(2)}€`);

    // Investment SubAccounts
    const investmentSubAccounts = await SubAccount.find({
      user: userId,
      type: "investment",
    });
    const totalInvestmentSubAccountBalance = investmentSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );
    console.log(
      `\n2. Subcuentas de inversión (dinero disponible para invertir):`,
    );
    investmentSubAccounts.forEach((sa) => {
      console.log(`   - ${sa.name}: ${sa.balance.toFixed(2)}€`);
    });
    console.log(`   TOTAL: ${totalInvestmentSubAccountBalance.toFixed(2)}€`);

    // Investments
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });
    const totalInvestments = investments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);
    console.log(`\n3. Valor de inversiones:`);
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice
        : inv.quantity * inv.currentPrice;
      console.log(`   - ${inv.name}: ${value.toFixed(2)}€`);
    });
    console.log(`   TOTAL: ${totalInvestments.toFixed(2)}€`);

    // Total según /stats
    const totalBalanceStats =
      totalCashSavings + totalInvestmentSubAccountBalance + totalInvestments;
    console.log(
      `\n✅ BALANCE TOTAL (/stats): ${totalBalanceStats.toFixed(2)}€`,
    );
    console.log(
      `   = Cash/Savings (${totalCashSavings.toFixed(2)}) + Investment SubAccounts (${totalInvestmentSubAccountBalance.toFixed(2)}) + Investments (${totalInvestments.toFixed(2)})`,
    );

    // ===== CÁLCULO DE /balance-daily (Último día) =====
    console.log(`\n${"-".repeat(80)}`);
    console.log("CÁLCULO DE /balance-daily (Último día):");
    console.log("-".repeat(80));

    // Obtener deudas
    const activeDebts = await Debt.find({ user: userId, status: "active" });
    const currentTotalDebts = activeDebts.reduce(
      (sum, debt) => sum + debt.remainingAmount,
      0,
    );
    console.log(`\nDeudas: ${currentTotalDebts.toFixed(2)}€`);

    // Calcular cash del último día (simular el cálculo)
    let lastDayCash = totalCashSavings; // Por ahora usamos el cash actual
    console.log(`\nCash último día: ${lastDayCash.toFixed(2)}€`);

    // Calcular inversiones del último día
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    let lastDayInvestments = 0;
    console.log(`\nValor de inversiones último día:`);

    for (const inv of investments) {
      // Buscar última variación diaria
      const lastVariation = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $lte: today },
      }).sort({ date: -1 });

      // Si no hay variación, buscar en historial
      let invValue = 0;
      if (lastVariation && lastVariation.totalValue) {
        invValue = lastVariation.totalValue;
      } else {
        const lastHistory = await InvestmentHistory.findOne({
          user: userId,
          investment: inv._id,
          date: { $lte: today },
          totalValue: { $exists: true, $ne: null, $gt: 0 },
        }).sort({ date: -1 });

        if (lastHistory && lastHistory.totalValue) {
          invValue = lastHistory.totalValue;
        } else {
          // Calcular desde el modelo
          invValue = inv.isAutomatedPortfolio
            ? inv.currentPrice
            : inv.quantity * inv.currentPrice;
        }
      }

      lastDayInvestments += invValue;
      console.log(`   - ${inv.name}: ${invValue.toFixed(2)}€`);
    }
    console.log(`   TOTAL: ${lastDayInvestments.toFixed(2)}€`);

    // Balance según /balance-daily
    const balanceDaily =
      lastDayCash +
      totalInvestmentSubAccountBalance +
      lastDayInvestments -
      currentTotalDebts;
    console.log(
      `\n❌ BALANCE TOTAL (/balance-daily): ${balanceDaily.toFixed(2)}€`,
    );
    console.log(
      `   = Cash (${lastDayCash.toFixed(2)}) + Investment SubAccounts (${totalInvestmentSubAccountBalance.toFixed(2)}) + Investments (${lastDayInvestments.toFixed(2)}) - Deudas (${currentTotalDebts.toFixed(2)})`,
    );

    // ===== DIFERENCIA =====
    console.log(`\n${"=".repeat(80)}`);
    console.log("DIFERENCIA:");
    console.log("=".repeat(80));
    const difference = totalBalanceStats - balanceDaily;
    console.log(`\nBalance /stats: ${totalBalanceStats.toFixed(2)}€`);
    console.log(`Balance /balance-daily: ${balanceDaily.toFixed(2)}€`);
    console.log(`DIFERENCIA: ${difference.toFixed(2)}€`);

    console.log(`\nDesglose de diferencias:`);
    console.log(
      `  - Cash: ${totalCashSavings.toFixed(2)} vs ${lastDayCash.toFixed(2)} = ${(totalCashSavings - lastDayCash).toFixed(2)}€`,
    );
    console.log(
      `  - Investment SubAccounts: ${totalInvestmentSubAccountBalance.toFixed(2)} vs ${totalInvestmentSubAccountBalance.toFixed(2)} = 0.00€`,
    );
    console.log(
      `  - Investments: ${totalInvestments.toFixed(2)} vs ${lastDayInvestments.toFixed(2)} = ${(totalInvestments - lastDayInvestments).toFixed(2)}€`,
    );
    console.log(
      `  - Deudas: 0.00 vs ${currentTotalDebts.toFixed(2)} = ${(-currentTotalDebts).toFixed(2)}€`,
    );

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

compareBalanceCalculations();
