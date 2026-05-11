import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: String,
      required: true,
      index: true,
    },
    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      index: true,
    },
    subAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SubAccount",
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["income", "expense", "transfer"],
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
      default: "EUR",
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
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null, // null = personal
    },
    debt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Debt",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Validación: debe tener account o subAccount
transactionSchema.pre("validate", function (next) {
  if (!this.account && !this.subAccount) {
    return next(new Error("Debe especificar una cuenta o subcuenta"));
  }
  next();
});

// Índice compuesto para búsquedas por negocio
transactionSchema.index({ user: 1, business: 1 });

export default mongoose.model("Transaction", transactionSchema);
