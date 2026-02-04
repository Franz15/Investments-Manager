import mongoose from "mongoose";
import dotenv from "dotenv";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Investment from "../models/Investment.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import Transaction from "../models/Transaction.js";
import Debt from "../models/Debt.js";
import { getQuote } from "../services/quoteService.js";

dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

const USER_ID = "test-dca";

/**
 * Utilidades
 */
function d(dateStr) {
  // dateStr en formato YYYY-MM-DD
  return new Date(dateStr + "T00:00:00.000Z");
}

async function clearExistingData() {
  console.log(`Eliminando datos existentes para usuario ${USER_ID}...`);
  await Promise.all([
    Account.deleteMany({ user: USER_ID }),
    SubAccount.deleteMany({ user: USER_ID }),
    Investment.deleteMany({ user: USER_ID }),
    InvestmentHistory.deleteMany({ user: USER_ID }),
    Transaction.deleteMany({ user: USER_ID }),
    Debt.deleteMany({ user: USER_ID }),
  ]);
}

async function createAccountsAndSubAccounts() {
  console.log("Creando cuentas y subcuentas...");

  const accountsData = [
    {
      name: "Cuenta Corriente Santander",
      bankName: "Santander",
      color: "#ec0000",
    },
    {
      name: "Cuenta Inversión MyInvestor",
      bankName: "MyInvestor",
      color: "#00a859",
    },
    {
      name: "Broker Renta 4",
      bankName: "Renta4",
      color: "#e85d04",
    },
    {
      name: "Cuenta Ahorro ING",
      bankName: "ING",
      color: "#ff6200",
    },
  ];

  const accounts = [];

  for (const acc of accountsData) {
    const account = await Account.create({
      user: USER_ID,
      name: acc.name,
      bankName: acc.bankName,
      color: acc.color,
      currency: "EUR",
      description: "",
    });
    accounts.push(account);
  }

  const subAccounts = [];

  for (const account of accounts) {
    // Efectivo
    const cash = await SubAccount.create({
      user: USER_ID,
      account: account._id,
      name: "Efectivo",
      type: "cash",
      balance: 0,
      currency: "EUR",
      initialDate: d("2025-03-01"),
    });
    subAccounts.push(cash);

    // Inversión
    const inv = await SubAccount.create({
      user: USER_ID,
      account: account._id,
      name: "Inversiones",
      type: "investment",
      balance: 0,
      currency: "EUR",
      initialDate: d("2025-03-01"),
    });
    subAccounts.push(inv);
  }

  return { accounts, subAccounts };
}

async function seedTransactions(accounts, subAccounts) {
  console.log("Creando transacciones iniciales...");

  const cashSub = (bankName) =>
    subAccounts.find(
      (s) =>
        s.type === "cash" &&
        accounts.find(
          (a) =>
            a._id.toString() === s.account.toString() &&
            a.bankName === bankName,
        ),
    );

  const santanderCash = cashSub("Santander");
  const ingCash = cashSub("ING");
  const myInvestorCash = cashSub("MyInvestor");
  const renta4Cash = cashSub("Renta4");

  const txs = [
    // Ingresos iniciales por banco
    {
      subAccount: santanderCash._id,
      type: "income",
      category: "Nómina",
      amount: 30000,
      date: d("2025-03-01"),
      description: "Aportación inicial Santander",
    },
    {
      subAccount: ingCash._id,
      type: "income",
      category: "Ahorro",
      amount: 15000,
      date: d("2025-03-01"),
      description: "Aportación inicial ING",
    },
    {
      subAccount: myInvestorCash._id,
      type: "income",
      category: "Aportación",
      amount: 10000,
      date: d("2025-03-01"),
      description: "Aportación inicial MyInvestor",
    },
    {
      subAccount: renta4Cash._id,
      type: "income",
      category: "Aportación",
      amount: 5000,
      date: d("2025-03-01"),
      description: "Aportación inicial Renta 4",
    },
  ];

  await Transaction.insertMany(
    txs.map((t) => ({
      ...t,
      user: USER_ID,
      currency: "EUR",
      tags: [],
    })),
  );

  // Actualizar balances de efectivo
  santanderCash.balance = 30000;
  ingCash.balance = 15000;
  myInvestorCash.balance = 10000;
  renta4Cash.balance = 5000;

  await Promise.all([
    santanderCash.save(),
    ingCash.save(),
    myInvestorCash.save(),
    renta4Cash.save(),
  ]);
}

