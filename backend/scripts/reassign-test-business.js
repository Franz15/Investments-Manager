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
import User from "../models/User.js";

async function reassignTestBusiness() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    // Buscar el usuario "test" o "test-dca"
    let testUser = await User.findOne({ id: "test" });
    if (!testUser) {
      testUser = await User.findOne({ id: "test-dca" });
    }
    if (!testUser) {
      // Buscar cualquier usuario que contenga "test" en su ID
      const testUsers = await User.find({ id: /test/i });
      if (testUsers.length > 0) {
        testUser = testUsers[0];
        console.log(`⚠️  No se encontró 'test', usando: ${testUser.id}`);
      }
    }
    if (!testUser) {
      console.error("❌ No se encontró ningún usuario con 'test' en su ID");
      console.log("   Usuarios disponibles:");
      const allUsers = await User.find();
      allUsers.forEach((u) => console.log(`   - ${u.id} (${u.name})`));
      await mongoose.disconnect();
      process.exit(1);
    }

    console.log(
      `👤 Usuario encontrado: ${testUser.name} (ID: ${testUser.id})\n`,
    );

    // Buscar el negocio "Negocio Test" (puede estar asociado a cualquier usuario)
    const business = await Business.findOne({ name: "Negocio Test" });
    if (!business) {
      console.error("❌ No se encontró el negocio 'Negocio Test'");
      await mongoose.disconnect();
      process.exit(1);
    }

    const oldUserId = business.user;
    console.log(`📦 Negocio encontrado: ${business.name}`);
    console.log(`   - Usuario actual: ${oldUserId}`);
    console.log(`   - Nuevo usuario: ${testUser.id}\n`);

    // Actualizar el negocio
    business.user = testUser.id;
    await business.save();
    console.log("✅ Negocio actualizado\n");

    // Actualizar todas las categorías asociadas
    const categories = await Category.find({ business: business._id });
    let updatedCategories = 0;
    for (const category of categories) {
      category.user = testUser.id;
      await category.save();
      updatedCategories++;
    }
    console.log(`✅ ${updatedCategories} categorías actualizadas\n`);

    // Actualizar todas las transacciones asociadas
    const transactions = await Transaction.find({ business: business._id });
    let updatedTransactions = 0;
    for (const transaction of transactions) {
      transaction.user = testUser.id;
      await transaction.save();
      updatedTransactions++;
    }
    console.log(`✅ ${updatedTransactions} transacciones actualizadas\n`);

    // Actualizar todos los presupuestos asociados
    const budgets = await Budget.find({ business: business._id });
    let updatedBudgets = 0;
    for (const budget of budgets) {
      budget.user = testUser.id;
      await budget.save();
      updatedBudgets++;
    }
    console.log(`✅ ${updatedBudgets} presupuestos actualizados\n`);

    // Actualizar todas las previsiones asociadas
    const forecasts = await Forecast.find({ business: business._id });
    let updatedForecasts = 0;
    for (const forecast of forecasts) {
      forecast.user = testUser.id;
      await forecast.save();
      updatedForecasts++;
    }
    console.log(`✅ ${updatedForecasts} previsiones actualizadas\n`);

    console.log("📈 Resumen:");
    console.log(`   - Negocio: ${business.name}`);
    console.log(`   - Usuario anterior: ${oldUserId}`);
    console.log(`   - Usuario nuevo: ${testUser.id}`);
    console.log(`   - Categorías: ${updatedCategories}`);
    console.log(`   - Transacciones: ${updatedTransactions}`);
    console.log(`   - Presupuestos: ${updatedBudgets}`);
    console.log(`   - Previsiones: ${updatedForecasts}`);
    console.log("\n✅ ¡Negocio reasignado exitosamente!");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

reassignTestBusiness();
