import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    subAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubAccount',
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['income', 'expense', 'transfer'],
    },
    category: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
    },
    description: {
      type: String,
      trim: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model('Transaction', transactionSchema);

