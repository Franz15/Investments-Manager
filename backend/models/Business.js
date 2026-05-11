import mongoose from "mongoose";

const businessSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    type: {
      type: String,
      enum: ["personal", "business"],
      default: "business",
    },
    color: {
      type: String,
      default: "#6B7280",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Índice compuesto para búsquedas eficientes
businessSchema.index({ user: 1, isActive: 1 });

export default mongoose.model("Business", businessSchema);
