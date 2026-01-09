import XLSX from "xlsx";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const excelPath = join(__dirname, "../../frontend/public/Fondos Javier.xlsx");
const workbook = XLSX.readFile(excelPath);
const sheet = workbook.Sheets["Cartera1"];

// Convertir a array de arrays
const range = XLSX.utils.decode_range(sheet["!ref"]);
const data = [];
for (let R = range.s.r; R <= range.s.r + 200; ++R) {
  const row = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
    const cell = sheet[cellAddress];
    row.push(cell ? cell.v : null);
  }
  data.push(row);
}

console.log("=== ANÁLISIS DE FONDOS RV EN EXCEL ===\n");

// Buscar la sección de RV
let inRV = false;
let rvDistribution = [];
let rvFunds = [];

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (!row) continue;

  // Detectar inicio de RV (buscar en columna 2)
  if (
    row[2] &&
    typeof row[2] === "string" &&
    (row[2].includes("Renta Variable") ||
      row[2].includes("3. Inversión a largo plazo") ||
      row[2].includes("Fondos Indexados"))
  ) {
    inRV = true;
    console.log(`Inicio de RV en fila ${i + 1}: "${row[2]}"`);
    continue;
  }

  // Detectar fin de RV
  if (
    inRV &&
    row[2] &&
    typeof row[2] === "string" &&
    (row[2].includes("Alternativos") || row[2].includes("5. Alternativos"))
  ) {
    console.log(`Fin de RV en fila ${i + 1}: "${row[2]}"\n`);
    break;
  }

  if (inRV) {
    // Mostrar todas las filas para debug (solo primeras 30 filas de RV)
    if (i < 65 && i > 30) {
      const nonEmptyCols = row
        .slice(0, 8)
        .map((val, idx) => {
          if (val === null || val === undefined || val === "") return null;
          const str = String(val);
          return `${idx}:${str.length > 30 ? str.substring(0, 30) + "..." : str}`;
        })
        .filter((v) => v)
        .join(" | ");
      if (nonEmptyCols) {
        console.log(`Fila ${i + 1}: ${nonEmptyCols}`);
      }
    }

    // Buscar distribución con porcentajes
    // La condición del código es: row[0] && row[1] && !isNaN(parseFloat(row[0])) && row[1].includes("%")
    const col0 = row[0];
    const col1 = row[1];
    const col2 = row[2];

    // Intentar parsear col0 como número
    const col0Num =
      col0 !== null && col0 !== undefined ? parseFloat(col0) : NaN;
    const col1Str = col1 !== null && col1 !== undefined ? String(col1) : "";

    // Verificar condición exacta del código
    if (
      col0 &&
      col1 &&
      !isNaN(col0Num) &&
      col1Str.includes("%") &&
      col2 &&
      typeof col2 === "string" &&
      col2.length > 3
    ) {
      rvDistribution.push({
        row: i + 1,
        amount: col0,
        percentage: col1,
        name: col2,
        isin: row[3] || "",
        link: row[4] || "",
        vol: row[5] || "",
        ret: row[6] || "",
      });
    }

    // Buscar fondos individuales (col 2 = nombre, verificar que tenga ISIN o link)
    if (col2 && typeof col2 === "string" && col2.length > 5) {
      const isHeader = [
        "Distribución",
        "Total",
        "RV",
        "Monetarios",
        "RF Corto",
        "RF Medio",
        "Alternativos",
        "Renta Variable",
        "3. Inversión a largo plazo",
      ].includes(col2);

      if (!isHeader) {
        const isin = row[3] || row[4];
        const link = row[4] || row[5];
        const vol = row[5] || row[6];
        const ret = row[6] || row[7];

        const hasIsin =
          isin &&
          typeof isin === "string" &&
          (isin.length === 12 || isin.length === 15);
        const hasLink =
          link &&
          typeof link === "string" &&
          (link.includes("http") ||
            link.includes("finect") ||
            link.includes("youtube") ||
            link.includes("justetf"));
        const hasData = (vol && vol !== "") || (ret && ret !== "");

        if (hasIsin || hasLink || hasData) {
          // Verificar que no esté ya en distribution
          const inDistribution = rvDistribution.some((d) => d.name === col2);
          if (!inDistribution) {
            rvFunds.push({
              row: i + 1,
              name: col2,
              isin: hasIsin ? isin : "",
              link: hasLink ? link : "",
              vol: vol || "",
              ret: ret || "",
            });
          }
        }
      }
    }
  }
}

console.log("FONDOS EN DISTRIBUCIÓN (con porcentajes):");
console.log("==========================================");
if (rvDistribution.length === 0) {
  console.log("No se encontraron fondos en distribución\n");
} else {
  rvDistribution.forEach((fund, idx) => {
    console.log(`${idx + 1}. ${fund.name}`);
    console.log(`   Porcentaje: ${fund.percentage}`);
    console.log(`   Amount: ${fund.amount}`);
    console.log(`   ISIN: ${fund.isin || "N/A"}`);
    console.log(`   Link: ${fund.link || "N/A"}`);
    console.log(`   Fila: ${fund.row}`);
    console.log("");
  });
}

console.log("\nFONDOS ADICIONALES (sin porcentajes específicos):");
console.log("==================================================");
if (rvFunds.length === 0) {
  console.log("No se encontraron fondos adicionales\n");
} else {
  rvFunds.forEach((fund, idx) => {
    console.log(`${idx + 1}. ${fund.name}`);
    console.log(`   ISIN: ${fund.isin || "N/A"}`);
    console.log(`   Link: ${fund.link || "N/A"}`);
    console.log(`   Vol: ${fund.vol || "N/A"}`);
    console.log(`   Ret: ${fund.ret || "N/A"}`);
    console.log(`   Fila: ${fund.row}`);
    console.log("");
  });
}

console.log(
  `\nTOTAL: ${rvDistribution.length} fondos en distribución + ${rvFunds.length} fondos adicionales = ${rvDistribution.length + rvFunds.length} fondos RV`,
);

// Calcular suma de porcentajes
if (rvDistribution.length > 0) {
  const totalPercentage = rvDistribution.reduce((sum, fund) => {
    const pct =
      parseFloat(String(fund.percentage).replace("%", "").replace(",", ".")) ||
      0;
    return sum + pct;
  }, 0);
  console.log(
    `\nSuma de porcentajes en distribución: ${totalPercentage.toFixed(1)}%`,
  );
}
