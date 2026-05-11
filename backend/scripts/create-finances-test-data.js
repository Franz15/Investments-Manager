import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env") });

import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import Category from "../models/Category.js";
import Transaction from "../models/Transaction.js";
import Budget from "../models/Budget.js";
import Forecast from "../models/Forecast.js";

const USER_ID = "test-dca";

function monthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function dateInMonth(monthsBack, day) {
  const d = monthsAgo(monthsBack);
  d.setDate(day);
  d.setHours(10, 0, 0, 0);
  return d;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Conectado a MongoDB\n");

  // ─── ACCOUNT ────────────────────────────────────────────────────────────────
  let account = await Account.findOne({ user: USER_ID, name: "Banco Personal" });
  if (!account) {
    account = await Account.create({
      user: USER_ID,
      name: "Banco Personal",
      bankName: "CaixaBank",
      accountNumber: "ES12-3456-7890-1234",
      currency: "EUR",
      color: "#6366f1",
      isActive: true,
      business: null,
    });
    console.log("✅ Cuenta creada:", account.name);
  } else {
    console.log("ℹ️  Cuenta ya existe:", account.name);
  }

  // ─── SUBACCOUNT ─────────────────────────────────────────────────────────────
  let sub = await SubAccount.findOne({ user: USER_ID, account: account._id, name: "Cuenta Corriente" });
  if (!sub) {
    sub = await SubAccount.create({
      user: USER_ID,
      account: account._id,
      name: "Cuenta Corriente",
      type: "cash",
      balance: 4200,
      currency: "EUR",
      isActive: true,
    });
    console.log("✅ Subcuenta creada:", sub.name);
  } else {
    console.log("ℹ️  Subcuenta ya existe:", sub.name);
  }

  // ─── CATEGORIES ─────────────────────────────────────────────────────────────
  const catDefs = [
    // Ingresos
    { name: "Nómina",              type: "income",  color: "#22c55e", icon: "💼" },
    { name: "Freelance",           type: "income",  color: "#10b981", icon: "💻" },
    { name: "Dividendos",          type: "income",  color: "#06b6d4", icon: "📈" },
    { name: "Otros ingresos",      type: "income",  color: "#84cc16", icon: "🎁" },
    // Gastos
    { name: "Vivienda",            type: "expense", color: "#f59e0b", icon: "🏠" },
    { name: "Alimentación",        type: "expense", color: "#ef4444", icon: "🛒" },
    { name: "Transporte",          type: "expense", color: "#f97316", icon: "🚗" },
    { name: "Ocio & Restaurantes", type: "expense", color: "#ec4899", icon: "🍽️"  },
    { name: "Salud",               type: "expense", color: "#14b8a6", icon: "💊" },
    { name: "Suscripciones",       type: "expense", color: "#8b5cf6", icon: "📱" },
    { name: "Educación",           type: "expense", color: "#3b82f6", icon: "📚" },
    { name: "Ropa",                type: "expense", color: "#d946ef", icon: "👕" },
    { name: "Seguros",             type: "expense", color: "#64748b", icon: "🛡️"  },
    { name: "Tecnología",          type: "expense", color: "#0ea5e9", icon: "💡" },
    { name: "Gimnasio",            type: "expense", color: "#a3e635", icon: "🏋️"  },
  ];

  const cats = {};
  for (const def of catDefs) {
    let cat = await Category.findOne({ user: USER_ID, name: def.name, business: null });
    if (!cat) {
      cat = await Category.create({ user: USER_ID, business: null, isActive: true, ...def });
      console.log(`✅ Categoría: ${def.name}`);
    }
    cats[def.name] = cat;
  }

  // ─── TRANSACTIONS ────────────────────────────────────────────────────────────
  // Check if already seeded
  const existing = await Transaction.countDocuments({ user: USER_ID, business: null });
  if (existing > 0) {
    console.log(`\nℹ️  Transacciones ya existen (${existing}). Omitiendo.`);
  } else {
    const txDefs = [
      // ── Hace 2 meses (Marzo 2026) ─────────────────────────────────────────
      { date: dateInMonth(2, 1),  type: "income",  cat: "Nómina",              amount: 2800,  desc: "Nómina marzo" },
      { date: dateInMonth(2, 3),  type: "income",  cat: "Freelance",           amount: 450,   desc: "Proyecto web cliente" },
      { date: dateInMonth(2, 2),  type: "expense", cat: "Vivienda",            amount: 900,   desc: "Alquiler marzo" },
      { date: dateInMonth(2, 5),  type: "expense", cat: "Alimentación",        amount: 112,   desc: "Mercadona" },
      { date: dateInMonth(2, 12), type: "expense", cat: "Alimentación",        amount: 99,    desc: "Lidl + frutería" },
      { date: dateInMonth(2, 7),  type: "expense", cat: "Transporte",          amount: 70,    desc: "Gasolina" },
      { date: dateInMonth(2, 15), type: "expense", cat: "Transporte",          amount: 18,    desc: "Metro mensual" },
      { date: dateInMonth(2, 3),  type: "expense", cat: "Suscripciones",       amount: 15.99, desc: "Netflix" },
      { date: dateInMonth(2, 3),  type: "expense", cat: "Suscripciones",       amount: 9.99,  desc: "Spotify" },
      { date: dateInMonth(2, 3),  type: "expense", cat: "Suscripciones",       amount: 4.99,  desc: "Amazon Prime" },
      { date: dateInMonth(2, 10), type: "expense", cat: "Ocio & Restaurantes", amount: 55,    desc: "Cena restaurante" },
      { date: dateInMonth(2, 16), type: "expense", cat: "Ocio & Restaurantes", amount: 22,    desc: "Cine + bar" },
      { date: dateInMonth(2, 20), type: "expense", cat: "Ocio & Restaurantes", amount: 38,    desc: "Tapas con amigos" },
      { date: dateInMonth(2, 8),  type: "expense", cat: "Seguros",             amount: 120,   desc: "Seguro coche trimestral" },
      { date: dateInMonth(2, 14), type: "expense", cat: "Tecnología",          amount: 35,    desc: "Amazon - cable HDMI" },
      { date: dateInMonth(2, 22), type: "expense", cat: "Salud",               amount: 25,    desc: "Farmacia" },

      // ── Hace 1 mes (Abril 2026) ───────────────────────────────────────────
      { date: dateInMonth(1, 1),  type: "income",  cat: "Nómina",              amount: 2800,  desc: "Nómina abril" },
      { date: dateInMonth(1, 2),  type: "expense", cat: "Vivienda",            amount: 900,   desc: "Alquiler abril" },
      { date: dateInMonth(1, 5),  type: "expense", cat: "Alimentación",        amount: 135,   desc: "Mercadona" },
      { date: dateInMonth(1, 14), type: "expense", cat: "Alimentación",        amount: 88,    desc: "Carrefour + verdulería" },
      { date: dateInMonth(1, 22), type: "expense", cat: "Alimentación",        amount: 42,    desc: "Mercadona - reposición" },
      { date: dateInMonth(1, 4),  type: "expense", cat: "Transporte",          amount: 55,    desc: "Gasolina" },
      { date: dateInMonth(1, 20), type: "expense", cat: "Transporte",          amount: 18,    desc: "Metro mensual" },
      { date: dateInMonth(1, 3),  type: "expense", cat: "Suscripciones",       amount: 15.99, desc: "Netflix" },
      { date: dateInMonth(1, 3),  type: "expense", cat: "Suscripciones",       amount: 9.99,  desc: "Spotify" },
      { date: dateInMonth(1, 3),  type: "expense", cat: "Suscripciones",       amount: 4.99,  desc: "Amazon Prime" },
      { date: dateInMonth(1, 8),  type: "expense", cat: "Ocio & Restaurantes", amount: 67,    desc: "Cumpleaños restaurante" },
      { date: dateInMonth(1, 15), type: "expense", cat: "Ocio & Restaurantes", amount: 30,    desc: "Bar + cafés" },
      { date: dateInMonth(1, 25), type: "expense", cat: "Ocio & Restaurantes", amount: 45,    desc: "Salida fin de semana" },
      { date: dateInMonth(1, 10), type: "expense", cat: "Ropa",                amount: 89,    desc: "Zara - primavera" },
      { date: dateInMonth(1, 18), type: "expense", cat: "Salud",               amount: 50,    desc: "Médico privado" },
      { date: dateInMonth(1, 12), type: "expense", cat: "Salud",               amount: 18,    desc: "Farmacia" },
      { date: dateInMonth(1, 5),  type: "expense", cat: "Gimnasio",            amount: 40,    desc: "Cuota gimnasio abril" },

      // ── Mes actual (Mayo 2026) ────────────────────────────────────────────
      { date: dateInMonth(0, 1),  type: "income",  cat: "Nómina",              amount: 2800,  desc: "Nómina mayo" },
      { date: dateInMonth(0, 2),  type: "expense", cat: "Vivienda",            amount: 900,   desc: "Alquiler mayo" },
      { date: dateInMonth(0, 3),  type: "expense", cat: "Vivienda",            amount: 65,    desc: "Electricidad" },
      { date: dateInMonth(0, 3),  type: "expense", cat: "Suscripciones",       amount: 15.99, desc: "Netflix" },
      { date: dateInMonth(0, 3),  type: "expense", cat: "Suscripciones",       amount: 9.99,  desc: "Spotify" },
      { date: dateInMonth(0, 3),  type: "expense", cat: "Suscripciones",       amount: 4.99,  desc: "Amazon Prime" },
      { date: dateInMonth(0, 5),  type: "expense", cat: "Gimnasio",            amount: 40,    desc: "Cuota gimnasio mayo" },
      { date: dateInMonth(0, 6),  type: "expense", cat: "Alimentación",        amount: 120,   desc: "Mercadona" },
      { date: dateInMonth(0, 8),  type: "expense", cat: "Transporte",          amount: 60,    desc: "Gasolina" },
      { date: dateInMonth(0, 9),  type: "expense", cat: "Ocio & Restaurantes", amount: 45,    desc: "Restaurante sábado" },
      { date: daysAgo(2),         type: "expense", cat: "Alimentación",        amount: 95,    desc: "Supermercado + frutería" },
      { date: daysAgo(1),         type: "expense", cat: "Ocio & Restaurantes", amount: 25,    desc: "Cervezas con amigos" },
      { date: daysAgo(1),         type: "expense", cat: "Salud",               amount: 30,    desc: "Farmacia" },
    ];

    for (const tx of txDefs) {
      await Transaction.create({
        user: USER_ID,
        account: account._id,
        subAccount: sub._id,
        type: tx.type,
        category: tx.cat,
        amount: tx.amount,
        currency: "EUR",
        description: tx.desc,
        date: tx.date,
        business: null,
      });
    }
    console.log(`\n✅ ${txDefs.length} transacciones creadas`);
  }

  // ─── BUDGETS (mes actual) ────────────────────────────────────────────────────
  const budgetExisting = await Budget.countDocuments({ user: USER_ID, business: null });
  if (budgetExisting > 0) {
    console.log(`ℹ️  Presupuestos ya existen (${budgetExisting}). Omitiendo.`);
  } else {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const budgetDefs = [
      { cat: "Vivienda",            amount: 980  },
      { cat: "Alimentación",        amount: 400  },
      { cat: "Transporte",          amount: 150  },
      { cat: "Ocio & Restaurantes", amount: 200  },
      { cat: "Salud",               amount: 80   },
      { cat: "Suscripciones",       amount: 50   },
      { cat: "Ropa",                amount: 100  },
      { cat: "Gimnasio",            amount: 45   },
    ];

    for (const b of budgetDefs) {
      await Budget.create({
        user: USER_ID,
        name: b.cat,
        category: cats[b.cat]._id,
        amount: b.amount,
        currency: "EUR",
        period: "monthly",
        startDate: startOfMonth,
        endDate: endOfMonth,
        isActive: true,
        business: null,
        notifications: { enabled: true, threshold: 80 },
      });
    }
    console.log(`✅ ${budgetDefs.length} presupuestos creados (mes actual)`);
  }

  // ─── FORECASTS ───────────────────────────────────────────────────────────────
  const forecastExisting = await Forecast.countDocuments({ user: USER_ID, business: null });
  if (forecastExisting > 0) {
    console.log(`ℹ️  Previsiones ya existen (${forecastExisting}). Omitiendo.`);
  } else {
    const start = new Date(2024, 0, 1);
    const forecastDefs = [
      // Ingresos recurrentes
      { name: "Nómina",                cat: "Nómina",              type: "income",  amount: 2800,  freq: "monthly" },
      { name: "Freelance mensual",     cat: "Freelance",           type: "income",  amount: 300,   freq: "monthly" },
      // Gastos fijos
      { name: "Alquiler",              cat: "Vivienda",            type: "expense", amount: 900,   freq: "monthly" },
      { name: "Electricidad",          cat: "Vivienda",            type: "expense", amount: 65,    freq: "monthly" },
      { name: "Netflix",               cat: "Suscripciones",       type: "expense", amount: 15.99, freq: "monthly" },
      { name: "Spotify",               cat: "Suscripciones",       type: "expense", amount: 9.99,  freq: "monthly" },
      { name: "Amazon Prime",          cat: "Suscripciones",       type: "expense", amount: 4.99,  freq: "monthly" },
      { name: "Gimnasio",              cat: "Gimnasio",            type: "expense", amount: 40,    freq: "monthly" },
      { name: "Seguro coche",          cat: "Seguros",             type: "expense", amount: 120,   freq: "quarterly" },
      // Variables estimadas
      { name: "Alimentación",          cat: "Alimentación",        type: "expense", amount: 380,   freq: "monthly" },
      { name: "Transporte",            cat: "Transporte",          type: "expense", amount: 130,   freq: "monthly" },
      { name: "Ocio & Restaurantes",   cat: "Ocio & Restaurantes", type: "expense", amount: 180,   freq: "monthly" },
    ];

    for (const f of forecastDefs) {
      await Forecast.create({
        user: USER_ID,
        name: f.name,
        type: f.type,
        category: cats[f.cat]._id,
        amount: f.amount,
        currency: "EUR",
        frequency: f.freq,
        startDate: start,
        isActive: true,
        business: null,
      });
    }
    console.log(`✅ ${forecastDefs.length} previsiones creadas`);
  }

  console.log("\n🎉 Datos de finanzas personales listos para test-dca");
  console.log("   Cuenta: Banco Personal → Cuenta Corriente");
  console.log("   Meses con datos: marzo, abril y mayo 2026");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  mongoose.disconnect();
  process.exit(1);
});
