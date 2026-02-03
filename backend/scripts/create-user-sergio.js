/**
 * Crea el usuario Sergio (id: sergio, contraseña: Panoli) en la BBDD.
 *
 * Local:          node scripts/create-user-sergio.js
 * Producción:     MONGODB_URI="mongodb+srv://..." node scripts/create-user-sergio.js
 * Railway (CLI):  railway run node scripts/create-user-sergio.js
 */
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

async function createUserSergio() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("Conectado a MongoDB");

    const userId = "sergio";
    const existingUser = await User.findOne({ id: userId });
    if (existingUser) {
      console.log(
        `⚠ El usuario '${userId}' ya existe. Actualizando contraseña...`,
      );
      existingUser.password = await bcrypt.hash("Panoli", 10);
      await existingUser.save();
      console.log("✓ Contraseña actualizada.");
      await mongoose.connection.close();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("Panoli", 10);
    const newUser = new User({
      id: userId,
      name: "Sergio",
      avatar: "👤",
      color: "#3b82f6",
      password: hashedPassword,
    });

    await newUser.save();
    console.log("✓ Usuario 'Sergio' creado correctamente");
    console.log("  ID para login: sergio");
    console.log("  Contraseña: Panoli");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

createUserSergio();
