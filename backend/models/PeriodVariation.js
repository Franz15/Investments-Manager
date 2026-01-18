import mongoose from "mongoose";

/**
 * Modelo para almacenar variaciones agregadas (mensual, trimestral, anual)
 * Estas se calculan automáticamente sumando las variaciones diarias del período
 * y NO incluyen aportes/retiros de capital (ya están excluidos en las variaciones diarias)
 */
const periodVariationSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    // Tipo de período: 'monthly', 'quarterly', 'annual'
    periodType: {
      type: String,
      enum: ["monthly", "quarterly", "annual"],
      required: true,
      index: true,
    },
    // Fecha de inicio del período (ej: 2026-01-01 para enero, trimestre o año)
    periodStart: {
      type: Date,
      required: true,
      index: true,
    },
    // Fecha de fin del período
    periodEnd: {
      type: Date,
      required: true,
    },
    // Suma de todas las variaciones diarias del período (en euros)
    // Ya excluye aportes/retiros porque las variaciones diarias los excluyen
    totalChangeAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    // Valor total al inicio del período (suma de totalValue de todas las inversiones)
    startValue: {
      type: Number,
      required: true,
      default: 0,
    },
    // Valor total al final del período
    endValue: {
      type: Number,
      required: true,
      default: 0,
    },
    // Variación en porcentaje
    changePercent: {
      type: Number,
      required: true,
      default: 0,
    },
    // Número de inversiones incluidas en el cálculo
    investmentCount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  {
    timestamps: false,
  },
);

// Índice compuesto único para evitar duplicados
periodVariationSchema.index(
  { user: 1, periodType: 1, periodStart: 1 },
  { unique: true },
);

// Índice para búsquedas por tipo de período y fecha
periodVariationSchema.index({ user: 1, periodType: 1, periodStart: -1 });

export default mongoose.model("PeriodVariation", periodVariationSchema);
