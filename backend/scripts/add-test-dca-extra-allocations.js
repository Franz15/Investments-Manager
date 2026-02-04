import mongoose from "mongoose";
import dotenv from "dotenv";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { getQuote } from "../services/quoteService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const USER_ID = "test-dca";

const RF_SHORT_AMOUNT = 20000; // 20k a renta fija corto
const ALT_AMOUNT = 5000; // 5k a alternativas

async function addExtraAllocations() {
  console.log("Conectando a MongoDB...");
  await mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  console.log("MongoDB conectado.");

  try {
    // Buscar cuentas y subcuentas de test-dca
    const accounts = await Account.find({ user: USER_ID });
    if (!accounts.length) {
      throw new Error("No se han encontrado cuentas para el usuario test-dca");
    }

    const subAccounts = await SubAccount.find({ user: USER_ID });

    const findAccount = (bankName) =>
      accounts.find(
        (a) =>
          a.bankName &&
          a.bankName.toLowerCase().replace(/\s+/g, "") ===
            bankName.toLowerCase().replace(/\s+/g, ""),
      );

    const findCashSub = (accountId) =>
      subAccounts.find(
        (s) =>
          s.account?.toString() === accountId.toString() && s.type === "cash",
      );

    const findInvSub = (accountId) =>
      subAccounts.find(
        (s) =>
          s.account?.toString() === accountId.toString() &&
          s.type === "investment",
      );

    const myInvestor = findAccount("MyInvestor");
    const renta4 = findAccount("Renta4");

    if (!myInvestor || !renta4) {
      throw new Error("No se encontraron las cuentas MyInvestor o Renta4");
    }

    const myInvestorCash = findCashSub(myInvestor._id);
    const myInvestorInv = findInvSub(myInvestor._id);
    const renta4Cash = findCashSub(renta4._id);
    const renta4Inv = findInvSub(renta4._id);

    if (!myInvestorCash || !myInvestorInv || !renta4Cash || !renta4Inv) {
      throw new Error(
        "Faltan subcuentas de efectivo o inversión en MyInvestor o Renta4",
      );
    }

    // --- 1) Inversión en renta fija corto plazo (20k desde efectivo MyInvestor) ---
    console.log("Creando inversión de renta fija corto plazo...");

    const rfSymbol = "IE00B3VWN393"; // iShares € Corp Bond 0-3yr UCITS ETF (ejemplo real)
    let rfQuotePrice;
    try {
      const quote = await getQuote(rfSymbol, "etf", "EUR", null, null);
      rfQuotePrice = quote?.price;
      console.log(
        `Cotización RF corto (${rfSymbol}):`,
        rfQuotePrice ?? "no disponible",
      );
    } catch (e) {
      console.warn(
        `[RF corto] No se pudo obtener cotización para ${rfSymbol}: ${e.message}`,
      );
    }

    if (!rfQuotePrice || rfQuotePrice <= 0) {
      rfQuotePrice = 100; // fallback razonable
    }

    const rfPurchasePrice = Number((rfQuotePrice * 0.98).toFixed(2));
    const rfQty = Number((RF_SHORT_AMOUNT / rfPurchasePrice).toFixed(4));
    const rfDate = new Date("2025-03-15T00:00:00.000Z");

    const rfInvestment = await Investment.create({
      user: USER_ID,
      account: myInvestor._id,
      subAccount: myInvestorInv._id,
      allocations: [
        {
          account: myInvestor._id,
          subAccount: myInvestorInv._id,
          amount: RF_SHORT_AMOUNT,
          quantity: rfQty,
          averagePurchasePrice: rfPurchasePrice,
        },
      ],
      name: "iShares € Corp Bond 0-3yr UCITS ETF",
      type: "etf",
      symbol: rfSymbol,
      quantity: rfQty,
      purchasePrice: rfPurchasePrice,
      averagePurchasePrice: rfPurchasePrice,
      currentPrice: rfQuotePrice,
      purchaseDate: rfDate,
      currency: "EUR",
      assetClass: "fixed_income",
      fixedIncomeSubtype: "short",
      isAlternative: false,
      notes: "Ejemplo de renta fija corto plazo",
      platformUrl:
        "https://www.ishares.com/uk/individual/en/products/251776/ishares-euro-corporate-bond-13yr-ucits-etf",
      dconstituted: false,
    });

    await InvestmentHistory.create({
      user: USER_ID,
      investment: rfInvestment._id,
      account: myInvestor._id,
      subAccount: myInvestorInv._id,
      date: rfDate,
      currentPrice: rfPurchasePrice,
      quantity: rfQty,
      totalValue: rfQty * rfPurchasePrice,
      operation: "creation",
      operationAmount: RF_SHORT_AMOUNT,
      operationPrice: rfPurchasePrice,
      notes: "Compra inicial RF corto plazo",
    });

    // Actualizar efectivo MyInvestor
    myInvestorCash.balance = (myInvestorCash.balance || 0) - RF_SHORT_AMOUNT;
    await myInvestorCash.save();

    // --- 2) Inversión alternativa (5k desde efectivo Renta4) ---
    console.log("Creando inversión alternativa...");

    const altSymbol = "INRG.L"; // iShares Global Clean Energy UCITS ETF
    let altQuotePrice;
    try {
      const quote = await getQuote(altSymbol, "etf", "EUR", null, null);
      altQuotePrice = quote?.price;
      console.log(
        `Cotización alternativa (${altSymbol}):`,
        altQuotePrice ?? "no disponible",
      );
    } catch (e) {
      console.warn(
        `[Alternativa] No se pudo obtener cotización para ${altSymbol}: ${e.message}`,
      );
    }

    if (!altQuotePrice || altQuotePrice <= 0) {
      altQuotePrice = 80; // fallback razonable
    }

    const altPurchasePrice = Number((altQuotePrice * 0.98).toFixed(2));
    const altQty = Number((ALT_AMOUNT / altPurchasePrice).toFixed(4));
    const altDate = new Date("2025-04-01T00:00:00.000Z");

    const altInvestment = await Investment.create({
      user: USER_ID,
      account: renta4._id,
      subAccount: renta4Inv._id,
      allocations: [
        {
          account: renta4._id,
          subAccount: renta4Inv._id,
          amount: ALT_AMOUNT,
          quantity: altQty,
          averagePurchasePrice: altPurchasePrice,
        },
      ],
      name: "iShares Global Clean Energy UCITS ETF",
      type: "etf",
      symbol: altSymbol,
      quantity: altQty,
      purchasePrice: altPurchasePrice,
      averagePurchasePrice: altPurchasePrice,
      currentPrice: altQuotePrice,
      purchaseDate: altDate,
      currency: "EUR",
      assetClass: "mixed",
      isAlternative: true,
      notes: "Ejemplo de inversión alternativa (energía limpia)",
      platformUrl:
        "https://www.ishares.com/uk/individual/en/products/251716/ishares-global-clean-energy-ucits-etf",
      dcaEnabled: false,
    });

    await InvestmentHistory.create({
      user: USER_ID,
      investment: altInvestment._id,
      account: renta4._id,
      subAccount: renta4Inv._id,
      date: altDate,
      currentPrice: altPurchasePrice,
      quantity: altQty,
      totalValue: altQty * altPurchasePrice,
      operation: "creation",
      operationAmount: ALT_AMOUNT,
      operationPrice: altPurchasePrice,
      notes: "Compra inicial fondo alternativo (energía limpia)",
    });

    // Actualizar efectivo Renta4
    renta4Cash.balance = (renta4Cash.balance || 0) - ALT_AMOUNT;
    await renta4Cash.save();

    console.log("✔ Inversiones extra para test-dca creadas correctamente.");
  } finally {
    await mongoose.connection.close();
    console.log("Conexión cerrada");
  }
}

addExtraAllocations().catch((err) => {
  console.error("Error al añadir inversiones extra a test-dca:", err);
  process.exit(1);
});
