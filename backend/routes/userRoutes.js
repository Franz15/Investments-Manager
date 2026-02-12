import express from "express";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Middleware: solo administradores (Javier u otros con role=admin)
const requireAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: "Usuario no autenticado" });
    }

    const user = await User.findOne({ id: req.userId });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Asegurar que Javier siempre tenga rol admin
    if (user.id === "javier" && user.role !== "admin") {
      user.role = "admin";
      await user.save();
    }

    if (user.role === "admin" || user.id === "javier") {
      return next();
    }

    return res
      .status(403)
      .json({ message: "No tienes permisos de administrador" });
  } catch (error) {
    console.error("Error en requireAdmin:", error);
    return res.status(500).json({ message: "Error al verificar permisos" });
  }
};

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
      return res.status(404).json({
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

// GET lista de usuarios (solo admin) para panel de gestión de accesos
router.get("/", requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select("id name role permissions")
      .sort({ id: 1 });
    res.json(users);
  } catch (error) {
    console.error("Error al listar usuarios:", error);
    res.status(500).json({ message: "Error al obtener la lista de usuarios" });
  }
});

// PATCH actualizar permisos de un usuario concreto (solo admin)
router.patch("/:userId/permissions", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || typeof permissions !== "object") {
      return res
        .status(400)
        .json({ message: "Permisos inválidos o no proporcionados" });
    }

    const user = await User.findOne({ id: userId });
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Evitar que Javier modifique sus propios permisos/rol desde el panel
    if (user.id === "javier" && req.userId === "javier") {
      return res.status(400).json({
        message:
          "No puedes modificar tus propios permisos de administrador desde este panel.",
      });
    }

    // Solo actualizamos campos conocidos para evitar sorpresas
    user.permissions = {
      ...user.permissions,
      portfolioBuilder:
        typeof permissions.portfolioBuilder === "boolean"
          ? permissions.portfolioBuilder
          : (user.permissions?.portfolioBuilder ?? false),
      canChangePassword:
        typeof permissions.canChangePassword === "boolean"
          ? permissions.canChangePassword
          : (user.permissions?.canChangePassword ?? true),
    };

    // Permitir que se marque explícitamente como admin si se quiere
    if (typeof permissions.role === "string") {
      if (["admin", "user"].includes(permissions.role)) {
        user.role = permissions.role;
      }
    }

    await user.save();

    const safeUser = {
      id: user.id,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    };

    res.json(safeUser);
  } catch (error) {
    console.error("Error al actualizar permisos de usuario:", error);
    res
      .status(500)
      .json({ message: "Error al actualizar permisos del usuario" });
  }
});

// PATCH actualizar idioma del usuario
router.patch("/me/language", async (req, res) => {
  try {
    const { language } = req.body;

    if (!language || !["es", "cat"].includes(language)) {
      return res.status(400).json({
        message: "Idioma no válido. Use 'es' o 'cat'.",
      });
    }

    const user = await User.findOneAndUpdate(
      { id: req.userId },
      { language },
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

// PATCH actualizar color del usuario
router.patch("/me/color", async (req, res) => {
  try {
    const { color } = req.body;

    if (!color || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      return res.status(400).json({
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
      return res.status(400).json({
        message: "Contraseña actual y nueva contraseña son requeridas",
      });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({
        message: "La nueva contraseña debe tener al menos 4 caracteres",
      });
    }

    // Buscar usuario con el campo password incluido
    const user = await User.findOne({ id: req.userId }).select(
      "+password permissions",
    );

    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Comprobar si el usuario tiene permitido cambiar su contraseña
    if (user.permissions && user.permissions.canChangePassword === false) {
      return res.status(403).json({
        message:
          "El cambio de contraseña está deshabilitado para esta cuenta. Contacta con el administrador.",
      });
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

// POST resetear contraseña de un usuario concreto (solo admin)
router.post("/:userId/reset-password", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body || {};

    const user = await User.findOne({ id: userId }).select("+password");
    if (!user) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    const finalPassword =
      typeof newPassword === "string" && newPassword.length >= 4
        ? newPassword
        : Math.random().toString(36).slice(-10);

    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({
      message: "Contraseña reseteada correctamente",
      generatedPassword:
        typeof newPassword === "string" && newPassword.length >= 4
          ? undefined
          : finalPassword,
    });
  } catch (error) {
    console.error("Error al resetear contraseña de usuario:", error);
    res
      .status(500)
      .json({ message: "Error al resetear la contraseña del usuario" });
  }
});

export default router;
