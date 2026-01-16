import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
const DEFAULT_PASSWORD = "admin";

async function createUserCelia() {
  try {
    // Conectar a MongoDB
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB");

    // Verificar si el usuario ya existe
    const existingUser = await User.findOne({ id: "celia" });
    if (existingUser) {
      console.log("⚠ El usuario 'celia' ya existe en la base de datos.");
      console.log(`  Nombre: ${existingUser.name}`);
      console.log(`  Avatar: ${existingUser.avatar}`);
      console.log(`  Color: ${existingUser.color}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    // Hashear la contraseña por defecto
    const hashedPassword = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // Crear el nuevo usuario
    const newUser = new User({
      id: "celia",
      name: "Cèlia",
      avatar: "👩",
      color: "#8b5cf6", // Color púrpura
      password: hashedPassword,
    });

    await newUser.save();
    console.log("✓ Usuario 'Cèlia' creado exitosamente");
    console.log(`  ID: celia`);
    console.log(`  Nombre: Cèlia`);
    console.log(`  Avatar: 👩`);
    console.log(`  Color: #8b5cf6`);
    console.log(`  Contraseña por defecto: ${DEFAULT_PASSWORD}`);
    console.log(
      "\n⚠️ IMPORTANTE: Cambia la contraseña desde el perfil de usuario después del primer inicio de sesión.",
    );
  } catch (error) {
    console.error("Error al crear usuario:", error);
    if (error.code === 11000) {
      console.error("El usuario 'celia' ya existe en la base de datos.");
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\nConexión cerrada");
    process.exit(0);
  }
}

createUserCelia();
