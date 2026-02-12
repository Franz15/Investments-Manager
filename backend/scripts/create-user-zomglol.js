import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "../models/User.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";
const PASSWORD = "%RUuXI05p6MkMBadg$a7NWYKVh0D#4cV6RGqxrM2";

async function createUserZomglol() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("Conectado a MongoDB");

    const existingUser = await User.findOne({ id: "zomglol" });
    if (existingUser) {
      console.log("⚠ El usuario 'zomglol' ya existe en la base de datos.");
      console.log(`  Nombre: ${existingUser.name}`);
      console.log(`  Avatar: ${existingUser.avatar}`);
      console.log(`  Color: ${existingUser.color}`);
      await mongoose.connection.close();
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);

    const newUser = new User({
      id: "zomglol",
      name: "Zomglol",
      avatar: "👤",
      color: "#3b82f6",
      password: hashedPassword,
      role: "user",
    });

    await newUser.save();
    console.log("✓ Usuario 'zomglol' creado exitosamente");
    console.log(`  ID: zomglol`);
    console.log(`  Nombre: Zomglol`);
    console.log(`  Avatar: 👤`);
    console.log(`  Color: #3b82f6`);
  } catch (error) {
    console.error("Error al crear usuario:", error);
    if (error.code === 11000) {
      console.error("El usuario 'zomglol' ya existe en la base de datos.");
    }
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("\nConexión cerrada");
    process.exit(0);
  }
}

createUserZomglol();