async function seedInvestments(accounts, subAccounts) {
  console.log("Creando inversiones y DCA...");

  const findAccount = (bankName) =>
    accounts.find((a) => a.bankName === bankName);
  const findInvSub = (bankName) =>
    subAccounts.find(
      (s) =>
        s.type === "investment" &&
        accounts.find(
          (a) =>
            a._id.toString() === s.account.toString() &&
            a.bankName === bankName,
        ),
    );

  const myInvestorAccount = findAccount("MyInvestor");
  const renta4Account = findAccount("Renta4");
  const santanderAccount = findAccount("Santander");

  const myInvestorInvSub = findInvSub("MyInvestor");
  const renta4InvSub = findInvSub("Renta4");
  const santanderInvSub = findInvSub("Santander");

  // Inversiones base (situación a 2025-03-01)
  const baseInvestmentsData = [
    {
      name: "Vanguard FTSE All-World UCITS ETF",
      type: "etf",
      symbol: "VWRL.AS",
      account: myInvestorAccount._id,
      subAccount: myInvestorInvSub._id,
      quantity: 200,
      purchaseDate: d("2025-03-01"),
      assetClass: "variable_income",
      platformUrl: "https://myinvestor.es",
      quoteType: "etf",
    },
    {
      name: "Vanguard S&P 500 ETF",
      type: "etf",
      symbol: "VOO",
      account: myInvestorAccount._id,
      subAccount: myInvestorInvSub._id,
      quantity: 100,
      purchaseDate: d("2025-03-01"),
      assetClass: "variable_income",
      platformUrl: "https://myinvestor.es",
      quoteType: "etf",
    },
    {
      name: "Tesla Motors",
      type: "stock",
      symbol: "TSLA",
      account: renta4Account._id,
      subAccount: renta4InvSub._id,
      quantity: 80,
      purchaseDate: d("2025-03-01"),
      assetClass: "variable_income",
      platformUrl: "https://www.renta4.com",
      quoteType: "stock",
    },
    {
      name: "NVIDIA Corporation",
      type: "stock",
      symbol: "NVDA",
      account: renta4Account._id,
      subAccount: renta4InvSub._id,
      quantity: 40,
      purchaseDate: d("2025-03-01"),
      assetClass: "variable_income",
      platformUrl: "https://www.renta4.com",
      quoteType: "stock",
    },
    {
      name: "Inditex",
      type: "stock",
      symbol: "ITX.MC",
      account: santanderAccount._id,
      subAccount: santanderInvSub._id,
      quantity: 300,
      purchaseDate: d("2025-03-01"),
      assetClass: "variable_income",
      platformUrl: "https://www.santander.com",
      quoteType: "stock",
    },
    {
      name: "Euro Medium-Term Bond Index",
      type: "fund",
      symbol: "",
      account: myInvestorAccount._id,
      subAccount: myInvestorInvSub._id,
      quantity: 300,
      purchaseDate: d("2025-03-01"),
      assetClass: "fixed_income",
      fixedIncomeSubtype: "medium",
      platformUrl: "https://myinvestor.es",
      // Fondo indexado de RF medio real (ejemplo): iShares Core € Govt Bond UCITS ETF (IE00B4WXJJ64)
      isin: "IE00B4WXJJ64",
      quoteType: "fund",
    },
  ];

  const investments = [];

  for (const inv of baseInvestmentsData) {
    // Obtener precio real usando el servicio de cotizaciones
    let currentPrice = null;
    try {
      const quote = await getQuote(
        inv.symbol || inv.isin,
        inv.quoteType || inv.type,
        "EUR",
        inv.isin || null,
        inv.name,
      );
      currentPrice = quote?.price || null;
    } catch (e) {
      console.warn(
        `[seed-test-dca] No se pudo obtener precio para ${inv.name} (${
          inv.symbol || inv.isin
        }): ${e.message}`,
      );
    }

    // Fallback a precios fijos si no hay cotización
    if (!currentPrice || currentPrice <= 0) {
      if (inv.type === "stock") {
        currentPrice = 100;
      } else if (inv.type === "etf") {
        currentPrice = 80;
      } else {
        currentPrice = 50;
      }
    }

    // precio de compra algo inferior al actual para que haya ligera ganancia
    const purchasePrice = Number((currentPrice * 0.95).toFixed(2));

    const totalInvested = inv.quantity * purchasePrice;
    const investment = await Investment.create({
      user: USER_ID,
      account: inv.account,
      subAccount: inv.subAccount,
      allocations: [
        {
          account: inv.account,
          subAccount: inv.subAccount,
          amount: totalInvested,
          quantity: inv.quantity,
          averagePurchasePrice: purchasePrice,
        },
      ],
      name: inv.name,
      type: inv.type,
      symbol: inv.symbol,
      quantity: inv.quantity,
      purchasePrice,
      averagePurchasePrice: purchasePrice,
      currentPrice,
      purchaseDate: inv.purchaseDate,
      currency: "EUR",
      assetClass: inv.assetClass,
      fixedIncomeSubtype: inv.fixedIncomeSubtype,
      isAlternative: false,
      notes: "",
      platformUrl: inv.platformUrl,
      dcaEnabled: true,
      dcaAmount: 500,
      dcaFrequency: "monthly",
      dcaStartDate: d("2025-04-01"),
    });
    investments.push(investment);

    // Crear historial "creation"
    await InvestmentHistory.create({
      user: USER_ID,
      investment: investment._id,
      account: inv.account,
      subAccount: inv.subAccount,
      date: inv.purchaseDate,
      currentPrice: purchasePrice,
      quantity: inv.quantity,
      totalValue: inv.quantity * purchasePrice,
      operation: "creation",
      operationAmount: totalInvested,
      operationPrice: purchasePrice,
      notes: "Compra inicial",
    });
  }

  // Generar DCA mensual para dos inversiones (MSCI World y Tesla)
  console.log("Generando historiales mensuales (DCA y actualizaciones)...");

  const [msciInv, , tslaInv, , , bondInv] = investments;

  const months = [
    "2025-04-01",
    "2025-05-01",
    "2025-06-01",
    "2025-07-01",
    "2025-08-01",
    "2025-09-01",
    "2025-10-01",
    "2025-11-01",
    "2025-12-01",
    "2026-01-01",
    "2026-02-01",
  ];

  let msciQty = msciInv.quantity;
  let tslaQty = tslaInv.quantity;
  let bondQty = bondInv.quantity;

  for (let i = 0; i < months.length; i++) {
    const date = d(months[i]);

    // MSCI World: DCA mensual de 500€
    const msciDcaPrice = msciInv.purchasePrice + 5 * (i + 1);
    const msciDcaUnits = 500 / msciDcaPrice;
    msciQty += msciDcaUnits;

    await InvestmentHistory.create({
      user: USER_ID,
      investment: msciInv._id,
      account: msciInv.account,
      subAccount: msciInv.subAccount,
      date,
      currentPrice: msciDcaPrice,
      quantity: msciQty,
      totalValue: msciQty * msciDcaPrice,
      operation: "add",
      operationAmount: 500,
      operationPrice: msciDcaPrice,
      notes: "DCA mensual MSCI World",
    });

    // Tesla: DCA de 300€ un mes sí, un mes no
    const tslaPrice = tslaInv.purchasePrice + 4 * (i + 1);
    if (i % 2 === 0) {
      const tslaDcaUnits = 300 / tslaPrice;
      tslaQty += tslaDcaUnits;

      await InvestmentHistory.create({
        user: USER_ID,
        investment: tslaInv._id,
        account: tslaInv.account,
        subAccount: tslaInv.subAccount,
        date,
        currentPrice: tslaPrice,
        quantity: tslaQty,
        totalValue: tslaQty * tslaPrice,
        operation: "add",
        operationAmount: 300,
        operationPrice: tslaPrice,
        notes: "DCA mensual Tesla",
      });
    } else {
      // Solo actualización de precio/valor
      await InvestmentHistory.create({
        user: USER_ID,
        investment: tslaInv._id,
        account: tslaInv.account,
        subAccount: tslaInv.subAccount,
        date,
        currentPrice: tslaPrice,
        quantity: tslaQty,
        totalValue: tslaQty * tslaPrice,
        operation: "update",
        notes: "Actualización de precio Tesla",
      });
    }

    // Fondo de renta fija medio plazo: solo actualización de precio (sin DCA)
    const bondPrice = bondInv.purchasePrice + 0.3 * (i + 1);
    await InvestmentHistory.create({
      user: USER_ID,
      investment: bondInv._id,
      account: bondInv.account,
      subAccount: bondInv.subAccount,
      date,
      currentPrice: bondPrice,
      quantity: bondQty,
      totalValue: bondQty * bondPrice,
      operation: "update",
      notes: "Actualización de precio fondo RF medio plazo",
    });
  }
}

async function main() {
  try {
    console.log("Conectando a MongoDB...");
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("MongoDB conectado.");

    await clearExistingData();
    const { accounts, subAccounts } = await createAccountsAndSubAccounts();
    await seedTransactions(accounts, subAccounts);
    await seedInvestments(accounts, subAccounts);

    console.log("✅ Datos ficticios para test-dca generados correctamente.");
  } catch (err) {
    console.error("❌ Error al generar datos de test-dca:", err);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
}

main();
