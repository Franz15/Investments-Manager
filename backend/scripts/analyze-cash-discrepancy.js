import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

// Importar modelos
import SubAccount from "../models/SubAccount.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Transaction from "../models/Transaction.js";

async function analyzeCashDiscrepancy() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "ana";

    console.log(`\n${"=".repeat(80)}`);
    console.log(`ANÁLISIS DE DISCREPANCIA DE CASH PARA: ${userId}`);
    console.log("=".repeat(80));

    // Obtener cash actual
    const cashSubAccounts = await SubAccount.find({
      user: userId,
      type: { $in: ["cash", "savings"] },
    });
    const currentCashBalance = cashSubAccounts.reduce(
      (sum, subAcc) => sum + subAcc.balance,
      0,
    );

    console.log(
      `\n1. CASH ACTUAL (suma de todas las subcuentas cash/savings):`,
    );
    cashSubAccounts.forEach((sa) => {
      console.log(
        `   - ${sa.name}: ${sa.balance.toFixed(2)}€ (initialDate: ${sa.initialDate ? new Date(sa.initialDate).toISOString().split("T")[0] : "N/A"})`,
      );
    });
    console.log(`   TOTAL: ${currentCashBalance.toFixed(2)}€`);

    // Obtener operaciones de capital
    const Investment = (await import("../models/Investment.js")).default;
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });
    const activeInvestmentIds = investments.map((inv) => inv._id);

    const allCapitalOperations = await InvestmentHistory.find({
      user: userId,
      investment: { $in: activeInvestmentIds },
      operation: { $in: ["creation", "add", "withdraw"] },
      operationAmount: { $exists: true, $ne: null },
    }).sort({ date: 1 });

    console.log(`\n2. OPERACIONES DE CAPITAL (aportaciones y retiradas):`);
    let totalContributions = 0;
    let totalWithdrawals = 0;
    allCapitalOperations.forEach((op) => {
      if (op.operation === "creation" || op.operation === "add") {
        totalContributions += op.operationAmount;
        console.log(
          `   - ${new Date(op.date).toISOString().split("T")[0]}: APORTACIÓN ${op.operationAmount.toFixed(2)}€ (${op.operation})`,
        );
      } else if (op.operation === "withdraw") {
        totalWithdrawals += Math.abs(op.operationAmount);
        console.log(
          `   - ${new Date(op.date).toISOString().split("T")[0]}: RETIRADA ${Math.abs(op.operationAmount).toFixed(2)}€`,
        );
      }
    });
    console.log(`   TOTAL APORTACIONES: ${totalContributions.toFixed(2)}€`);
    console.log(`   TOTAL RETIRADAS: ${totalWithdrawals.toFixed(2)}€`);
    console.log(
      `   NETO (aportaciones - retiradas): ${(totalContributions - totalWithdrawals).toFixed(2)}€`,
    );

    // Obtener transacciones
    const allTransactions = await Transaction.find({
      user: userId,
    }).sort({ date: 1 });

    console.log(`\n3. TRANSACCIONES (ingresos y gastos):`);
    let totalIncome = 0;
    let totalExpenses = 0;
    allTransactions.forEach((t) => {
      if (t.type === "income") {
        totalIncome += t.amount;
        console.log(
          `   - ${new Date(t.date).toISOString().split("T")[0]}: INGRESO ${t.amount.toFixed(2)}€`,
        );
      } else if (t.type === "expense") {
        totalExpenses += t.amount;
        console.log(
          `   - ${new Date(t.date).toISOString().split("T")[0]}: GASTO ${t.amount.toFixed(2)}€`,
        );
      }
    });
    console.log(`   TOTAL INGRESOS: ${totalIncome.toFixed(2)}€`);
    console.log(`   TOTAL GASTOS: ${totalExpenses.toFixed(2)}€`);
    console.log(
      `   NETO (ingresos - gastos): ${(totalIncome - totalExpenses).toFixed(2)}€`,
    );

    // Calcular cash esperado según el cálculo histórico
    // Todas las subcuentas tienen initialDate después de startDate, así que initialCash = 0
    const startDate =
      allCapitalOperations.length > 0
        ? new Date(
            Math.min(
              ...allCapitalOperations.map((op) => new Date(op.date).getTime()),
            ),
          )
        : new Date();
    startDate.setHours(0, 0, 0, 0);

    console.log(`\n4. CÁLCULO DEL CASH HISTÓRICO:`);
    console.log(`   Fecha inicio: ${startDate.toISOString().split("T")[0]}`);
    console.log(
      `   Cash inicial (todas las subcuentas tienen initialDate después de startDate): 0.00€`,
    );

    // Aplicar subcuentas en sus fechas
    let calculatedCash = 0;
    const subAccountsWithDate = cashSubAccounts.filter((sa) => sa.initialDate);
    subAccountsWithDate.sort(
      (a, b) => new Date(a.initialDate) - new Date(b.initialDate),
    );

    console.log(`\n   Aplicando subcuentas en sus fechas:`);
    subAccountsWithDate.forEach((sa) => {
      const saDate = new Date(sa.initialDate);
      saDate.setHours(0, 0, 0, 0);
      if (saDate >= startDate) {
        calculatedCash += sa.balance;
        console.log(
          `   - ${saDate.toISOString().split("T")[0]}: +${sa.balance.toFixed(2)}€ (${sa.name}) -> Cash acumulado: ${calculatedCash.toFixed(2)}€`,
        );
      }
    });

    // Restar aportaciones
    console.log(`\n   Restando aportaciones:`);
    allCapitalOperations.forEach((op) => {
      const opDate = new Date(op.date);
      opDate.setHours(0, 0, 0, 0);
      if (opDate >= startDate) {
        if (op.operation === "creation" || op.operation === "add") {
          calculatedCash -= op.operationAmount;
          console.log(
            `   - ${opDate.toISOString().split("T")[0]}: -${op.operationAmount.toFixed(2)}€ (aportación) -> Cash acumulado: ${calculatedCash.toFixed(2)}€`,
          );
        } else if (op.operation === "withdraw") {
          calculatedCash += Math.abs(op.operationAmount);
          console.log(
            `   - ${opDate.toISOString().split("T")[0]}: +${Math.abs(op.operationAmount).toFixed(2)}€ (retirada) -> Cash acumulado: ${calculatedCash.toFixed(2)}€`,
          );
        }
      }
    });

    // Aplicar transacciones
    console.log(`\n   Aplicando transacciones:`);
    allTransactions.forEach((t) => {
      const tDate = new Date(t.date);
      tDate.setHours(0, 0, 0, 0);
      if (tDate >= startDate) {
        if (t.type === "income") {
          calculatedCash += t.amount;
          console.log(
            `   - ${tDate.toISOString().split("T")[0]}: +${t.amount.toFixed(2)}€ (ingreso) -> Cash acumulado: ${calculatedCash.toFixed(2)}€`,
          );
        } else if (t.type === "expense") {
          calculatedCash -= t.amount;
          console.log(
            `   - ${tDate.toISOString().split("T")[0]}: -${t.amount.toFixed(2)}€ (gasto) -> Cash acumulado: ${calculatedCash.toFixed(2)}€`,
          );
        }
      }
    });

    calculatedCash = Math.max(0, calculatedCash);

    console.log(`\n5. COMPARACIÓN:`);
    console.log(
      `   Cash actual (suma de subcuentas): ${currentCashBalance.toFixed(2)}€`,
    );
    console.log(`   Cash calculado día a día: ${calculatedCash.toFixed(2)}€`);
    console.log(
      `   DIFERENCIA: ${(currentCashBalance - calculatedCash).toFixed(2)}€`,
    );

    console.log(`\n6. ANÁLISIS DE LA DIFERENCIA:`);
    const difference = currentCashBalance - calculatedCash;
    if (difference > 0) {
      console.log(`   ⚠️  El cash actual es MAYOR que el calculado día a día.`);
      console.log(
        `   Esto significa que hay ${difference.toFixed(2)}€ en las subcuentas que NO se pueden explicar`,
      );
      console.log(
        `   con las operaciones de capital y transacciones registradas.`,
      );
      console.log(`\n   Posibles causas:`);
      console.log(
        `   1. Hay ingresos o movimientos de dinero que NO están registrados como transacciones`,
      );
      console.log(
        `   2. Hay dinero que entró en las subcuentas pero no hay registro de cómo llegó`,
      );
      console.log(
        `   3. Las fechas de initialDate de las subcuentas no reflejan correctamente cuándo`,
      );
      console.log(`      se registró ese dinero por primera vez`);
      console.log(
        `   4. Hay transferencias entre subcuentas que no están registradas`,
      );
    } else if (difference < 0) {
      console.log(`   ⚠️  El cash actual es MENOR que el calculado día a día.`);
      console.log(
        `   Esto significa que faltan ${Math.abs(difference).toFixed(2)}€ en las subcuentas.`,
      );
    } else {
      console.log(`   ✅ El cash actual coincide con el calculado día a día.`);
    }

    await mongoose.disconnect();
    console.log("\n\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

analyzeCashDiscrepancy();
