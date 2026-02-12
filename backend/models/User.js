import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    avatar: {
      type: String,
      default: "👤",
    },
    color: {
      type: String,
      default: "#3b82f6",
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    },
    language: {
      type: String,
      default: "es",
      enum: ["es", "cat"],
    },
    password: {
      type: String,
      required: true,
      select: false, // No incluir por defecto en las consultas
    },
    // Rol básico para control de acceso
    role: {
      type: String,
      enum: ["admin", "user"],
      default: "user",
    },
    // Última fecha de inicio de sesión
    lastLogin: {
      type: Date,
      default: null,
    },
    // Permisos específicos por funcionalidad
    permissions: {
      portfolioBuilder: {
        type: Boolean,
        default: false,
      },
      canChangePassword: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userSchema);
