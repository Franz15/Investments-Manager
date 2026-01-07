import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// GET obtener información del usuario actual
router.get("/me", async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Verificar que MongoDB esté conectado
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState !== 1) {
      console.error(
        "MongoDB not connected. ReadyState:",
        mongoose.connection.readyState,
      );
      return res.status(503).json({ message: "Database not available" });
    }

    // Buscar usuario (no crear si no existe, debe estar autenticado)
    const user = await User.findOne({ id: req.userId });

    if (!user) {
      return res
        .status(404)
        .json({
          message: "Usuario no encontrado. Debe iniciar sesión primero.",
        });
    }

    res.json(user);
  } catch (error) {
    console.error("Error in /users/me:", error);
    console.error("Error name:", error.name);
    console.error("Error message:", error.message);
    if (error.stack) {
      console.error("Error stack:", error.stack);
    }
    res.status(500).json({
      message: error.message || "Internal server error",
      error: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

// PATCH actualizar color del usuario
router.patch("/me/color", async (req, res) => {
  try {
    const { color } = req.body;

    if (!color || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      return res
        .status(400)
        .json({
          message:
            "Color inválido. Debe ser un código hexadecimal válido (ej: #3b82f6)",
        });
    }

    const user = await User.findOneAndUpdate(
      { id: req.userId },
      { color },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH cambiar contraseña del usuario
router.patch("/me/password", async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({
          message: "Contraseña actual y nueva contraseña son requeridas",
        });
    }

    if (newPassword.length < 4) {
      return res
        .status(400)
        .json({
          message: "La nueva contraseña debe tener al menos 4 caracteres",
        });
    }

    // Buscar usuario con el campo password incluido
    const user = await User.findOne({ id: req.userId }).select("+password");

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificar contraseña actual
    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isPasswordValid) {
      return res.status(401).json({ message: "Contraseña actual incorrecta" });
    }

    // Hashear nueva contraseña
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña
    user.password = hashedPassword;
    await user.save();

    res.json({ message: "Contraseña actualizada correctamente" });
  } catch (error) {
    console.error("Error al cambiar contraseña:", error);
    res.status(500).json({ message: "Error al cambiar la contraseña" });
  }
});

export default router;
