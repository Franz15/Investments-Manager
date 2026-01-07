import mongoose from "mongoose";

const investmentSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      // No requerir en el esquema para permitir inversiones antiguas, pero validar en pre-save
    },
    subAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAccount",
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        "stock",
        "bond",
        "crypto",
        "fund",
        "etf",
        "automated_portfolio",
        "other",
      ],
    },
    symbol: {
      type: String,
      trim: true,
      uppercase: true,
    },
    isin: {
      type: String,
      trim: true,
      uppercase: true,
      // ISIN para fondos de inversión y otros instrumentos que no tienen ticker
    },
    autoUpdate: {
      type: Boolean,
      default: true,
      // Si true, se actualiza automáticamente cuando se ejecuta la actualización masiva
    },
    quantity: {
      type: Number,
      required: true,
      default: 0,
    },
    isAutomatedPortfolio: {
      type: Boolean,
      default: false,
    },
    purchasePrice: {
      type: Number,
      required: function () {
        return !this.isAutomatedPortfolio;
      },
    },
    averagePurchasePrice: {
      type: Number,
      default: function () {
        // Por defecto, el precio medio es igual al precio de compra inicial
        return this.purchasePrice;
      },
    },
    currentPrice: {
      type: Number,
      required: true,
    },
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currency: {
      type: String,
      required: true,
      default: "EUR",
    },
    assetClass: {
      type: String,
      enum: ["fixed_income", "variable_income", "mixed"],
      default: "variable_income",
    },
    fixedIncomePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    variableIncomePercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    notes: {
      type: String,
      trim: true,
    },
    platformUrl: {
      type: String,
      trim: true,
      // URL o referencia a la plataforma (ej: MyInvestor, Indexa Capital, etc.)
    },
    // DCA (Dollar Cost Averaging)
    dcaEnabled: {
      type: Boolean,
      default: false,
    },
    dcaAmount: {
      type: Number,
      min: 0,
      // Cantidad a invertir en cada período
    },
    dcaFrequency: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "monthly", "quarterly"],
      // Frecuencia de las compras automáticas
    },
    dcaStartDate: {
      type: Date,
      // Fecha de inicio del DCA
    },
    dcaNextDate: {
      type: Date,
      // Próxima fecha de ejecución del DCA
    },
    dcaEndDate: {
      type: Date,
      // Fecha de fin del DCA (opcional)
    },
    dcaDeactivatedDate: {
      type: Date,
      // Fecha en que se desactivó el DCA (para historial)
    },
  },
  {
    timestamps: true,
  },
);

// Virtual para calcular el valor total
investmentSchema.virtual("totalValue").get(function () {
  if (this.isAutomatedPortfolio) {
    // Para carteras automatizadas, currentPrice es el valor total actual
    return this.currentPrice;
  }
  // Para inversiones tradicionales, cantidad * precio unitario
  return this.quantity * this.currentPrice;
});

// Virtual para calcular la ganancia/pérdida
investmentSchema.virtual("profitLoss").get(function () {
  if (this.isAutomatedPortfolio) {
    // Para carteras automatizadas: valor actual - monto invertido
    return this.currentPrice - this.quantity;
  }
  // Para inversiones tradicionales: (precio actual - precio medio compra) * cantidad
  const avgPrice = this.averagePurchasePrice || this.purchasePrice;
  return (this.currentPrice - avgPrice) * this.quantity;
});

// Virtual para calcular el porcentaje de ganancia/pérdida
investmentSchema.virtual("profitLossPercentage").get(function () {
  if (this.isAutomatedPortfolio) {
    // Para carteras automatizadas: (valor actual - monto invertido) / monto invertido * 100
    if (this.quantity === 0) return 0;
    return ((this.currentPrice - this.quantity) / this.quantity) * 100;
  }
  // Para inversiones tradicionales: usar precio medio
  const avgPrice = this.averagePurchasePrice || this.purchasePrice;
  if (!avgPrice || avgPrice === 0) return 0;
  return ((this.currentPrice - avgPrice) / avgPrice) * 100;
});

// Validación pre-save para asegurar que los porcentajes sean correctos y limpiar purchasePrice si es cartera automatizada
investmentSchema.pre("save", function (next) {
  // Validar que account esté presente (solo para nuevas inversiones o si se está actualizando)
  // Permitir inversiones existentes sin account para migración
  if (this.isNew && !this.account) {
    return next(new Error("La inversión debe estar asociada a una cuenta"));
  }

  // Si es cartera automatizada, limpiar purchasePrice
  if (this.isAutomatedPortfolio) {
    this.purchasePrice = undefined;
    this.averagePurchasePrice = undefined;
  } else {
    // Para inversiones tradicionales, si no hay averagePurchasePrice, usar purchasePrice
    if (!this.averagePurchasePrice && this.purchasePrice) {
      this.averagePurchasePrice = this.purchasePrice;
    }
    // Si es una nueva inversión y no se especificó averagePurchasePrice, usar purchasePrice
    if (this.isNew && this.purchasePrice && !this.averagePurchasePrice) {
      this.averagePurchasePrice = this.purchasePrice;
    }
  }

  // Validar porcentajes de renta
  if (this.assetClass === "fixed_income") {
    this.fixedIncomePercentage = 100;
    this.variableIncomePercentage = 0;
  } else if (this.assetClass === "variable_income") {
    this.fixedIncomePercentage = 0;
    this.variableIncomePercentage = 100;
  } else if (this.assetClass === "mixed") {
    // Asegurar que los porcentajes sumen 100
    const total =
      (this.fixedIncomePercentage || 0) + (this.variableIncomePercentage || 0);
    if (total !== 100) {
      // Normalizar para que sumen 100
      if (total > 0) {
        this.fixedIncomePercentage = Math.round(
          (this.fixedIncomePercentage / total) * 100,
        );
        this.variableIncomePercentage = 100 - this.fixedIncomePercentage;
      } else {
        // Si ambos son 0, establecer valores por defecto
        this.fixedIncomePercentage = 50;
        this.variableIncomePercentage = 50;
      }
    }
  }
  next();
});

investmentSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Investment", investmentSchema);
