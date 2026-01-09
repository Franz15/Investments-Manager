import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const excelPath = path.join(__dirname, "../../frontend/Fondos Javier.xlsx");

if (!fs.existsSync(excelPath)) {
  console.error("Archivo no encontrado:", excelPath);
  process.exit(1);
}

console.log("Leyendo archivo Excel...");
const workbook = XLSX.readFile(excelPath);

console.log("\n=== INFORMACIÓN DEL LIBRO ===");
console.log("Número de hojas:", workbook.SheetNames.length);
console.log("Nombres de hojas:", workbook.SheetNames);

workbook.SheetNames.forEach((sheetName, index) => {
  console.log(`\n=== HOJA ${index + 1}: ${sheetName} ===`);
  const worksheet = workbook.Sheets[sheetName];

  // Obtener el rango de celdas
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  console.log(`Rango: ${worksheet["!ref"]}`);
  console.log(`Filas: ${range.e.r + 1}, Columnas: ${range.e.c + 1}`);

  // Leer como JSON para ver la estructura
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  // Mostrar primeras filas
  console.log("\nPrimeras 20 filas:");
  jsonData.slice(0, 20).forEach((row, i) => {
    if (row.some((cell) => cell !== null)) {
      console.log(`Fila ${i + 1}:`, row);
    }
  });

  // Buscar fórmulas
  const formulas = [];
  for (let cellAddress in worksheet) {
    if (cellAddress.startsWith("!")) continue;
    const cell = worksheet[cellAddress];
    if (cell.f) {
      formulas.push({
        cell: cellAddress,
        formula: cell.f,
        value: cell.v,
      });
    }
  }

  if (formulas.length > 0) {
    console.log(`\nFórmulas encontradas (${formulas.length}):`);
    formulas.slice(0, 10).forEach((f) => {
      console.log(`  ${f.cell}: ${f.formula} = ${f.value}`);
    });
    if (formulas.length > 10) {
      console.log(`  ... y ${formulas.length - 10} más`);
    }
  }

  // Buscar celdas con formato especial
  const mergedCells = worksheet["!merges"] || [];
  if (mergedCells.length > 0) {
    console.log(`\nCeldas combinadas: ${mergedCells.length}`);
    mergedCells.slice(0, 5).forEach((merge) => {
      console.log(`  ${XLSX.utils.encode_range(merge)}`);
    });
  }
});

// Guardar un resumen en JSON
const summary = {
  sheetNames: workbook.SheetNames,
  sheets: {},
};

workbook.SheetNames.forEach((sheetName) => {
  const worksheet = workbook.Sheets[sheetName];
  const jsonData = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  // Buscar todas las fórmulas
  const formulas = {};
  for (let cellAddress in worksheet) {
    if (cellAddress.startsWith("!")) continue;
    const cell = worksheet[cellAddress];
    if (cell.f) {
      formulas[cellAddress] = {
        formula: cell.f,
        value: cell.v,
      };
    }
  }

  summary.sheets[sheetName] = {
    data: jsonData,
    formulas: formulas,
    range: worksheet["!ref"],
    merges: worksheet["!merges"] || [],
  };
});

fs.writeFileSync(
  path.join(__dirname, "../../frontend/portfolio-excel-analysis.json"),
  JSON.stringify(summary, null, 2),
);

console.log("\n=== ANÁLISIS COMPLETO ===");
console.log("Resumen guardado en: frontend/portfolio-excel-analysis.json");
