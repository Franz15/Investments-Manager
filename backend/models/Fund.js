import mongoose from 'mongoose';

const CATEGORIES = [
  'Monetarios',
  'RF corto plazo',
  'RF medio plazo',
  'Renta Variable',
  'Renta Fija largo plazo',
  'ETFs',
  'Mixtos',
  'Alternativos',
  'Revisar',
];

const fundSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    isin: { type: String, trim: true },
    link: { type: String, trim: true },
    category: { type: String, required: true, enum: CATEGORIES },
    notes: { type: String, trim: true },
    // Gestora
    managementCompany: { type: String, trim: true },

    // Categoría y rating Morningstar
    morningstarCategory: { type: String, trim: true },
    morningstarSecId: { type: String, trim: true },
    ratingOverall: { type: Number, min: 1, max: 5 },

    // Rentabilidades (almacenadas como string: "4.20%" o "-" o null)
    return12M: { type: String, trim: true },
    return3Y: { type: String, trim: true },
    return5Y: { type: String, trim: true },
    return10Y: { type: String, trim: true },

    // Volatilidad (desviación estándar)
    volatility12M: { type: String, trim: true },
    volatility3Y: { type: String, trim: true },
    volatility5Y: { type: String, trim: true },

    // Etiquetas libres (p. ej. 'sostenible', 'islamico', 'tematico')
    tags: [{ type: String, trim: true }],

    // Cuándo se actualizaron las métricas desde Morningstar
    metricsUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

// ISIN único globalmente (sparse permite null/vacío)
fundSchema.index({ isin: 1 }, { unique: true, sparse: true });
fundSchema.index({ category: 1 });
fundSchema.index({ tags: 1 });

const Fund = mongoose.model('Fund', fundSchema);

export default Fund;
