import mongoose from 'mongoose';

const debtSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      required: true,
      enum: ['mortgage', 'personal_loan', 'car_loan', 'credit_card', 'student_loan', 'other'],
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    remainingAmount: {
      type: Number,
      required: true,
    },
    interestRate: {
      type: Number,
      default: 0,
    },
    monthlyPayment: {
      type: Number,
      default: 0,
    },
    startDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    endDate: {
      type: Date,
    },
    currency: {
      type: String,
      required: true,
      default: 'EUR',
      enum: ['EUR', 'USD', 'GBP'],
    },
    lender: {
      type: String,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['active', 'paid', 'default'],
      default: 'active',
    },
    subAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubAccount',
    },
  },
  {
    timestamps: true,
  }
);

// Virtual para calcular meses restantes
debtSchema.virtual('monthsRemaining').get(function () {
  if (!this.endDate) return null;
  const now = new Date();
  const diffTime = this.endDate - now;
  const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
  return diffMonths > 0 ? diffMonths : 0;
});

// Virtual para calcular porcentaje pagado
debtSchema.virtual('paidPercentage').get(function () {
  if (this.totalAmount === 0) return 0;
  return ((this.totalAmount - this.remainingAmount) / this.totalAmount) * 100;
});

debtSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Debt', debtSchema);

