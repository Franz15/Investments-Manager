import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
const DEFAULT_PASSWORD = "admin";

const usersToInitialize = [
  { id: "javier", name: "Javier", avatar: "👨", color: "#3b82f6" },
  { id: "ana", name: "Ana", avatar: "👩", color: "#ec4899" },
  { id: "test-dca", name: "Test DCA", avatar: "🧪", color: "#10b981" },
];

async function fixUsersAndPasswords() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB\n");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Eliminar índices problemáticos si existen
    try {
      await usersCollection.dropIndex("email_1");
      console.log("✓ Índice email_1 eliminado");
    } catch (error) {
      if (error.codeName === "IndexNotFound") {
        console.log("ℹ Índice email_1 no existe");
      } else {
        console.warn("⚠ No se pudo eliminar índice email_1:", error.message);
      }
    }

    try {
      await usersCollection.dropIndex("isActive_1");
      console.log("✓ Índice isActive_1 eliminado");
    } catch (error) {
      if (error.codeName === "IndexNotFound") {
        console.log("ℹ Índice isActive_1 no existe");
      } else {
        console.warn("⚠ No se pudo eliminar índice isActive_1:", error.message);
      }
    }

    // Hashear la contraseña por defecto
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);
    console.log(
      `\nContraseña hasheada: ${hashedPassword.substring(0, 20)}...\n`,
    );

    // Inicializar usuarios
    for (const userData of usersToInitialize) {
      try {
        // Verificar si el usuario existe
        const existingUser = await usersCollection.findOne({ id: userData.id });

        if (existingUser) {
          // Actualizar contraseña si existe
          await usersCollection.updateOne(
            { id: userData.id },
            { $set: { password: hashedPassword } },
          );
          console.log(`✓ Contraseña actualizada para usuario: ${userData.id}`);
        } else {
          // Crear nuevo usuario
          await usersCollection.insertOne({
            id: userData.id,
            name: userData.name,
            avatar: userData.avatar,
            color: userData.color,
            password: hashedPassword,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`✓ Usuario creado: ${userData.id}`);
        }
      } catch (error) {
        console.error(
          `✗ Error procesando usuario ${userData.id}:`,
          error.message,
        );
      }
    }

    console.log(
      '\n✓ Proceso completado. Todos los usuarios tienen la contraseña "admin"',
    );
    console.log(
      "⚠️ IMPORTANTE: Cambia las contraseñas desde el perfil de usuario después del primer inicio de sesión.",
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\nConexión cerrada");
    process.exit(0);
  }
}

fixUsersAndPasswords();
