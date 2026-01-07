import mongoose from "mongoose";

const accountSchema = new mongoose.Schema(
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
    bankName: {
      type: String,
      required: true,
      trim: true,
    },
    accountNumber: {
      type: String,
      trim: true,
    },
    currency: {
      type: String,
      required: true,
      default: "EUR",
      enum: ["EUR", "USD", "GBP"],
    },
    description: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
      default: "#3b82f6", // Azul por defecto
      match: /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

// Virtual para obtener todas las subcuentas
accountSchema.virtual("subAccounts", {
  ref: "SubAccount",
  localField: "_id",
  foreignField: "account",
});

accountSchema.set("toJSON", { virtuals: true });

export default mongoose.model("Account", accountSchema);
