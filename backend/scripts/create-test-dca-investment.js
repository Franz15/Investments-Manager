import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cargar variables de entorno
dotenv.config({ path: join(__dirname, "../.env") });

// Importar modelos
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Investment from "../models/Investment.js";

async function createTestDCAInvestment() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Conectado a MongoDB\n");

    const userId = "test-dca"; // Usuario de prueba
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Crear cuenta de prueba
    let testAccount = await Account.findOne({
      user: userId,
      name: "Cuenta Prueba DCA",
    });

    if (!testAccount) {
      testAccount = new Account({
        user: userId,
        name: "Cuenta Prueba DCA",
        bankName: "Banco de Prueba",
        accountNumber: "TEST-DCA-001",
        currency: "EUR",
        description: "Cuenta de prueba para testing de DCA",
        color: "#10b981", // Verde
        isActive: true,
      });
      await testAccount.save();
      console.log("✅ Cuenta de prueba creada:", testAccount.name);
    } else {
      console.log("ℹ️  Cuenta de prueba ya existe:", testAccount.name);
    }

    // Crear subcuenta de inversión
    let testSubAccount = await SubAccount.findOne({
      user: userId,
      account: testAccount._id,
      name: "Subcuenta DCA Test",
    });

    if (!testSubAccount) {
      testSubAccount = new SubAccount({
        user: userId,
        account: testAccount._id,
        name: "Subcuenta DCA Test",
        type: "investment",
        balance: 10000, // Balance inicial de 10,000€
        currency: "EUR",
        description: "Subcuenta para testing de DCA",
        isActive: true,
      });
      await testSubAccount.save();
      console.log("✅ Subcuenta de prueba creada:", testSubAccount.name);
    } else {
      console.log("ℹ️  Subcuenta de prueba ya existe:", testSubAccount.name);
    }

    // Crear inversión con DCA habilitado
    let testInvestment = await Investment.findOne({
      user: userId,
      account: testAccount._id,
      name: "Inversión DCA Test",
    });

    if (!testInvestment) {
      testInvestment = new Investment({
        user: userId,
        account: testAccount._id,
        subAccount: testSubAccount._id,
        name: "Inversión DCA Test",
        type: "stock",
        symbol: "AAPL",
        autoUpdate: true,
        quantity: 10,
        purchasePrice: 150.0,
        averagePurchasePrice: 150.0,
        currentPrice: 155.0,
        purchaseDate: new Date("2024-01-01"),
        currency: "EUR",
        assetClass: "variable_income",
        fixedIncomePercentage: 0,
        variableIncomePercentage: 100,
        notes: "Inversión de prueba para testing de DCA",
        // Configuración DCA
        dcaEnabled: true,
        dcaAmount: 500, // 500€ cada mes
        dcaFrequency: "monthly",
        dcaStartDate: new Date("2024-01-15"),
        dcaNextDate: tomorrow, // Próxima compra mañana
        // Sin fecha de fin (DCA indefinido)
      });
      await testInvestment.save();
      console.log("✅ Inversión con DCA creada:", testInvestment.name);
      console.log("   - Cantidad DCA:", testInvestment.dcaAmount, "€");
      console.log("   - Frecuencia:", testInvestment.dcaFrequency);
      console.log(
        "   - Próxima compra:",
        testInvestment.dcaNextDate.toLocaleDateString("es-ES"),
      );
    } else {
      // Actualizar la inversión existente para asegurar que tiene DCA configurado
      testInvestment.dcaEnabled = true;
      testInvestment.dcaAmount = 500;
      testInvestment.dcaFrequency = "monthly";
      testInvestment.dcaStartDate = new Date("2024-01-15");
      testInvestment.dcaNextDate = tomorrow;
      await testInvestment.save();
      console.log("✅ Inversión con DCA actualizada:", testInvestment.name);
      console.log("   - Cantidad DCA:", testInvestment.dcaAmount, "€");
      console.log("   - Frecuencia:", testInvestment.dcaFrequency);
      console.log(
        "   - Próxima compra:",
        testInvestment.dcaNextDate.toLocaleDateString("es-ES"),
      );
    }

    console.log("\n✅ Datos de prueba creados exitosamente!");
    console.log("\nPara probar el DCA, puedes:");
    console.log("1. Ejecutar el endpoint POST /api/investments/execute-dca");
    console.log(
      "2. O esperar hasta mañana para que se ejecute automáticamente",
    );
    console.log(
      "\nLa inversión está configurada para comprar 500€ mensualmente.",
    );

    await mongoose.disconnect();
    console.log("\nDesconectado de MongoDB");
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

createTestDCAInvestment();
