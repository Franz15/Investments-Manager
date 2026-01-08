import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/auth/debug - Endpoint temporal de debug
router.get("/debug", async (req, res) => {
  try {
    const User = (await import("../models/User.js")).default;
    const user = await User.findOne({ id: "javier" }).select("+password");

    if (!user) {
      return res.json({
        error: "Usuario javier no encontrado",
        users: await User.find({}).select("id name"),
      });
    }

    const bcrypt = (await import("bcryptjs")).default;
    const testPassword = "admin";
    const isValid = await bcrypt.compare(testPassword, user.password);

    res.json({
      user: {
        id: user.id,
        name: user.name,
        hasPassword: !!user.password,
        passwordHashPreview: user.password
          ? user.password.substring(0, 30) + "..."
          : null,
      },
      testPassword: testPassword,
      passwordValid: isValid,
      message: isValid
        ? "✅ La contraseña 'admin' es CORRECTA"
        : "❌ La contraseña 'admin' es INCORRECTA",
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
      return res
        .status(401)
        .json({ message: "Usuario o contraseña incorrectos" });
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
