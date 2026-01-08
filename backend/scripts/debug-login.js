import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function debugLogin() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB\n");

    const testUserId = "javier";
    const testPassword = "admin";

    // Buscar usuario
    const user = await User.findOne({ id: testUserId }).select("+password");

    if (!user) {
      console.log(
        `❌ Usuario "${testUserId}" no encontrado en la base de datos`,
      );
      console.log("\nUsuarios disponibles:");
      const allUsers = await User.find({}).select("id name");
      allUsers.forEach((u) => console.log(`  - ${u.id} (${u.name})`));
      return;
    }

    console.log(`✅ Usuario encontrado: ${user.id} (${user.name})`);
    console.log(`   Avatar: ${user.avatar}`);
    console.log(`   Color: ${user.color}`);

    // Verificar password
    if (!user.password) {
      console.log("\n❌ El usuario NO tiene contraseña configurada");
      console.log("   Ejecuta: node scripts/initialize-passwords.js");
      return;
    }

    console.log(`\n✅ El usuario SÍ tiene contraseña configurada`);
    console.log(
      `   Hash (primeros 30 chars): ${user.password.substring(0, 30)}...`,
    );

    // Intentar comparar la contraseña
    console.log(`\n🔍 Probando contraseña: "${testPassword}"`);
    const isValid = await bcrypt.compare(testPassword, user.password);

    if (isValid) {
      console.log("✅ La contraseña es CORRECTA");
      console.log("\n💡 Si el login sigue fallando, puede ser:");
      console.log("   1. Estás usando una contraseña diferente en el frontend");
      console.log("   2. Hay un problema con el userId que se envía");
      console.log("   3. Hay un problema de CORS o headers");
    } else {
      console.log("❌ La contraseña es INCORRECTA");
      console.log("\n💡 Posibles causas:");
      console.log("   1. La contraseña en la BD no es 'admin'");
      console.log("   2. El hash se corrompió");
      console.log("   3. Se cambió la contraseña manualmente");
      console.log("\n   Solución: Ejecuta de nuevo:");
      console.log("   node scripts/initialize-passwords.js");
    }

    // Generar un nuevo hash para comparar
    const newHash = await bcrypt.hash(testPassword, 10);
    console.log(`\n📝 Nuevo hash generado para "${testPassword}":`);
    console.log(`   ${newHash.substring(0, 30)}...`);
    console.log(
      `\n   Comparación: ${(await bcrypt.compare(testPassword, newHash)) ? "✅ Válido" : "❌ Inválido"}`,
    );
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.connection.close();
    console.log("\nConexión cerrada");
    process.exit(0);
  }
}

debugLogin();
