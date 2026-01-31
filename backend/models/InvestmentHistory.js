import mongoose from "mongoose";

const investmentHistorySchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    investment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Investment",
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
    },
    subAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAccount",
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    currentPrice: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    totalValue: {
      type: Number,
      required: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    operation: {
      type: String,
      enum: ["creation", "add", "withdraw", "sell", "update"],
      default: "update",
    },
    // Campos adicionales para operaciones específicas
    operationAmount: {
      type: Number,
      // Monto añadido o retirado en esta operación
    },
    operationPrice: {
      type: Number,
      // Precio de compra/venta en esta operación (para add/withdraw)
    },
    // Diferencias respecto al día anterior
    dailyChangeAmount: {
      type: Number,
      // Diferencia en euros/moneda respecto al día anterior
    },
    dailyChangePercent: {
      type: Number,
      // Diferencia en porcentaje respecto al día anterior
    },
  },
  {
    timestamps: true,
  },
);

// Índice compuesto para búsquedas eficientes por inversión y fecha
investmentHistorySchema.index({ investment: 1, date: -1 });

export default mongoose.model("InvestmentHistory", investmentHistorySchema);
