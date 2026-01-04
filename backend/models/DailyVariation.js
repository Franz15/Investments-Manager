import mongoose from 'mongoose';

const dailyVariationSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    investment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Investment',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    // Valor total del día (para poder calcular retroactivamente si es necesario)
    totalValue: {
      type: Number,
      required: true,
    },
    // Variación en euros
    changeAmount: {
      type: Number,
      required: true,
    },
    // Variación en porcentaje
    changePercent: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: false, // No necesitamos timestamps para ahorrar espacio
  }
);

// Índice compuesto único para evitar duplicados
dailyVariationSchema.index({ investment: 1, date: 1 }, { unique: true });

// Índice para búsquedas por fecha
dailyVariationSchema.index({ user: 1, date: -1 });

export default mongoose.model('DailyVariation', dailyVariationSchema);
