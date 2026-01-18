import mongoose from "mongoose";
import dotenv from "dotenv";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import DailyVariation from "../models/DailyVariation.js";

dotenv.config();

async function debugMonthlyReturn(userId) {
  try {
    console.log("=== DEBUG RENDIMIENTO MENSUAL ===\n");

    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({
      user: userId,
      account: { $exists: true, $ne: null },
    });

    console.log(`Total de inversiones: ${investments.length}`);
    console.log("Inversiones:");
    investments.forEach((inv) => {
      const value = inv.isAutomatedPortfolio
        ? inv.currentPrice || 0
        : (inv.quantity || 0) * (inv.currentPrice || 0);
      console.log(
        `  - ${inv.name}: ${value.toFixed(2)}€ (compra: ${inv.purchaseDate})`,
      );
    });

    const totalCurrentValue = investments.reduce((sum, inv) => {
      return (
        sum +
        (inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0))
      );
    }, 0);

    console.log(`\nValor total actual: ${totalCurrentValue.toFixed(2)}€\n`);

    // Calcular mes actual
    const currentDate = new Date();
    const monthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date();
    monthEnd.setHours(23, 59, 59, 999);

    console.log(
      `Mes actual: ${monthStart.toISOString().split("T")[0]} - ${monthEnd.toISOString().split("T")[0]}\n`,
    );

    // 1. Obtener valor al inicio del mes
    console.log("=== VALOR AL INICIO DEL MES ===");

    const lastDayOfPreviousMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    );
    lastDayOfPreviousMonth.setHours(0, 0, 0, 0);
    const lastDayOfPreviousMonthEnd = new Date(lastDayOfPreviousMonth);
    lastDayOfPreviousMonthEnd.setDate(lastDayOfPreviousMonthEnd.getDate() + 1);

    // Filtrar inversiones que existían antes del mes
    const investmentsExistingBeforeMonth = investments.filter((inv) => {
      const purchaseDate = new Date(inv.purchaseDate);
      purchaseDate.setHours(0, 0, 0, 0);
      return purchaseDate < monthStart;
    });

    console.log(
      `Inversiones que existían antes del mes: ${investmentsExistingBeforeMonth.length}`,
    );

    // Calcular monthStartValue - NUEVA LÓGICA CORRECTA
    // Para cada inversión que existía al inicio del mes, buscar su valor más reciente antes del inicio del mes
    console.log("\n=== VALOR AL INICIO DEL MES (NUEVA LÓGICA) ===");
    let monthStartValue = 0;
    for (const inv of investmentsExistingBeforeMonth) {
      // Buscar la variación más reciente de esta inversión antes del inicio del mes
      const lastVariation = await DailyVariation.findOne({
        user: userId,
        investment: inv._id,
        date: { $lt: monthStart },
      })
        .sort({ date: -1 })
        .limit(1);

      if (lastVariation && lastVariation.totalValue) {
        monthStartValue += lastVariation.totalValue;
        console.log(
          `  ${inv.name}: ${lastVariation.totalValue.toFixed(2)}€ (fecha: ${lastVariation.date.toISOString().split("T")[0]})`,
        );
      } else {
        // Si no hay variación histórica, usar el valor actual (aproximación)
        const currentValue = inv.isAutomatedPortfolio
          ? inv.currentPrice || 0
          : (inv.quantity || 0) * (inv.currentPrice || 0);
        monthStartValue += currentValue;
        console.log(
          `  ${inv.name}: ${currentValue.toFixed(2)}€ (aproximación - sin historial)`,
        );
      }
    }

    console.log(
      `\nValor base total al inicio del mes: ${monthStartValue.toFixed(2)}€`,
    );

    // 2. Calcular variaciones del mes
    console.log("\n=== VARIACIONES DEL MES ===");

    const monthVariations = await DailyVariation.find({
      user: userId,
      investment: { $in: investments.map((inv) => inv._id) },
      date: { $gte: monthStart, $lte: monthEnd },
    }).sort({ date: 1 });

    console.log(
      `Encontradas ${monthVariations.length} variaciones durante el mes:`,
    );

    let monthlyReturn = 0;
    monthVariations.forEach((v) => {
      console.log(
        `  - ${v.date.toISOString().split("T")[0]} ${v.investment}: ${v.changeAmount?.toFixed(2)}€`,
      );
      if (v.changeAmount !== null && v.changeAmount !== undefined) {
        monthlyReturn += v.changeAmount;
      }
    });

    console.log(`\nTotal variaciones del mes: ${monthlyReturn.toFixed(2)}€`);

    // 3. Calcular porcentaje
    const monthlyReturnPercent =
      monthStartValue > 0 ? (monthlyReturn / monthStartValue) * 100 : 0;

    console.log("\n=== RESULTADO FINAL ===");
    console.log(`Valor base: ${monthStartValue.toFixed(2)}€`);
    console.log(`Variación total: ${monthlyReturn.toFixed(2)}€`);
    console.log(`Porcentaje: ${monthlyReturnPercent.toFixed(2)}%`);
  } catch (error) {
    console.error("Error en debug:", error);
  }
}

// Función para ejecutar desde otros scripts
export async function runDebug(userId) {
  await debugMonthlyReturn(userId);
}

// Ejecutar si se llama directamente
if (process.argv[1].includes("debug-monthly-return.js")) {
  // Conectar a MongoDB directamente como en otros scripts
  const MONGODB_URI =
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

  mongoose
    .connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    })
    .then(async () => {
      console.log("Conectado a MongoDB\n");

      const userId = process.argv[2];
      if (!userId) {
        console.error("Uso: node debug-monthly-return.js <userId>");
        process.exit(1);
      }

      await debugMonthlyReturn(userId);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error conectando a la base de datos:", error);
      process.exit(1);
    });
}

export { debugMonthlyReturn };
