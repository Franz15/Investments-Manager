/**
 * Genera backend/data/defaultPortfolioFunds.json con todos los fondos del Excel.
 * Ejecutar desde la raíz del repo: node backend/scripts/generate-default-portfolio-funds.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const jsonPath = path.join(root, "frontend", "portfolio-excel-analysis.json");
const outPath = path.join(
  root,
  "backend",
  "data",
  "defaultPortfolioFunds.json",
);

const categories = [
  "Monetarios",
  "RF corto plazo",
  "RF medio plazo",
  "Renta Variable",
  "Renta Fija largo plazo",
  "ETFs",
  "Mixtos",
  "Alternativos",
  "Revisar",
];

const json = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const out = [];

for (const cat of categories) {
  const sheet = json.sheets[cat];
  if (!sheet || !sheet.data) continue;
  for (let i = 1; i < sheet.data.length; i++) {
    const row = sheet.data[i] || [];
    const name = row[0];
    if (!name || typeof name !== "string" || name.trim().length < 2) continue;
    out.push({
      name: (name || "").trim(),
      isin: (row[1] && String(row[1]).trim()) || null,
      link: (row[2] && String(row[2]).trim()) || null,
      volatility12M: (row[3] && String(row[3]).trim()) || null,
      return12M: (row[4] && String(row[4]).trim()) || null,
      notes:
        (row[6] || row[5]) && String(row[6] || row[5]).trim()
          ? String(row[6] || row[5]).trim()
          : null,
      category: cat,
    });
  }
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("Written", out.length, "funds to", outPath);
