/**
 * Lee de la BBDD los datos de Ana que usa la gráfica "Evolución del Patrimonio Total"
 * (balance-daily): subcuentas cash/savings y transacciones de ingreso/gasto.
 * Así se ve por qué pueden "faltar" 100k en la gráfica (initialDate, transacciones, etc.).
 *
 * Uso: node scripts/debug-ana-balance-chart.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import SubAccount from "../models/SubAccount.js";
import Transaction from "../models/Transaction.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

function getLocalDateKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

async function main() {
  const userId = "ana";
  const uri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
  await mongoose.connect(uri);
  console.log("Conectado a MongoDB\n");

  console.log(
    "=== DATOS DE ANA PARA LA GRÁFICA EVOLUCIÓN DEL PATRIMONIO TOTAL ===\n",
  );

  // 1) Subcuentas cash/savings
  const cashSubAccounts = await SubAccount.find({
    user: userId,
    type: { $in: ["cash", "savings"] },
  })
    .select("name balance initialDate type")
    .lean();

  const totalCash = cashSubAccounts.reduce((sum, sa) => sum + sa.balance, 0);

  console.log("1. SUBCUENTAS DE EFECTIVO (cash/savings)");
  console.log(
    "   (La gráfica usa initialDate para saber en qué día sumar el balance)\n",
  );
  if (cashSubAccounts.length === 0) {
    console.log("   (ninguna)\n");
  } else {
    cashSubAccounts.forEach((sa) => {
      const initialStr = sa.initialDate
        ? getLocalDateKey(sa.initialDate) + " (local)"
        : "NO TIENE → el backend lo trata como efectivo desde el primer día";
      console.log(
        `   - ${sa.name} (${sa.type}): ${sa.balance.toFixed(2)} €  |  initialDate: ${initialStr}`,
      );
    });
    console.log(`   TOTAL EFECTIVO: ${totalCash.toFixed(2)} €\n`);
  }

  // 2) Transacciones (ingresos y gastos) — la gráfica las aplica el día de la fecha
  const transactions = await Transaction.find({ user: userId })
    .sort({ date: 1 })
    .select("date type amount description")
    .lean();

  const incomes = transactions.filter((t) => t.type === "income");
  const expenses = transactions.filter((t) => t.type === "expense");
  const totalIncome = incomes.reduce((sum, t) => sum + t.amount, 0);
  const totalExpense = expenses.reduce((sum, t) => sum + t.amount, 0);

  console.log("2. TRANSACCIONES (ingresos / gastos)");
  console.log("   (Cada una se aplica en su fecha en la gráfica)\n");
  if (incomes.length > 0) {
    console.log("   Ingresos:");
    incomes.forEach((t) => {
      console.log(
        `   - ${getLocalDateKey(t.date)}  +${t.amount.toFixed(2)} €  ${t.description || ""}`,
      );
    });
    console.log(`   Suma ingresos: ${totalIncome.toFixed(2)} €\n`);
  }
  if (expenses.length > 0) {
    console.log("   Gastos:");
    expenses.forEach((t) => {
      console.log(
        `   - ${getLocalDateKey(t.date)}  -${t.amount.toFixed(2)} €  ${t.description || ""}`,
      );
    });
    console.log(`   Suma gastos: ${totalExpense.toFixed(2)} €\n`);
  }
  if (transactions.length === 0) {
    console.log("   (ninguna)\n");
  }

  // 3) Rango de fechas que usa balance-daily (primera operación de capital o transacción hasta hoy)
  const investments = await Investment.find({
    user: userId,
    $or: [
      { account: { $exists: true, $ne: null } },
      { "allocations.0": { $exists: true } },
    ],
  }).lean();
  const activeIds = investments.map((inv) => inv._id);

  const capitalOps = await InvestmentHistory.find({
    user: userId,
    investment: { $in: activeIds },
    operation: { $in: ["creation", "add", "withdraw", "sell"] },
  })
    .sort({ date: 1 })
    .select("date")
    .lean();

  const allDates = [
    ...capitalOps.map((op) => new Date(op.date)),
    ...transactions.map((t) => new Date(t.date)),
  ];
  const startDate = allDates.length
    ? new Date(Math.min(...allDates.map((d) => d.getTime())))
    : null;
  const todayKey = getLocalDateKey(new Date());

  console.log("3. RANGO DE LA GRÁFICA");
  if (startDate) {
    console.log(`   Primera fecha (startDate): ${getLocalDateKey(startDate)}`);
    console.log(`   Última fecha (hoy):         ${todayKey}`);
    console.log("");
    // Comprobar si alguna subcuenta con initialDate cae fuera o justo en el borde
    cashSubAccounts.forEach((sa) => {
      if (sa.initialDate) {
        const key = getLocalDateKey(sa.initialDate);
        const ok = key >= getLocalDateKey(startDate) && key <= todayKey;
        console.log(
          `   Subcuenta "${sa.name}" (${sa.balance.toFixed(0)} €) initialDate=${key} → ${ok ? "DENTRO del rango" : "FUERA o en el borde del rango"}`,
        );
      }
    });
  } else {
    console.log(
      "   (no hay operaciones ni transacciones, la gráfica puede estar vacía)",
    );
  }

  console.log("\n=== FIN ===\n");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
