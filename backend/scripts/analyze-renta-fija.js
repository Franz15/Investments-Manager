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

console.log("=== ANÁLISIS DE RENTA FIJA EN EXCEL ===\n");

// Buscar la sección de Renta Fija
let inRentaFija = false;
let rentaFijaInfo = {
  description: null,
  note: null,
  subsections: [],
};

for (let i = 0; i < data.length; i++) {
  const row = data[i];
  if (!row) continue;

  // Detectar inicio de Renta Fija
  if (
    row[2] &&
    typeof row[2] === "string" &&
    (row[2].includes("4. Renta Fija") || row[2].includes("Bonos"))
  ) {
    inRentaFija = true;
    console.log(`Inicio de Renta Fija en fila ${i + 1}: "${row[2]}"`);
    continue;
  }

  // Detectar fin de Renta Fija
  if (
    inRentaFija &&
    row[2] &&
    typeof row[2] === "string" &&
    (row[2].includes("5. Alternativos") || row[2].includes("Alternativos"))
  ) {
    console.log(`Fin de Renta Fija en fila ${i + 1}: "${row[2]}"\n`);
    break;
  }

  if (inRentaFija) {
    // Mostrar todas las filas de Renta Fija
    const nonEmptyCols = row
      .slice(0, 8)
      .map((val, idx) => {
        if (val === null || val === undefined || val === "") return null;
        const str = String(val);
        return `${idx}:${str.length > 60 ? str.substring(0, 60) + "..." : str}`;
      })
      .filter((v) => v)
      .join(" | ");
    if (nonEmptyCols) {
      console.log(`Fila ${i + 1}: ${nonEmptyCols}`);
    }

    // Buscar descripciones y notas
    const col2 = row[2];
    if (col2 && typeof col2 === "string") {
      // Nota sobre "Deja de ser atractiva"
      if (col2.includes("Deja de ser")) {
        rentaFijaInfo.note = col2;
        console.log(`\n>>> NOTA ENCONTRADA: "${col2}"`);
      }
      // Descripciones largas
      if (
        col2.length > 50 &&
        !col2.includes("http") &&
        !col2.includes("youtu")
      ) {
        if (
          !rentaFijaInfo.description &&
          !col2.includes("RF Corto") &&
          !col2.includes("RF Medio")
        ) {
          rentaFijaInfo.description = col2;
          console.log(`\n>>> DESCRIPCIÓN ENCONTRADA: "${col2}"`);
        }
      }
      // Subsecciones
      if (col2 === "RF Corto Plazo" || col2 === "RF Medio Plazo") {
        const subDesc = row[3] || "";
        rentaFijaInfo.subsections.push({
          name: col2,
          description: subDesc,
          row: i + 1,
        });
        console.log(`\n>>> SUBSECCIÓN: ${col2} - "${subDesc}"`);
      }
    }
  }
}

console.log("\n\nRESUMEN DE RENTA FIJA:");
console.log("====================");
console.log(
  `Descripción principal: ${rentaFijaInfo.description || "No encontrada"}`,
);
console.log(`Nota: ${rentaFijaInfo.note || "No encontrada"}`);
console.log(`\nSubsecciones encontradas: ${rentaFijaInfo.subsections.length}`);
rentaFijaInfo.subsections.forEach((sub, idx) => {
  console.log(`\n${idx + 1}. ${sub.name}`);
  console.log(`   Descripción: ${sub.description || "N/A"}`);
  console.log(`   Fila: ${sub.row}`);
});
