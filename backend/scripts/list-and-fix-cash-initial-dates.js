/**
 * Lista todas las subcuentas de efectivo (cash/savings) en la BBDD y opcionalmente
 * actualiza las de Ana a initialDate 15 de Octubre.
 *
 * La gráfica "Evolución del Patrimonio Total" usa initialDate de cada subcuenta
 * para mostrar el efectivo desde el día en que se añadió (por usuario/cuenta puede ser distinto).
 *
 * Uso:
 *   node scripts/list-and-fix-cash-initial-dates.js           # solo listar
 *   node scripts/list-and-fix-cash-initial-dates.js --fix-ana # listar y fijar Ana a 15 Oct
 *   node scripts/list-and-fix-cash-initial-dates.js --fix-ana --year=2024
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Account from "../models/Account.js";
import SubAccount from "../models/SubAccount.js";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "../.env") });

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/investments-manager";

// 15 Octubre por defecto para Ana (año por defecto 2024)
const ANA_INITIAL_DATE_DEFAULT = { month: 9, date: 15 }; // month 0-based

function parseArgs() {
  const args = process.argv.slice(2);
  const fixAna = args.includes("--fix-ana");
  const yearArg = args.find((a) => a.startsWith("--year="));
  const year = yearArg ? parseInt(yearArg.split("=")[1], 10) : 2024;
  return { fixAna, year };
}

async function main() {
  const { fixAna, year } = parseArgs();

  await mongoose.connect(MONGODB_URI);
  console.log("Conectado a MongoDB\n");

  const userIds = await SubAccount.distinct("user", {
    type: { $in: ["cash", "savings"] },
  });
  const accounts = await Account.find({ user: { $in: userIds } })
    .select("_id user name bankName")
    .lean();
  const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));

  console.log("=== SUBCUENTAS DE EFECTIVO (cash / savings) ===\n");

  for (const userId of userIds) {
    const user = await User.findOne({ id: userId }).select("id name").lean();
    const userName = user ? user.name : userId;

    const subAccounts = await SubAccount.find({
      user: userId,
      type: { $in: ["cash", "savings"] },
    })
      .sort({ account: 1, name: 1 })
      .lean();

    if (subAccounts.length === 0) continue;

    console.log(`--- Usuario: ${userName} (${userId}) ---`);
    let totalBalance = 0;
    for (const s of subAccounts) {
      const acc = accountById.get(String(s.account));
      const accName = acc ? `${acc.name || acc.bankName || ""}` : "?";
      const initialDateStr = s.initialDate
        ? new Date(s.initialDate).toISOString().split("T")[0]
        : "(sin initialDate)";
      totalBalance += Number(s.balance) || 0;
      console.log(
        `  _id: ${s._id}  name: "${s.name || ""}"  type: ${s.type}  balance: ${Number(s.balance) ?? 0}  initialDate: ${initialDateStr}  cuenta: ${accName}`,
      );
    }
    console.log(`  Total efectivo: ${totalBalance.toFixed(2)} €\n`);
  }

  if (fixAna) {
    const anaUserId = "ana";
    const anaUser = await User.findOne({ id: anaUserId })
      .select("id name")
      .lean();
    if (!anaUser) {
      console.log("Usuario 'ana' no encontrado. No se aplica --fix-ana.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const anaCashSubAccounts = await SubAccount.find({
      user: anaUserId,
      type: { $in: ["cash", "savings"] },
    });

    // Usar UTC para que se guarde 15 Oct (no 14 Oct por zona horaria)
    const targetDate = new Date(
      Date.UTC(
        year,
        ANA_INITIAL_DATE_DEFAULT.month,
        ANA_INITIAL_DATE_DEFAULT.date,
        12,
        0,
        0,
      ),
    );

    console.log(
      `=== Actualizando efectivos de Ana a initialDate ${targetDate.toISOString().split("T")[0]} (15 Octubre) ===\n`,
    );

    let updated = 0;
    for (const sub of anaCashSubAccounts) {
      const prev = sub.initialDate
        ? new Date(sub.initialDate).toISOString().split("T")[0]
        : null;
      if (
        !sub.initialDate ||
        new Date(sub.initialDate).toISOString().split("T")[0] !==
          targetDate.toISOString().split("T")[0]
      ) {
        sub.initialDate = targetDate;
        await sub.save();
        updated++;
        console.log(
          `  Actualizado: "${sub.name}"  initialDate ${prev ?? "null"} → ${targetDate.toISOString().split("T")[0]}`,
        );
      }
    }
    if (updated === 0) {
      console.log(
        "  Todas las subcuentas de Ana ya tenían initialDate 15 de Octubre.",
      );
    } else {
      console.log(`\n  Total subcuentas actualizadas: ${updated}`);
    }
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
