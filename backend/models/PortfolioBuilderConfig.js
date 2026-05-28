import mongoose from 'mongoose';

const categoryAllocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    expectedReturn: { type: String, default: null },
    weight: { type: String, default: null },
    portfolioReturn: { type: String, default: null },
    amount: { type: Number, default: null },
    description: { type: String, default: null },
  },
  { _id: false }
);

const rvFundDistributionSchema = new mongoose.Schema(
  {
    percentage: { type: String, required: true },
    name: { type: String, required: true },
    isin: { type: String, default: null },
    link: { type: String, default: null },
    volatility12M: { type: String, default: null },
    return12M: { type: String, default: null },
    calculatedAmount: { type: Number, default: null },
  },
  { _id: false }
);

const portfolioBuilderConfigSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    allocation: {
      totalAmountCalculated: { type: Number, default: 120000 },
      totalReturn: { type: String, default: '5.73%' },
      categories: [categoryAllocationSchema],
    },
    rvDistribution: [rvFundDistributionSchema],
    /** ISINs de fondos “extra” (no principales de Cartera1) que el usuario ha añadido por categoría */
    extraFundIsinsByCategory: {
      type: Object,
      default: () => ({}),
    },
    /** ISINs que el usuario ha quitado de la vista por categoría (incluye principales) */
    excludedFundIsinsByCategory: {
      type: Object,
      default: () => ({}),
    },
    /** Fondos añadidos manualmente (sin ISIN predefinido) por categoría, para secciones no-RV */
    manualFundsByCategory: {
      type: Object,
      default: () => ({}),
    },
    /** Mostrar solo fondos ESG en el Portfolio Builder */
    esgOnly: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const PortfolioBuilderConfig = mongoose.model(
  'PortfolioBuilderConfig',
  portfolioBuilderConfigSchema
);

export default PortfolioBuilderConfig;
