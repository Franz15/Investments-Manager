import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

// Importar modelos
import Business from "../models/Business.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Budget from "../models/Budget.js";
import Forecast from "../models/Forecast.js";
import SubAccount from "../models/SubAccount.js";
import User from "../models/User.js";

async function createTestBusiness() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    // Obtener el primer usuario disponible
    const users = await User.find();
    if (users.length === 0) {
      console.error("❌ No hay usuarios en la base de datos");
      await mongoose.disconnect();
      process.exit(1);
    }

    // El campo 'user' en los modelos es el campo 'id' del User (String), no el _id
    const userId = users[0].id;
    console.log(`👤 Usuario: ${users[0].name || userId} (ID: ${userId})\n`);

    // Obtener o crear una subcuenta para las transacciones
    let subAccount = await SubAccount.findOne({ user: userId });

    if (!subAccount) {
      console.log("💳 No hay subcuentas. Creando una subcuenta de prueba...");
      // Buscar o crear una cuenta
      const Account = (await import("../models/Account.js")).default;
      let account = await Account.findOne({ user: userId });

      if (!account) {
        account = new Account({
          user: userId,
          name: "Cuenta Test",
          bankName: "Banco Test",
        });
        await account.save();
        console.log(`   ✅ Cuenta creada: ${account.name}`);
      }

      subAccount = new SubAccount({
        user: userId,
        account: account._id,
        name: "Efectivo Test",
        type: "cash",
        balance: 10000,
        currency: "EUR",
      });
      await subAccount.save();
      console.log(`   ✅ Subcuenta creada: ${subAccount.name}\n`);
    } else {
      console.log(`💳 Usando subcuenta existente: ${subAccount.name}\n`);
    }

    // 1. Crear negocio de prueba
    console.log("📦 Creando negocio de prueba...");
    let business = await Business.findOne({
      user: userId,
      name: "Negocio Test",
    });

    if (business) {
      console.log(
        "⚠️  El negocio 'Negocio Test' ya existe. Eliminando datos anteriores...",
      );
      // Eliminar datos relacionados
      await Transaction.deleteMany({ user: userId, business: business._id });
      await Budget.deleteMany({ user: userId, business: business._id });
      await Forecast.deleteMany({ user: userId, business: business._id });
      await Category.deleteMany({ user: userId, business: business._id });
      await Business.findByIdAndDelete(business._id);
    }

    business = new Business({
      user: userId,
      name: "Negocio Test",
      description: "Negocio de prueba con datos mockeados",
      type: "business",
      color: "#3B82F6",
      isActive: true,
    });
    await business.save();
    console.log(`✅ Negocio creado: ${business.name} (ID: ${business._id})\n`);

    // 2. Crear categorías para el negocio
    console.log("📁 Creando categorías...");
    const categories = [
      {
        user: userId,
        name: "Ventas",
        type: "income",
        color: "#10B981",
        business: business._id,
      },
      {
        user: userId,
        name: "Servicios",
        type: "income",
        color: "#059669",
        business: business._id,
      },
      {
        user: userId,
        name: "Alquiler",
        type: "expense",
        color: "#EF4444",
        business: business._id,
      },
      {
        user: userId,
        name: "Nóminas",
        type: "expense",
        color: "#DC2626",
        business: business._id,
      },
      {
        user: userId,
        name: "Suministros",
        type: "expense",
        color: "#F59E0B",
        business: business._id,
      },
      {
        user: userId,
        name: "Marketing",
        type: "expense",
        color: "#8B5CF6",
        business: business._id,
      },
    ];

    const createdCategories = [];
    for (const catData of categories) {
      const category = new Category(catData);
      await category.save();
      createdCategories.push(category);
      console.log(`   ✅ ${category.name} (${category.type})`);
    }
    console.log("");

    // 3. Crear transacciones mockeadas (últimos 3 meses)
    console.log("💰 Creando transacciones mockeadas...");
    const now = new Date();
    const transactions = [];

    // Ingresos mensuales
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 15);

      // Ventas principales
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "income",
        category: createdCategories.find((c) => c.name === "Ventas").name,
        amount: 5000 + Math.random() * 2000,
        currency: "EUR",
        description: `Ventas del mes ${monthDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })}`,
        date: monthDate,
        business: business._id,
      });

      // Servicios
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "income",
        category: createdCategories.find((c) => c.name === "Servicios").name,
        amount: 1500 + Math.random() * 500,
        currency: "EUR",
        description: `Servicios consultoría`,
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 20),
        business: business._id,
      });
    }

    // Gastos mensuales
    for (let month = 0; month < 3; month++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - month, 1);

      // Alquiler
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "expense",
        category: createdCategories.find((c) => c.name === "Alquiler").name,
        amount: 1200,
        currency: "EUR",
        description: "Alquiler oficina",
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 1),
        business: business._id,
      });

      // Nóminas (2 empleados)
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "expense",
        category: createdCategories.find((c) => c.name === "Nóminas").name,
        amount: 2500,
        currency: "EUR",
        description: "Nómina empleado 1",
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 5),
        business: business._id,
      });

      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "expense",
        category: createdCategories.find((c) => c.name === "Nóminas").name,
        amount: 2200,
        currency: "EUR",
        description: "Nómina empleado 2",
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 5),
        business: business._id,
      });

      // Suministros
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "expense",
        category: createdCategories.find((c) => c.name === "Suministros").name,
        amount: 300 + Math.random() * 100,
        currency: "EUR",
        description: "Luz, agua, internet",
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 10),
        business: business._id,
      });

      // Marketing
      transactions.push({
        user: userId,
        subAccount: subAccount._id,
        type: "expense",
        category: createdCategories.find((c) => c.name === "Marketing").name,
        amount: 500 + Math.random() * 200,
        currency: "EUR",
        description: "Campaña publicitaria",
        date: new Date(monthDate.getFullYear(), monthDate.getMonth(), 12),
        business: business._id,
      });
    }

    // Crear transacciones
    for (const transData of transactions) {
      const transaction = new Transaction(transData);
      await transaction.save();
    }
    console.log(`   ✅ ${transactions.length} transacciones creadas\n`);

    // 4. Crear presupuestos
    console.log("📊 Creando presupuestos...");
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const budgets = [
      {
        user: userId,
        name: "Presupuesto Alquiler",
        category: createdCategories.find((c) => c.name === "Alquiler")._id,
        amount: 1200,
        currency: "EUR",
        period: "monthly",
        startDate: startOfMonth,
        endDate: endOfMonth,
        business: business._id,
        isActive: true,
      },
      {
        user: userId,
        name: "Presupuesto Nóminas",
        category: createdCategories.find((c) => c.name === "Nóminas")._id,
        amount: 5000,
        currency: "EUR",
        period: "monthly",
        startDate: startOfMonth,
        endDate: endOfMonth,
        business: business._id,
        isActive: true,
      },
      {
        user: userId,
        name: "Presupuesto Marketing",
        category: createdCategories.find((c) => c.name === "Marketing")._id,
        amount: 800,
        currency: "EUR",
        period: "monthly",
        startDate: startOfMonth,
        endDate: endOfMonth,
        business: business._id,
        isActive: true,
      },
    ];

    for (const budgetData of budgets) {
      const budget = new Budget(budgetData);
      await budget.save();
      console.log(`   ✅ ${budget.name}: ${budget.amount}€/${budget.period}`);
    }
    console.log("");

    // 5. Crear previsiones
    console.log("🔮 Creando previsiones...");
    const forecasts = [
      {
        user: userId,
        name: "Ventas mensuales",
        type: "income",
        category: createdCategories.find((c) => c.name === "Ventas")._id,
        amount: 6000,
        currency: "EUR",
        frequency: "monthly",
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        business: business._id,
        isActive: true,
      },
      {
        user: userId,
        name: "Servicios consultoría",
        type: "income",
        category: createdCategories.find((c) => c.name === "Servicios")._id,
        amount: 1500,
        currency: "EUR",
        frequency: "monthly",
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        business: business._id,
        isActive: true,
      },
      {
        user: userId,
        name: "Alquiler mensual",
        type: "expense",
        category: createdCategories.find((c) => c.name === "Alquiler")._id,
        amount: 1200,
        currency: "EUR",
        frequency: "monthly",
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        business: business._id,
        isActive: true,
      },
      {
        user: userId,
        name: "Nóminas mensuales",
        type: "expense",
        category: createdCategories.find((c) => c.name === "Nóminas")._id,
        amount: 4700,
        currency: "EUR",
        frequency: "monthly",
        startDate: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        business: business._id,
        isActive: true,
      },
    ];

    for (const forecastData of forecasts) {
      const forecast = new Forecast(forecastData);
      await forecast.save();
      console.log(
        `   ✅ ${forecast.name}: ${forecast.amount}€/${forecast.frequency}`,
      );
    }
    console.log("");

    // Resumen
    console.log("📈 Resumen del negocio creado:");
    console.log(`   - Negocio: ${business.name}`);
    console.log(`   - Categorías: ${createdCategories.length}`);
    console.log(`   - Transacciones: ${transactions.length}`);
    console.log(`   - Presupuestos: ${budgets.length}`);
    console.log(`   - Previsiones: ${forecasts.length}`);
    console.log("\n✅ ¡Negocio de prueba creado exitosamente!");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createTestBusiness();
