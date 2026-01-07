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
    password: {
      type: String,
      required: true,
      select: false, // No incluir por defecto en las consultas
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("User", userSchema);
