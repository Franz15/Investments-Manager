import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/auth/debug - Endpoint temporal de debug
router.get("/debug", async (req, res) => {
  try {
    const User = (await import("../models/User.js")).default;
    const bcrypt = (await import("bcryptjs")).default;

    // Listar todos los usuarios
    const allUsers = await User.find({}).select("id name");

    // Probar con diferentes usuarios
    const testUsers = ["javier", "ana", "test-dca"];
    const testPassword = "admin";

    const results = [];

    for (const testUserId of testUsers) {
      const user = await User.findOne({ id: testUserId }).select("+password");

      if (!user) {
        results.push({
          userId: testUserId,
          found: false,
          message: "Usuario no encontrado",
        });
        continue;
      }

      const isValid = user.password
        ? await bcrypt.compare(testPassword, user.password)
        : false;

      results.push({
        userId: testUserId,
        found: true,
        name: user.name,
        hasPassword: !!user.password,
        passwordValid: isValid,
        message: isValid
          ? "✅ Contraseña 'admin' es CORRECTA"
          : "❌ Contraseña 'admin' es INCORRECTA",
      });
    }

    res.json({
      allUsersInDB: allUsers.map((u) => ({ id: u.id, name: u.name })),
      testResults: results,
      testPassword: testPassword,
    });
  } catch (error) {
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

// POST /api/auth/login - Iniciar sesión
router.post("/login", async (req, res) => {
  try {
    const { userId, password } = req.body;

    // Log para debugging (temporal)
    console.log("[LOGIN] Intento de login:", {
      userId: userId,
      passwordLength: password?.length,
      timestamp: new Date().toISOString(),
    });

    if (!userId || !password) {
      return res
        .status(400)
        .json({ message: "Usuario y contraseña son requeridos" });
    }

    // Buscar usuario con el campo password incluido
    const user = await User.findOne({ id: userId }).select("+password");

    if (!user) {
      console.log("[LOGIN] Usuario no encontrado:", userId);

      // Debug: listar todos los usuarios disponibles
      const allUsers = await User.find({}).select("id name");
      const mongoose = (await import("mongoose")).default;
      const dbName = mongoose.connection.db?.databaseName || "unknown";
      const mongoUri = process.env.MONGODB_URI || "not set";

      console.log(
        "[LOGIN] Usuarios disponibles en BD:",
        allUsers.map((u) => ({ id: u.id, name: u.name })),
      );
      console.log("[LOGIN] Búsqueda realizada con:", {
        id: userId,
        type: typeof userId,
      });
      console.log("[LOGIN] Base de datos:", dbName);
      console.log("[LOGIN] MongoDB URI completa:", mongoUri);

      return res.status(401).json({
        message: "Usuario o contraseña incorrectos",
        debug: {
          searchedUserId: userId,
          availableUsers: allUsers.map((u) => u.id),
          database: dbName,
        },
      });
    }

    console.log("[LOGIN] Usuario encontrado:", {
      id: user.id,
      name: user.name,
      hasPassword: !!user.password,
    });

    // Verificar que el usuario tenga contraseña
    if (!user.password) {
      return res.status(401).json({
        message:
          "Usuario sin contraseña configurada. Ejecuta el script de inicialización: node scripts/initialize-passwords.js",
      });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);

    console.log("[LOGIN] Validación de contraseña:", {
      isValid: isPasswordValid,
      passwordLength: password.length,
    });

    if (!isPasswordValid) {
      console.log("[LOGIN] Contraseña incorrecta para usuario:", userId);
      return res
        .status(401)
        .json({ message: "Usuario o contraseña incorrectos" });
    }

    console.log("[LOGIN] Login exitoso para usuario:", userId);

    // Generar token JWT
    const token = generateToken(user.id);

    // Devolver usuario (sin password) y token
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({
      user: userResponse,
      token,
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ message: "Error interno del servidor" });
  }
});

export default router;
