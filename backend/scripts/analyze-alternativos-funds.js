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

console.log("=== ANÁLISIS DE INVERSIONES ALTERNATIVAS EN EXCEL ===\n");

// Buscar la sección de Alternativos
let inAlternativos = false;
let alternativosFunds = [];

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (!row) continue;

  // Detectar inicio de Alternativos (buscar en columna 2 o 3)
  const cellValue = row[2] || row[3];
  if (
    cellValue &&
    typeof cellValue === "string" &&
    (cellValue.includes("Alternativos") ||
      cellValue.includes("5. Alternativos") ||
      cellValue === "Alternativos" ||
      cellValue === "5. Alternativos")
  ) {
    inAlternativos = true;
    console.log(`Inicio de Alternativos en fila ${i + 1}: "${cellValue}"`);
    continue;
  }

  // Detectar fin de Alternativos (buscar siguiente sección o fin del documento)
  // No romper, solo mostrar hasta encontrar otra sección principal
  if (
    inAlternativos &&
    row[2] &&
    typeof row[2] === "string" &&
    (row[2].includes("Revisar") ||
      row[2].includes("6.") ||
      row[2].includes("Pestañas"))
  ) {
    console.log(`Fin de Alternativos en fila ${i + 1}: "${row[2]}"\n`);
    // No hacer break, seguir procesando
  }

  if (inAlternativos) {
    // Mostrar todas las filas de Alternativos para debug
    const nonEmptyCols = row
      .slice(0, 10)
      .map((val, idx) => {
        if (val === null || val === undefined || val === "") return null;
        const str = String(val);
        return `${idx}:${str.length > 50 ? str.substring(0, 50) + "..." : str}`;
      })
      .filter((v) => v)
      .join(" | ");
    if (nonEmptyCols) {
      console.log(`Fila ${i + 1}: ${nonEmptyCols}`);
    }

    // Buscar fondos de Alternativos
    // Según el código: currentSection.number === 5 && cellValue && !isUrl(cellValue) && cellValue.length > 10
    // Pero también puede estar en la tabla de asignación detallada (columna 3)
    const col2 = row[2];
    const col3 = row[3];

    // Buscar en columna 3 (tabla de asignación detallada)
    if (col3 && typeof col3 === "string" && col3.length > 10) {
      // Verificar que no sea una URL
      const isUrl =
        col3.includes("http") ||
        col3.includes("youtu.be") ||
        col3.includes("youtube.com") ||
        col3.includes("finect.com") ||
        col3.includes("justetf.com");

      if (!isUrl) {
        const isin = row[4];
        const link = row[5];
        const vol = row[6];
        const ret = row[7];
        const amount = row[8];

        // Verificar que tenga ISIN o link para confirmar que es un fondo
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

        // Verificar que no sea un header o texto descriptivo
        const isHeader = [
          "Alternativos",
          "5. Alternativos",
          "Distribución",
          "Total",
          "RV",
          "Monetarios",
          "RF Corto",
          "RF Medio",
          "riesgo alto",
          "riesgo medio",
          "riesgo bajo",
        ].includes(col3);

        if ((hasIsin || hasLink) && !isHeader) {
          // Verificar que no esté ya agregado
          const exists = alternativosFunds.some(
            (f) => f.name === col3 && f.row === i + 1,
          );
          if (!exists) {
            alternativosFunds.push({
              row: i + 1,
              name: col3,
              isin: hasIsin ? isin : "",
              link: hasLink ? link : "",
              vol: vol || "",
              ret: ret || "",
              amount: amount || "",
            });
          }
        }
      }
    }

    // También buscar en columna 2 (estructura similar a otras secciones)
    if (col2 && typeof col2 === "string" && col2.length > 10) {
      // Verificar que no sea una URL
      const isUrl =
        col2.includes("http") ||
        col2.includes("youtu.be") ||
        col2.includes("youtube.com") ||
        col2.includes("finect.com") ||
        col2.includes("justetf.com");

      if (!isUrl) {
        const isin = row[4] || row[3];
        const link = row[5] || row[4];
        const vol = row[6] || row[5];
        const ret = row[7] || row[6];
        const amount = row[8] || row[7];

        // Verificar que tenga ISIN o link para confirmar que es un fondo
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

        // Verificar que no sea un header o texto descriptivo
        const isHeader = [
          "Alternativos",
          "5. Alternativos",
          "Distribución",
          "Total",
          "RV",
          "Monetarios",
          "RF Corto",
          "RF Medio",
          "riesgo alto",
          "riesgo medio",
          "riesgo bajo",
        ].includes(col2);

        if ((hasIsin || hasLink) && !isHeader) {
          // Verificar que no esté ya agregado
          const exists = alternativosFunds.some(
            (f) => f.name === col2 && f.row === i + 1,
          );
          if (!exists) {
            alternativosFunds.push({
              row: i + 1,
              name: col2,
              isin: hasIsin ? isin : "",
              link: hasLink ? link : "",
              vol: vol || "",
              ret: ret || "",
              amount: amount || "",
            });
          }
        }
      }
    }
  }
}

console.log("\n\nFONDOS DE INVERSIONES ALTERNATIVAS:");
console.log("====================================");
if (alternativosFunds.length === 0) {
  console.log("No se encontraron fondos de inversiones alternativas\n");
} else {
  alternativosFunds.forEach((fund, idx) => {
    console.log(`${idx + 1}. ${fund.name}`);
    console.log(`   ISIN: ${fund.isin || "N/A"}`);
    console.log(`   Link: ${fund.link || "N/A"}`);
    console.log(`   Vol: ${fund.vol || "N/A"}`);
    console.log(`   Ret: ${fund.ret || "N/A"}`);
    console.log(`   Amount: ${fund.amount || "N/A"}`);
    console.log(`   Fila: ${fund.row}`);
    console.log("");
  });
}

console.log(
  `\nTOTAL: ${alternativosFunds.length} fondos de inversiones alternativas`,
);
