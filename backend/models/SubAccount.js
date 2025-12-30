import mongoose from 'mongoose';

const subAccountSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['cash', 'investment', 'savings', 'credit'],
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP'],
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual para calcular el valor total de inversiones si es tipo investment
subAccountSchema.virtual('totalInvestments', {
  ref: 'Investment',
  localField: '_id',
  foreignField: 'subAccount',
  justOne: false,
});

subAccountSchema.set('toJSON', { virtuals: true });

export default mongoose.model('SubAccount', subAccountSchema);

