import mongoose from "mongoose";

const budgetSchema = new mongoose.Schema(
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
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "EUR",
    },
    period: {
      type: String,
      required: true,
      enum: ["weekly", "monthly", "quarterly", "yearly"],
      default: "monthly",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    notifications: {
      enabled: {
        type: Boolean,
        default: true,
      },
      threshold: {
        type: Number,
        default: 80, // Porcentaje de uso antes de notificar
      },
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null, // null = personal
    },
  },
  {
    timestamps: true,
  },
);

// Índice compuesto para búsquedas eficientes
budgetSchema.index({
  user: 1,
  isActive: 1,
  startDate: 1,
  endDate: 1,
  business: 1,
});

export default mongoose.model("Budget", budgetSchema);
