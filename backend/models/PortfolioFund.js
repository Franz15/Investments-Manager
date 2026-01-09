import mongoose from "mongoose";

const portfolioFundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isin: {
      type: String,
      trim: true,
    },
    link: {
      type: String,
      trim: true,
    },
    volatility12M: {
      type: String, // Almacenar como string porque puede tener "-" o porcentajes
      trim: true,
    },
    return12M: {
      type: String, // Almacenar como string porque puede tener "-" o porcentajes
      trim: true,
    },
    category: {
      type: String,
      required: true,
      enum: [
        "Monetarios",
        "RF corto plazo",
        "RF medio plazo",
        "Renta Variable",
        "Renta Fija largo plazo",
        "ETFs",
        "Mixtos",
        "Alternativos",
        "Revisar",
      ],
    },
    notes: {
      type: String,
      trim: true,
    },
    user: {
      type: String,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Índice para búsquedas rápidas por categoría y usuario
portfolioFundSchema.index({ user: 1, category: 1 });
portfolioFundSchema.index({ user: 1, isin: 1 });

const PortfolioFund = mongoose.model("PortfolioFund", portfolioFundSchema);

export default PortfolioFund;
