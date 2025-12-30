import mongoose from 'mongoose';

const investmentHistorySchema = new mongoose.Schema(
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
  },
  {
    timestamps: true,
  }
);

// Índice compuesto para búsquedas eficientes por inversión y fecha
investmentHistorySchema.index({ investment: 1, date: -1 });

export default mongoose.model('InvestmentHistory', investmentHistorySchema);

