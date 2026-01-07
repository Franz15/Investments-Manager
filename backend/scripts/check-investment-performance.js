import mongoose from "mongoose";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Investment from "../models/Investment.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

async function checkInvestmentPerformance() {
  try {
    // Conectar a MongoDB
    const mongoUri =
      process.env.MONGODB_URI ||
      "mongodb://localhost:27017/investments-manager";
    await mongoose.connect(mongoUri);
    console.log("✅ Conectado a MongoDB\n");

    // Obtener todos los usuarios únicos
    const users = await Investment.distinct("user");
    console.log(`📊 Encontrados ${users.length} usuario(s)\n`);

    for (const userId of users) {
      if (!userId || userId === "null") continue;

      console.log(`\n${"=".repeat(80)}`);
      console.log(`👤 Usuario: ${userId}`);
      console.log("=".repeat(80));

      // Obtener todas las inversiones con sus subcuentas y cuentas
      const investments = await Investment.find({ user: userId })
        .populate({
          path: "subAccount",
          populate: { path: "account" },
        })
        .populate("account")
        .sort({ name: 1 });

      if (investments.length === 0) {
        console.log("✅ No hay inversiones\n");
        continue;
      }

      console.log(`\n📋 Total de inversiones: ${investments.length}\n`);

      // Obtener todas las entradas de historial
      const allHistoryEntries = await InvestmentHistory.find({
        user: userId,
        investment: { $in: investments.map((inv) => inv._id) },
      }).sort({ date: 1 });

      // Calcular rendimiento por inversión
      const investmentPerformance = [];

      for (const inv of investments) {
        const invHistory = allHistoryEntries.filter(
          (entry) =>
            entry.investment?._id?.toString() === inv._id.toString() ||
            entry.investment?.toString() === inv._id.toString(),
        );

        // Calcular capital invertido para esta inversión
        let investedCapital = 0;
        for (const entry of invHistory) {
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
              investedCapital += amount;
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
            investedCapital -= amount;
          }
        }

        // Calcular valor actual
        const currentValue = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);

        const returnAmount = currentValue - investedCapital;
        const returnPercent =
          investedCapital > 0 ? (currentValue / investedCapital - 1) * 100 : 0;

        const subAccountName = inv.subAccount?.name || "Sin subcuenta";
        const accountName = inv.account?.name || "Sin cuenta";

        investmentPerformance.push({
          name: inv.name,
          account: accountName,
          subAccount: subAccountName,
          investedCapital,
          currentValue,
          returnAmount,
          returnPercent,
          investment: inv,
        });
      }

      // Ordenar por pérdida (más negativa primero)
      investmentPerformance.sort((a, b) => a.returnAmount - b.returnAmount);

      console.log("\n📊 Rendimiento por inversión (ordenado por pérdida):");
      console.log("-".repeat(80));
      console.log(
        "Inversión".padEnd(40) +
          "Cuenta".padEnd(20) +
          "Subcuenta".padEnd(20) +
          "Capital".padEnd(15) +
          "Actual".padEnd(15) +
          "Rendimiento",
      );
      console.log("-".repeat(80));

      let totalInvested = 0;
      let totalCurrent = 0;

      for (const perf of investmentPerformance) {
        totalInvested += perf.investedCapital;
        totalCurrent += perf.currentValue;

        const returnStr =
          perf.returnAmount >= 0
            ? `+${perf.returnAmount.toFixed(2)}€ (${perf.returnPercent.toFixed(2)}%)`
            : `${perf.returnAmount.toFixed(2)}€ (${perf.returnPercent.toFixed(2)}%)`;

        console.log(
          perf.name.substring(0, 38).padEnd(40) +
            perf.account.substring(0, 18).padEnd(20) +
            perf.subAccount.substring(0, 18).padEnd(20) +
            perf.investedCapital.toFixed(2).padStart(13) +
            "€" +
            perf.currentValue.toFixed(2).padStart(13) +
            "€" +
            returnStr.padStart(25),
        );
      }

      console.log("-".repeat(80));
      const totalReturn = totalCurrent - totalInvested;
      const totalReturnPercent =
        totalInvested > 0 ? (totalCurrent / totalInvested - 1) * 100 : 0;
      console.log(
        "TOTAL".padEnd(40) +
          "".padEnd(20) +
          "".padEnd(20) +
          totalInvested.toFixed(2).padStart(13) +
          "€" +
          totalCurrent.toFixed(2).padStart(13) +
          "€" +
          (totalReturn >= 0 ? "+" : "") +
          totalReturn.toFixed(2) +
          "€ (" +
          totalReturnPercent.toFixed(2) +
          "%)",
      );

      // Agrupar por subcuenta
      console.log("\n\n📊 Rendimiento por subcuenta:");
      console.log("-".repeat(80));
      const bySubAccount = {};
      for (const perf of investmentPerformance) {
        const key = perf.subAccount || "Sin subcuenta";
        if (!bySubAccount[key]) {
          bySubAccount[key] = {
            subAccount: key,
            account: perf.account,
            investments: [],
            totalInvested: 0,
            totalCurrent: 0,
          };
        }
        bySubAccount[key].investments.push(perf);
        bySubAccount[key].totalInvested += perf.investedCapital;
        bySubAccount[key].totalCurrent += perf.currentValue;
      }

      for (const [key, data] of Object.entries(bySubAccount)) {
        const subReturn = data.totalCurrent - data.totalInvested;
        const subReturnPercent =
          data.totalInvested > 0
            ? (data.totalCurrent / data.totalInvested - 1) * 100
            : 0;
        console.log(`\n${key} (${data.account}):`);
        console.log(`  Capital invertido: ${data.totalInvested.toFixed(2)}€`);
        console.log(`  Valor actual: ${data.totalCurrent.toFixed(2)}€`);
        console.log(
          `  Rendimiento: ${subReturn >= 0 ? "+" : ""}${subReturn.toFixed(2)}€ (${subReturnPercent.toFixed(2)}%)`,
        );
        if (subReturn < -1000) {
          console.log(`  ⚠️  PÉRDIDA SIGNIFICATIVA`);
        }
        for (const inv of data.investments) {
          console.log(
            `    - ${inv.name}: ${inv.returnAmount >= 0 ? "+" : ""}${inv.returnAmount.toFixed(2)}€`,
          );
        }
      }

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

checkInvestmentPerformance();
