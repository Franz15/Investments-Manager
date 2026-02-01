import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const userId = "ana";
const isin = "LU1623762843";

const MYINVESTOR_CREATION = {
  date: new Date("2026-01-09T19:36:19.000Z"),
  amount: 5000,
  price: 158.45,
  quantity: 31.555,
};
const MYINVESTOR_ADD = {
  date: new Date("2026-01-15T19:54:37.000Z"),
  amount: 250,
  price: 158.45,
  quantity: 1.577,
};
const RENTA4_ADD = {
  date: new Date("2026-01-16T00:00:00.000Z"),
  amount: 686.939,
  price: 158.5,
  quantity: 4.334,
};

const round = (value) => Number(value.toFixed(6));

const main = async () => {
  await mongoose.connect(
    process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager",
  );

  const myInvestor = await Account.findOne({
    user: userId,
    name: /myinvestor/i,
  });
  if (!myInvestor) {
    throw new Error("Cuenta MyInvestor no encontrada");
  }
  const renta4 = await Account.findOne({ user: userId, name: /renta4/i });
  if (!renta4) {
    throw new Error("Cuenta Renta4 no encontrada");
  }

  const myInvestorSub = await SubAccount.findOne({
    user: userId,
    account: myInvestor._id,
    type: "investment",
    name: /corto/i,
  });
  if (!myInvestorSub) {
    throw new Error(
      "Subcuenta MyInvestor (Renta Fija Corto Plazo) no encontrada",
    );
  }
  const renta4Sub = await SubAccount.findOne({
    user: userId,
    account: renta4._id,
    type: "investment",
  });
  if (!renta4Sub) {
    throw new Error("Subcuenta de inversión Renta4 no encontrada");
  }

  const investment = await Investment.findOne({ user: userId, isin });
  if (!investment) {
    throw new Error("Inversión Carmignac no encontrada");
  }

  const myInvestorQtyTotal = round(
    MYINVESTOR_CREATION.quantity + MYINVESTOR_ADD.quantity,
  );
  const totalQty = round(myInvestorQtyTotal + RENTA4_ADD.quantity);
  const totalCost = round(
    MYINVESTOR_CREATION.amount + MYINVESTOR_ADD.amount + RENTA4_ADD.amount,
  );
  const weightedAvg = totalQty > 0 ? totalCost / totalQty : 0;

  investment.account = myInvestor._id;
  investment.subAccount = myInvestorSub._id;
  investment.quantity = totalQty;
  investment.averagePurchasePrice = weightedAvg;
  investment.purchasePrice = MYINVESTOR_CREATION.price;
  investment.allocations = [
    {
      account: myInvestor._id,
      subAccount: myInvestorSub._id,
      amount: round(MYINVESTOR_CREATION.amount + MYINVESTOR_ADD.amount),
      quantity: myInvestorQtyTotal,
      averagePurchasePrice: MYINVESTOR_CREATION.price,
    },
    {
      account: renta4._id,
      subAccount: renta4Sub._id,
      amount: round(RENTA4_ADD.amount),
      quantity: RENTA4_ADD.quantity,
      averagePurchasePrice: RENTA4_ADD.price,
    },
  ];
  await investment.save();

  const upsertHistory = async ({
    operation,
    date,
    amount,
    price,
    quantity,
    accountId,
    subAccountId,
    notes,
  }) => {
    const totalValue = round(quantity * price);
    await InvestmentHistory.findOneAndUpdate(
      {
        user: userId,
        investment: investment._id,
        operation,
        date,
        operationAmount: amount,
      },
      {
        user: userId,
        investment: investment._id,
        account: accountId,
        subAccount: subAccountId,
        date,
        currentPrice: price,
        quantity,
        totalValue,
        operation,
        operationAmount: amount,
        operationPrice: price,
        notes,
      },
      { upsert: true, new: true },
    );
  };

  await upsertHistory({
    operation: "creation",
    date: MYINVESTOR_CREATION.date,
    amount: MYINVESTOR_CREATION.amount,
    price: MYINVESTOR_CREATION.price,
    quantity: MYINVESTOR_CREATION.quantity,
    accountId: myInvestor._id,
    subAccountId: myInvestorSub._id,
    notes: "Creación MyInvestor (ajuste manual)",
  });

  await upsertHistory({
    operation: "add",
    date: MYINVESTOR_ADD.date,
    amount: MYINVESTOR_ADD.amount,
    price: MYINVESTOR_ADD.price,
    quantity: round(MYINVESTOR_CREATION.quantity + MYINVESTOR_ADD.quantity),
    accountId: myInvestor._id,
    subAccountId: myInvestorSub._id,
    notes: "Aporte MyInvestor (ajuste manual)",
  });

  // Ajustar entrada existente de Renta4 (si existe)
  const renta4Entry = await InvestmentHistory.findOne({
    user: userId,
    investment: investment._id,
    operationAmount: RENTA4_ADD.amount,
    operationPrice: RENTA4_ADD.price,
  }).sort({ date: 1 });

  if (renta4Entry) {
    renta4Entry.operation = "add";
    renta4Entry.account = renta4._id;
    renta4Entry.subAccount = renta4Sub._id;
    renta4Entry.currentPrice = RENTA4_ADD.price;
    renta4Entry.quantity = totalQty;
    renta4Entry.totalValue = round(totalQty * RENTA4_ADD.price);
    renta4Entry.notes = "Aporte Renta4 (ajuste manual)";
    await renta4Entry.save();
  }

  // Ajustar entradas de actualización para reflejar la cantidad total
  const updateEntries = await InvestmentHistory.find({
    user: userId,
    investment: investment._id,
    operation: "update",
  });
  for (const entry of updateEntries) {
    if (!entry.currentPrice) continue;
    entry.quantity = totalQty;
    entry.totalValue = round(totalQty * entry.currentPrice);
    await entry.save();
  }

  console.log("✅ Carmignac actualizado con MyInvestor + Renta4.");
  await mongoose.disconnect();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
