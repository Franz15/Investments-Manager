import mongoose from "mongoose";

const forecastSchema = new mongoose.Schema(
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
      enum: ["income", "expense"],
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
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
    frequency: {
      type: String,
      required: true,
      enum: [
        "one-time",
        "daily",
        "weekly",
        "biweekly",
        "monthly",
        "quarterly",
        "yearly",
      ],
      default: "monthly",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
    },
    description: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    business: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Business",
      default: null, // null = personal
    },
  },
  {
    timestamps: true,
  },
);

// Índice compuesto para búsquedas eficientes
forecastSchema.index({
  user: 1,
  isActive: 1,
  startDate: 1,
  endDate: 1,
  business: 1,
});

export default mongoose.model("Forecast", forecastSchema);
