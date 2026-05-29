import mongoose from 'mongoose';

const recurringTransactionSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ['income', 'expense'] },
    category: { type: String, required: true, trim: true },
    subAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'SubAccount', required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: 'EUR', enum: ['EUR', 'USD', 'GBP'] },
    description: { type: String, trim: true },
    frequency: {
      type: String,
      required: true,
      enum: ['daily', 'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'yearly'],
      default: 'monthly',
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    nextDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', default: null },
    tags: [{ type: String, trim: true }],
    lastGenerated: { type: Date },
  },
  { timestamps: true }
);

recurringTransactionSchema.index({ user: 1, isActive: 1, nextDate: 1 });

export default mongoose.model('RecurringTransaction', recurringTransactionSchema);
