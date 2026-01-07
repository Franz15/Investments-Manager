import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
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
    type: {
      type: String,
      required: true,
      enum: ["income", "expense"],
    },
    color: {
      type: String,
      default: "#6B7280",
    },
    icon: {
      type: String,
      trim: true,
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null, // null = personal o compartida
    },
  },
  {
    timestamps: true,
  },
);

// Índice compuesto para búsquedas rápidas
categorySchema.index({ user: 1, type: 1, isActive: 1, business: 1 });

export default mongoose.model("Category", categorySchema);
