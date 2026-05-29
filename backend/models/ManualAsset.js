import mongoose from 'mongoose';

const manualAssetSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: {
      type: String,
      required: true,
      enum: ['real_estate', 'vehicle', 'art', 'other'],
      default: 'real_estate',
    },
    currentValue: { type: Number, required: true },
    purchasePrice: { type: Number },
    purchaseDate: { type: Date },
    currency: { type: String, required: true, default: 'EUR', enum: ['EUR', 'USD', 'GBP'] },
    description: { type: String, trim: true },
    linkedDebt: { type: mongoose.Schema.Types.ObjectId, ref: 'Debt', default: null },
    lastValuationDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('ManualAsset', manualAssetSchema);
