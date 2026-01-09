import React, { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import { useTranslation } from "../contexts/TranslationContext";
import { useTheme } from "../contexts/ThemeContext";
import LoadingSpinner from "../components/LoadingSpinner";
import api from "../services/api";
import {
  ExternalLink,
  Home,
  PiggyBank,
  TrendingUp,
  DollarSign,
  Info,
  Calculator,
  Play,
  Building2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Layers,
} from "lucide-react";

const PortfolioBuilder = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [excelData, setExcelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [expandedSections, setExpandedSections] = useState(
    new Set(["calculator"]),
  );
  const [expandedVideos, setExpandedVideos] = useState(new Set());

  // Estado para la tabla de cálculos interactiva
  const [calculatorData, setCalculatorData] = useState({
    totalAmount: 120000,
    categories: [
      {
        name: "Monetarios",
        expectedReturn: 2.0,
        weight: 0,
        description: t("portfolioBuilder.categories.descriptions.monetarios"),
      },
      {
        name: "RF Corto",
        expectedReturn: 4.0,
        weight: 40,
        description: t("portfolioBuilder.categories.descriptions.rfCorto"),
      },
      {
        name: "RF Medio",
        expectedReturn: 5.5,
        weight: 25,
        description: t("portfolioBuilder.categories.descriptions.rfMedio"),
      },
      {
        name: "RV",
        expectedReturn: 9.0,
        weight: 25,
        description: t("portfolioBuilder.categories.descriptions.rv"),
      },
      {
        name: "Alternativos",
        expectedReturn: 5.0,
        weight: 10,
        description: t("portfolioBuilder.categories.descriptions.alternativos"),
      },
    ],
  });

  // Cargar el archivo Excel al montar el componente
  useEffect(() => {
    const loadExcelFile = async () => {
      try {
        setLoading(true);
        const response = await fetch("/Fondos Javier.xlsx");
        if (!response.ok) {
          throw new Error("No se pudo cargar el archivo Excel");
        }
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });

        const sheets = {};
        workbook.SheetNames.forEach((sheetName) => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: null,
            raw: false,
          });

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

          sheets[sheetName] = {
            data: jsonData,
            formulas: formulas,
            range: worksheet["!ref"],
            merges: worksheet["!merges"] || [],
          };
        });

        setExcelData({
          workbook,
          sheets,
          sheetNames: workbook.SheetNames,
        });

        // Procesar y estructurar los datos de Cartera1
        const processedData = processCarteraData(sheets["Cartera1"]);
        setPortfolioData(processedData);

        // Inicializar calculadora con datos del Excel
        if (processedData && processedData.portfolioAllocation) {
          const allocation = processedData.portfolioAllocation;
          const totalAmount = allocation.totalAmountCalculated || 120000;

          const categories = allocation.categories.map((cat) => ({
            name: cat.name,
            expectedReturn: cat.expectedReturn
              ? parseFloat(cat.expectedReturn.replace("%", ""))
              : 0,
            weight: cat.weight ? parseFloat(cat.weight.replace("%", "")) : 0,
            description: cat.description || "",
          }));

          setCalculatorData({
            totalAmount: totalAmount,
            categories:
              categories.length > 0 ? categories : calculatorData.categories,
          });
        }

        // Sincronizar fondos con MongoDB
        syncFundsToDatabase(sheets);
      } catch (err) {
        setError(`${t("portfolioBuilder.errors.loadExcel")}: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    loadExcelFile();
  }, []);

  // Función para procesar y estructurar los datos de Cartera1
  const processCarteraData = (sheet) => {
    if (!sheet || !sheet.data) return null;

    const data = {
      sections: [],
      portfolioAllocation: null,
      detailedAllocation: {},
    };

    let currentSection = null;
    let inAllocationTable = false;

    for (let i = 0; i < sheet.data.length; i++) {
      const row = sheet.data[i];
      if (!row) continue;

      const rowText = row.join(" ").trim();

      // Detectar secciones principales
      if (row[2] && typeof row[2] === "string") {
        const cellValue = row[2].trim();

        // Sección 2: Ahorro remunerado / Fondo Monetarios
        if (
          cellValue.includes("2. Ahorro remunerado") ||
          cellValue.includes("Fondo Monetarios")
        ) {
          currentSection = {
            number: 2,
            title: t("portfolioBuilder.sections.monetarios.title"),
            icon: PiggyBank,
            description: "",
            funds: [],
            tips: [],
            videos: [],
          };
          data.sections.push(currentSection);
        }
        // Sección 3: Inversión a largo plazo
        else if (
          cellValue.includes("3. Inversión a largo plazo") ||
          cellValue.includes("Fondos Indexados")
        ) {
          currentSection = {
            number: 3,
            title: t("portfolioBuilder.sections.rentaVariable.title"),
            icon: TrendingUp,
            description: "",
            totalAmount: null,
            distribution: [],
            funds: [],
            tips: [],
            videos: [],
          };
          data.sections.push(currentSection);
        }
        // Sección 4: Renta Fija
        else if (
          cellValue.includes("4. Renta Fija") ||
          cellValue.includes("Bonos")
        ) {
          currentSection = {
            number: 4,
            title: t("portfolioBuilder.sections.rentaFija.title"),
            icon: DollarSign,
            description: "",
            note: "",
            subsections: [],
            videos: [],
          };
          data.sections.push(currentSection);
        }
        // Subsección RF Corto Plazo
        else if (cellValue === "RF Corto Plazo") {
          if (currentSection && currentSection.number === 4) {
            currentSection.subsections = currentSection.subsections || [];
            currentSection.subsections.push({
              name: t(
                "portfolioBuilder.sections.subsections.rfCortoPlazo.name",
              ),
              description: t(
                "portfolioBuilder.sections.subsections.rfCortoPlazo.description",
              ),
              funds: [],
            });
          }
        }
        // Subsección RF Medio Plazo
        else if (cellValue === "RF Medio Plazo") {
          if (currentSection && currentSection.number === 4) {
            currentSection.subsections = currentSection.subsections || [];
            currentSection.subsections.push({
              name: t(
                "portfolioBuilder.sections.subsections.rfMedioPlazo.name",
              ),
              description: t(
                "portfolioBuilder.sections.subsections.rfMedioPlazo.description",
              ),
              funds: [],
            });
          }
        }
        // Sección 5: Alternativos
        else if (cellValue === "Alternativos" && !inAllocationTable) {
          // Verificar que no estamos en la tabla de asignación
          const prevRow = i > 0 ? sheet.data[i - 1] : null;
          if (!prevRow || !prevRow[3] || prevRow[3] !== "Retorno esperado") {
            currentSection = {
              number: 5,
              title: t("portfolioBuilder.sections.alternativos.title"),
              icon: Layers,
              description: t(
                "portfolioBuilder.sections.alternativos.description",
              ),
              funds: [],
              videos: [],
            };
            data.sections.push(currentSection);
          }
        }
        // Tabla de asignación de cartera
        else if (
          cellValue === "Retorno esperado" ||
          cellValue === "Monetarios"
        ) {
          inAllocationTable = true;
        }
        // Procesar contenido según la sección actual
        else if (currentSection) {
          // Videos
          if (isUrl(cellValue)) {
            if (cellValue.includes("youtu")) {
              currentSection.videos = currentSection.videos || [];
              currentSection.videos.push({
                url: cellValue,
                description: row[4] || row[5] || "",
              });
            } else if (currentSection.funds) {
              // Link de fondo
              const fundIndex = currentSection.funds.length - 1;
              if (fundIndex >= 0 && !currentSection.funds[fundIndex].link) {
                currentSection.funds[fundIndex].link = cellValue;
              }
            }
          }
          // Descripciones y tips
          else if (cellValue.length > 50 && !isUrl(cellValue)) {
            if (
              cellValue.includes("Máxima rentabilidad") ||
              cellValue.includes("Inversión en empresas")
            ) {
              // Guardar el texto original, se traducirá al mostrar
              currentSection.description = cellValue;
            } else if (
              cellValue.includes("En caso de caidas") ||
              cellValue.includes("Siempre y cuando")
            ) {
              // Guardar el texto original, se traducirá al mostrar
              currentSection.tips = currentSection.tips || [];
              currentSection.tips.push(cellValue);
            } else if (
              currentSection.number === 4 &&
              cellValue.includes("Deja de ser")
            ) {
              // Guardar el texto original, se traducirá al mostrar
              currentSection.note = cellValue;
            }
          }
          // Fondos monetarios (estructura: Nombre en col 2, ISIN en col 3, Link en col 4, Vol en col 5, R en col 6, Notes en col 7)
          else if (
            currentSection.number === 2 &&
            cellValue &&
            !isUrl(cellValue) &&
            cellValue.length > 10
          ) {
            const isin = row[3];
            const link = row[4];
            const vol = row[5];
            const ret = row[6];
            const notes = row[7];

            // Verificar que tenga ISIN o link para confirmar que es un fondo
            if (
              (isin &&
                typeof isin === "string" &&
                (isin.length === 12 || isin.length === 15)) ||
              (link && isUrl(link))
            ) {
              currentSection.funds = currentSection.funds || [];
              currentSection.funds.push({
                name: cellValue,
                isin: isin || null,
                link: link || null,
                volatility12M: vol || null,
                return12M: ret || null,
                notes: notes || null,
              });
            }
          }
          // Fondos de RV
          else if (currentSection.number === 3) {
            // Total amount
            if (row[0] && !isNaN(parseFloat(row[0]))) {
              currentSection.totalAmount = parseFloat(row[0]);
            }
            // Distribución (tabla con porcentajes)
            // Los porcentajes pueden venir como "20%" o como decimal 0.2
            const col0 = row[0];
            const col1 = row[1];
            const col1Num =
              col1 !== null && col1 !== undefined ? parseFloat(col1) : NaN;
            const col1Str =
              col1 !== null && col1 !== undefined ? String(col1) : "";
            const isPercentage =
              col1Str.includes("%") ||
              (!isNaN(col1Num) && col1Num > 0 && col1Num <= 1);

            if (col0 && col1 && !isNaN(parseFloat(col0)) && isPercentage) {
              currentSection.distribution = currentSection.distribution || [];
              const fundName = row[2];
              const isin = row[3];
              const link = row[4];
              const vol = row[5];
              const ret = row[6];
              const amount = getCellValueFromFormula(sheet, i, 7) || row[7];

              if (fundName) {
                // Convertir decimal a porcentaje si es necesario (0.2 -> "20%")
                let percentage = col1Str;
                if (!col1Str.includes("%") && !isNaN(col1Num) && col1Num <= 1) {
                  percentage = `${(col1Num * 100).toFixed(0)}%`;
                }

                currentSection.distribution.push({
                  amount: parseFloat(col0),
                  percentage: percentage,
                  name: fundName,
                  isin: isin || null,
                  link: link || null,
                  volatility12M: vol || null,
                  return12M: ret || null,
                  calculatedAmount: amount,
                });
              }
            }
            // Fondos individuales de RV (no en tabla de distribución)
            else if (cellValue && !isUrl(cellValue) && cellValue.length > 5) {
              const isHeader = [
                "Distribución",
                "Total",
                "RV",
                "Monetarios",
                "RF Corto",
                "RF Medio",
                "Alternativos",
              ].includes(cellValue);

              if (!isHeader) {
                const isin = row[3] || row[4];
                const link = row[4] || row[5];
                const vol = row[5] || row[6];
                const ret = row[6] || row[7];

                const hasIsin =
                  isin &&
                  typeof isin === "string" &&
                  (isin.length === 12 || isin.length === 15);
                const hasLink = link && isUrl(link);
                const hasData = vol || ret;

                // Agregar si tiene ISIN, link, o datos relacionados
                if (hasIsin || hasLink || hasData) {
                  // Verificar si el fondo ya existe (en distribution o funds) para evitar duplicados
                  const existsInDistribution =
                    currentSection.distribution?.some(
                      (f) => f.name === cellValue,
                    );
                  const existsInFunds = currentSection.funds?.some(
                    (f) => f.name === cellValue,
                  );

                  if (!existsInDistribution && !existsInFunds) {
                    currentSection.funds = currentSection.funds || [];
                    currentSection.funds.push({
                      name: cellValue,
                      isin: hasIsin ? isin : null,
                      link: hasLink ? link : null,
                      volatility12M: vol || null,
                      return12M: ret || null,
                    });
                  }
                }
              }
            }
          }
          // Fondos de Alternativos
          // Pueden estar en columna 2 (cellValue) o en columna 3 (tabla de asignación detallada)
          else if (currentSection.number === 5) {
            let fundAdded = false;

            // Buscar en columna 2
            if (cellValue && !isUrl(cellValue) && cellValue.length > 10) {
              const isin = row[4] || row[3];
              const link = row[5] || row[4];
              const vol = row[6] || row[5];
              const ret = row[7] || row[6];
              const amount =
                getCellValueFromFormula(sheet, i, 8) || row[8] || row[7];

              // Limpiar ISIN antes de verificar
              const isinClean =
                isin && typeof isin === "string" ? String(isin).trim() : null;
              const hasIsin =
                isinClean &&
                (isinClean.length === 12 || isinClean.length === 15);

              if (hasIsin || (link && isUrl(link))) {
                // Verificar que no exista ya
                const exists = currentSection.funds?.some(
                  (f) => f.name === cellValue,
                );
                if (!exists) {
                  currentSection.funds = currentSection.funds || [];
                  currentSection.funds.push({
                    name: cellValue,
                    isin: hasIsin ? isinClean : null,
                    link: link || null,
                    volatility12M: vol || null,
                    return12M: ret || null,
                    amount: amount
                      ? typeof amount === "string"
                        ? parseFloat(amount.replace(/[^\d.-]/g, ""))
                        : parseFloat(amount)
                      : null,
                  });
                  fundAdded = true;
                }
              }
            }

            // También buscar en columna 3 (tabla de asignación detallada) si no se agregó en columna 2
            if (
              !fundAdded &&
              row[3] &&
              typeof row[3] === "string" &&
              row[3].length > 10 &&
              !isUrl(row[3])
            ) {
              const fundName = row[3];
              const isin = row[4];
              const link = row[5];
              const vol = row[6];
              const ret = row[7];
              const amount = getCellValueFromFormula(sheet, i, 8) || row[8];

              // Verificar que no sea un header
              const isHeader = [
                "Alternativos",
                "Monetarios",
                "RF Corto",
                "RF Medio",
                "RV",
                "Distribución",
                "Total",
              ].includes(fundName);

              if (!isHeader) {
                // Limpiar ISIN antes de verificar
                const isinClean =
                  isin && typeof isin === "string" ? String(isin).trim() : null;
                const hasIsin =
                  isinClean &&
                  (isinClean.length === 12 || isinClean.length === 15);
                const hasLink = link && isUrl(link);

                if (hasIsin || hasLink) {
                  // Verificar que no exista ya
                  const exists = currentSection.funds?.some(
                    (f) => f.name === fundName,
                  );
                  if (!exists) {
                    currentSection.funds = currentSection.funds || [];
                    currentSection.funds.push({
                      name: fundName,
                      isin: hasIsin ? isinClean : null,
                      link: hasLink ? link : null,
                      volatility12M: vol || null,
                      return12M: ret || null,
                      amount: amount
                        ? typeof amount === "string"
                          ? parseFloat(amount.replace(/[^\d.-]/g, ""))
                          : parseFloat(amount)
                        : null,
                    });
                  }
                }
              }
            }
          }
        }
      }

      // Procesar tabla de asignación de cartera
      if (inAllocationTable && row[3]) {
        const category = row[3];
        if (category && typeof category === "string") {
          if (!data.portfolioAllocation) {
            data.portfolioAllocation = {
              totalAmount: null,
              categories: [],
              totalReturn: null,
              totalAmountCalculated: null,
            };
          }

          // Detectar categorías válidas
          if (
            [
              "Monetarios",
              "RF Corto",
              "RF Medio",
              "RV",
              "Alternativos",
            ].includes(category)
          ) {
            const expectedReturn = row[4];
            const weight = row[5];
            const portfolioReturn = row[6];
            const amount = getCellValueFromFormula(sheet, i, 7) || row[7];
            const description = row[8];

            data.portfolioAllocation.categories.push({
              name: category,
              expectedReturn: expectedReturn || null,
              weight: weight || null,
              portfolioReturn: portfolioReturn || null,
              amount: amount
                ? typeof amount === "string"
                  ? parseFloat(amount.replace(/[^\d.-]/g, ""))
                  : parseFloat(amount)
                : null,
              description: description || null,
            });
          }
          // Detectar total (fila con porcentaje alto en columna 6)
          else if (
            row[6] &&
            typeof row[6] === "string" &&
            row[6].includes("%") &&
            parseFloat(row[6].replace("%", "")) > 1
          ) {
            const totalReturn = row[6];
            const totalAmount = getCellValueFromFormula(sheet, i, 7);
            if (totalReturn) {
              data.portfolioAllocation.totalReturn = totalReturn;
              if (totalAmount) {
                data.portfolioAllocation.totalAmountCalculated =
                  typeof totalAmount === "string"
                    ? parseFloat(totalAmount.replace(/[^\d.-]/g, ""))
                    : parseFloat(totalAmount);
              }
            }
          }
        }
      }

      // Procesar asignación detallada por categorías (buscar patrones específicos)
      if (row[3] && typeof row[3] === "string") {
        const categoryNames = [
          "Monetarios",
          "RF Corto",
          "RF Medio",
          "RV",
          "Alternativos",
        ];
        const isCategoryHeader = categoryNames.includes(row[3]);

        if (isCategoryHeader) {
          const category = row[3];
          if (!data.detailedAllocation[category]) {
            data.detailedAllocation[category] = {
              totalAmount: null,
              funds: [],
            };
          }
          // Total de la categoría (siguiente fila, columna 4)
          const nextRow = sheet.data[i + 1];
          if (
            nextRow &&
            nextRow[4] &&
            !isNaN(parseFloat(nextRow[4])) &&
            parseFloat(nextRow[4]) > 1000
          ) {
            data.detailedAllocation[category].totalAmount = parseFloat(
              nextRow[4],
            );
          }

          // También agregar fondos a las subsecciones de Renta Fija
          if (
            (category === "RF Corto" || category === "RF Medio") &&
            data.sections.length > 0
          ) {
            const rentaFijaSection = data.sections.find((s) => s.number === 4);
            if (rentaFijaSection) {
              rentaFijaSection.subsections = rentaFijaSection.subsections || [];
              let subsection = rentaFijaSection.subsections.find(
                (sub) =>
                  sub.name ===
                  (category === "RF Corto"
                    ? "Renta Fija Corto Plazo"
                    : "Renta Fija Medio Plazo"),
              );
              if (!subsection) {
                subsection = {
                  name:
                    category === "RF Corto"
                      ? t(
                          "portfolioBuilder.sections.subsections.rfCortoPlazo.name",
                        )
                      : t(
                          "portfolioBuilder.sections.subsections.rfMedioPlazo.name",
                        ),
                  description:
                    category === "RF Corto"
                      ? t(
                          "portfolioBuilder.sections.subsections.rfCortoPlazo.description",
                        )
                      : t(
                          "portfolioBuilder.sections.subsections.rfMedioPlazo.description",
                        ),
                  funds: [],
                };
                rentaFijaSection.subsections.push(subsection);
              } else if (
                category === "RF Corto" &&
                subsection.description &&
                subsection.description.length < 100
              ) {
                // Actualizar la descripción si ya existe pero es corta
                subsection.description = t(
                  "portfolioBuilder.sections.subsections.rfCortoPlazo.description",
                );
              }
            }
          }

          // También agregar fondos a la sección de Alternativos
          if (category === "Alternativos" && data.sections.length > 0) {
            let alternativosSection = data.sections.find((s) => s.number === 5);
            if (!alternativosSection) {
              alternativosSection = {
                number: 5,
                title: t("portfolioBuilder.sections.alternativos.title"),
                icon: Layers,
                description: t(
                  "portfolioBuilder.sections.alternativos.description",
                ),
                funds: [],
                videos: [],
              };
              data.sections.push(alternativosSection);
            }
          }
        }

        // Fondos individuales (tienen ISIN o link en columnas específicas)
        // Para RF Corto/RF Medio: col 2 = riesgo, col 3 = nombre, col 4 = ISIN, col 5 = link
        // Para otros: col 3 = nombre, col 4 = ISIN/link, col 5 = link/ISIN
        const hasRisk =
          row[2] && typeof row[2] === "string" && row[2].includes("riesgo");
        const fundNameRF = hasRisk ? row[3] : row[3];
        // Limpiar ISIN antes de verificar (eliminar espacios)
        const isinCol4 =
          row[4] && typeof row[4] === "string" ? String(row[4]).trim() : null;
        const hasIsin =
          isinCol4 && (isinCol4.length === 12 || isinCol4.length === 15);
        const hasLink = row[4] && isUrl(row[4]);
        const fundName = fundNameRF;

        if (
          fundName &&
          typeof fundName === "string" &&
          fundName.length > 10 &&
          !categoryNames.includes(fundName) &&
          !fundName.includes("riesgo") &&
          (hasIsin || hasLink || (row[4] && isUrl(row[4])) || hasRisk)
        ) {
          // Determinar categoría por contexto (buscar hacia atrás)
          let category = null;
          for (let j = i; j >= Math.max(0, i - 20); j--) {
            const prevRow = sheet.data[j];
            if (prevRow && prevRow[3] && categoryNames.includes(prevRow[3])) {
              category = prevRow[3];
              break;
            }
          }

          if (category) {
            if (!data.detailedAllocation[category]) {
              data.detailedAllocation[category] = {
                totalAmount: null,
                funds: [],
              };
            }

            // Para RF Corto y RF Medio, la estructura puede variar
            let isin, link, vol, ret, amount, risk;

            if (category === "RF Corto" || category === "RF Medio") {
              // Estructura: col 2 = riesgo, col 3 = nombre, col 4 = ISIN, col 5 = link, col 6 = vol, col 7 = ret, col 8 = amount
              risk =
                row[2] &&
                typeof row[2] === "string" &&
                row[2].includes("riesgo")
                  ? row[2]
                  : null;
              isin =
                row[4] &&
                typeof row[4] === "string" &&
                (row[4].length === 12 || row[4].length === 15)
                  ? row[4]
                  : null;
              link = row[5] && isUrl(row[5]) ? row[5] : null;
              vol = row[6] || null;
              ret = row[7] || null;
              amount = getCellValueFromFormula(sheet, i, 8) || row[8] || null;
            } else {
              // Estructura estándar
              // Limpiar ISINs antes de verificar
              const isinCol4 =
                row[4] && typeof row[4] === "string"
                  ? String(row[4]).trim()
                  : null;
              const isinCol5 =
                row[5] && typeof row[5] === "string"
                  ? String(row[5]).trim()
                  : null;
              const hasIsinCol4 =
                isinCol4 && (isinCol4.length === 12 || isinCol4.length === 15);
              const hasIsinCol5 =
                isinCol5 && (isinCol5.length === 12 || isinCol5.length === 15);

              isin = hasIsinCol4 ? isinCol4 : hasIsinCol5 ? isinCol5 : null;
              link = hasLink
                ? row[4]
                : row[5] && isUrl(row[5])
                  ? row[5]
                  : row[6] && isUrl(row[6])
                    ? row[6]
                    : null;
              vol = row[6] || row[7] || null;
              ret = row[7] || row[8] || null;
              amount =
                getCellValueFromFormula(sheet, i, 8) ||
                getCellValueFromFormula(sheet, i, 7) ||
                row[8] ||
                row[7] ||
                null;
              risk =
                row[2] &&
                typeof row[2] === "string" &&
                row[2].includes("riesgo")
                  ? row[2]
                  : null;
            }

            const fundData = {
              name: fundName,
              isin: isin || null,
              link: link || null,
              volatility12M: vol || null,
              return12M: ret || null,
              amount: amount
                ? typeof amount === "string"
                  ? parseFloat(amount.replace(/[^\d.-]/g, ""))
                  : parseFloat(amount)
                : null,
              risk: risk || null,
            };

            data.detailedAllocation[category].funds.push(fundData);

            // También agregar a las subsecciones de Renta Fija
            if (
              (category === "RF Corto" || category === "RF Medio") &&
              data.sections.length > 0
            ) {
              const rentaFijaSection = data.sections.find(
                (s) => s.number === 4,
              );
              if (rentaFijaSection && rentaFijaSection.subsections) {
                const subsection = rentaFijaSection.subsections.find(
                  (sub) =>
                    sub.name ===
                    (category === "RF Corto"
                      ? "Renta Fija Corto Plazo"
                      : "Renta Fija Medio Plazo"),
                );
                if (subsection) {
                  subsection.funds.push(fundData);
                }
              }
            }

            // También agregar a la sección de RV
            if (category === "RV" && data.sections.length > 0) {
              const rvSection = data.sections.find((s) => s.number === 3);
              if (rvSection) {
                rvSection.funds = rvSection.funds || [];
                // Verificar si el fondo ya existe para evitar duplicados
                const fundExists =
                  rvSection.funds.some((f) => f.name === fundData.name) ||
                  rvSection.distribution?.some((f) => f.name === fundData.name);
                if (!fundExists) {
                  rvSection.funds.push(fundData);
                }
              }
            }

            // También agregar a la sección de Alternativos
            if (category === "Alternativos" && data.sections.length > 0) {
              const alternativosSection = data.sections.find(
                (s) => s.number === 5,
              );
              if (alternativosSection) {
                alternativosSection.funds = alternativosSection.funds || [];
                // Verificar que no exista ya para evitar duplicados
                const fundExists = alternativosSection.funds.some(
                  (f) => f.name === fundData.name,
                );
                if (!fundExists) {
                  alternativosSection.funds.push(fundData);
                }
              }
            }
          }
        }
      }
    }

    return data;
  };

  // Función auxiliar para obtener valor de celda con fórmula
  const getCellValueFromFormula = (sheet, rowIndex, colIndex) => {
    const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
    const formula = sheet.formulas[cellAddress];
    if (formula) {
      return formula.value;
    }
    if (sheet.data[rowIndex] && sheet.data[rowIndex][colIndex] !== null) {
      return sheet.data[rowIndex][colIndex];
    }
    return null;
  };

  // Verificar si es URL
  const isUrl = (value) => {
    if (typeof value !== "string") return false;
    const str = value.trim();
    return (
      str.startsWith("http://") ||
      str.startsWith("https://") ||
      str.includes("youtu.be/") ||
      str.includes("youtube.com/") ||
      str.includes("finect.com") ||
      str.includes("justetf.com") ||
      str.includes("moneychimp.com")
    );
  };

  // Función para extraer y sincronizar fondos
  const syncFundsToDatabase = async (sheets) => {
    try {
      setSyncing(true);
      setSyncStatus(t("portfolioBuilder.sync.extracting"));

      const fundCategories = [
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

      const fundsToSync = [];

      fundCategories.forEach((category) => {
        const sheet = sheets[category];
        if (!sheet || !sheet.data) return;

        for (let i = 1; i < sheet.data.length; i++) {
          const row = sheet.data[i];
          if (!row || row.every((cell) => cell === null)) continue;

          const name = row[0];
          const isin = row[1];
          const link = row[2];
          const volatility12M = row[3];
          const return12M = row[4];
          const notes = row[6] || row[5] || null;

          if (name && name.trim()) {
            fundsToSync.push({
              name: name.trim(),
              isin: isin ? isin.trim() : null,
              link: link ? link.trim() : null,
              volatility12M: volatility12M ? volatility12M.trim() : null,
              return12M: return12M ? return12M.trim() : null,
              category: category,
              notes: notes ? notes.trim() : null,
            });
          }
        }
      });

      setSyncStatus(
        t("portfolioBuilder.sync.syncing", { count: fundsToSync.length }),
      );

      const response = await api.post("/portfolio-funds/sync-from-excel", {
        funds: fundsToSync,
      });

      setSyncStatus({
        type: "success",
        message: t("portfolioBuilder.sync.success", {
          count: response.data.count,
        }),
      });

      setTimeout(() => {
        setSyncStatus(null);
      }, 5000);
    } catch (err) {
      console.error("Error al sincronizar fondos:", err);
      setSyncStatus({
        type: "error",
        message: t("portfolioBuilder.sync.error", {
          message: err.response?.data?.message || err.message,
        }),
      });
    } finally {
      setSyncing(false);
    }
  };

  // Formatear moneda
  const formatCurrency = (value) => {
    if (value === null || value === undefined || isNaN(value)) return "0,00 €";
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  };

  // Calcular valores de la tabla de asignación
  const calculateAllocationValues = () => {
    const totalAmount = calculatorData.totalAmount || 0;
    const categories = calculatorData.categories.map((cat) => {
      const weight = parseFloat(cat.weight) || 0;
      const expectedReturn = parseFloat(cat.expectedReturn) || 0;
      const portfolioReturn = (expectedReturn / 100) * (weight / 100);
      const amount = totalAmount * (weight / 100);

      return {
        ...cat,
        portfolioReturn: portfolioReturn,
        amount: amount,
      };
    });

    const totalReturn = categories.reduce(
      (sum, cat) => sum + (cat.portfolioReturn || 0),
      0,
    );
    const totalAmountCalculated = categories.reduce(
      (sum, cat) => sum + (cat.amount || 0),
      0,
    );

    return {
      categories,
      totalReturn: (totalReturn * 100).toFixed(2) + "%",
      totalAmountCalculated,
    };
  };

  const allocationValues = calculateAllocationValues();

  // Calcular la suma total de pesos
  const totalWeightSum = allocationValues.categories.reduce(
    (sum, cat) => sum + (parseFloat(cat.weight) || 0),
    0,
  );

  // Calcular perfil de riesgo de la cartera
  const calculateRiskProfile = () => {
    // Asignar valores de riesgo a cada categoría (1 = muy bajo, 5 = muy alto)
    const riskValues = {
      Monetarios: 1,
      "RF Corto": 2,
      "RF Medio": 3,
      RV: 5,
      Alternativos: 4,
    };

    const totalWeight = allocationValues.categories.reduce(
      (sum, cat) => sum + (parseFloat(cat.weight) || 0),
      0,
    );

    if (totalWeight === 0) {
      return {
        profile: t("portfolioBuilder.calculator.riskProfiles.unassigned"),
        color: "gray",
      };
    }

    // Calcular riesgo promedio ponderado
    const weightedRisk = allocationValues.categories.reduce((sum, cat) => {
      const weight = parseFloat(cat.weight) || 0;
      const riskValue = riskValues[cat.name] || 3;
      return sum + riskValue * (weight / 100);
    }, 0);

    // Clasificar el perfil de riesgo
    let profile, color;
    if (weightedRisk <= 1.5) {
      profile = t("portfolioBuilder.calculator.riskProfiles.conservative");
      color = "green";
    } else if (weightedRisk <= 2.5) {
      profile = t("portfolioBuilder.calculator.riskProfiles.moderate");
      color = "blue";
    } else if (weightedRisk <= 3.5) {
      profile = t("portfolioBuilder.calculator.riskProfiles.balanced");
      color = "yellow";
    } else if (weightedRisk <= 4.5) {
      profile = t("portfolioBuilder.calculator.riskProfiles.aggressive");
      color = "orange";
    } else {
      profile = t("portfolioBuilder.calculator.riskProfiles.veryAggressive");
      color = "red";
    }

    return { profile, color, weightedRisk };
  };

  const riskProfile = calculateRiskProfile();

  // Función para obtener el nombre de la categoría según la sección (nombres internos para cálculos)
  const getCategoryName = (section, subsection = null) => {
    if (section.number === 2) {
      return "Monetarios";
    } else if (section.number === 3) {
      return "RV";
    } else if (section.number === 4 && subsection) {
      if (
        subsection.name === "Renta Fija Corto Plazo" ||
        subsection.name === "RF Corto Plazo"
      ) {
        return "RF Corto";
      } else if (
        subsection.name === "Renta Fija Medio Plazo" ||
        subsection.name === "RF Medio Plazo"
      ) {
        return "RF Medio";
      }
    } else if (section.number === 5) {
      return "Alternativos";
    }
    return null;
  };

  // Función para obtener el nombre completo de la categoría para mostrar
  const getCategoryDisplayName = (categoryName) => {
    const displayNames = {
      Monetarios: t("portfolioBuilder.categories.monetarios"),
      "RF Corto": t("portfolioBuilder.categories.rfCorto"),
      "RF Medio": t("portfolioBuilder.categories.rfMedio"),
      RV: t("portfolioBuilder.categories.rv"),
      Alternativos: t("portfolioBuilder.categories.alternativos"),
    };
    return displayNames[categoryName] || categoryName;
  };

  // Función para traducir descripciones de categorías
  const translateCategoryDescription = (categoryName) => {
    const descriptions = {
      Monetarios: t("portfolioBuilder.categories.descriptions.monetarios"),
      "RF Corto": t("portfolioBuilder.categories.descriptions.rfCorto"),
      "RF Medio": t("portfolioBuilder.categories.descriptions.rfMedio"),
      RV: t("portfolioBuilder.categories.descriptions.rv"),
      Alternativos: t("portfolioBuilder.categories.descriptions.alternativos"),
    };
    return descriptions[categoryName] || "";
  };

  // Función para traducir títulos de secciones
  const translateSectionTitle = (sectionNumber, originalTitle) => {
    if (sectionNumber === 2) {
      return t("portfolioBuilder.sections.monetarios.title");
    } else if (sectionNumber === 3) {
      return t("portfolioBuilder.sections.rentaVariable.title");
    } else if (sectionNumber === 4) {
      return t("portfolioBuilder.sections.rentaFija.title");
    } else if (sectionNumber === 5) {
      return t("portfolioBuilder.sections.alternativos.title");
    }
    return originalTitle;
  };

  // Función para traducir nombres de subsecciones
  const translateSubsectionName = (name) => {
    if (name === "Renta Fija Corto Plazo" || name === "RF Corto Plazo") {
      return t("portfolioBuilder.sections.subsections.rfCortoPlazo.name");
    } else if (name === "Renta Fija Medio Plazo" || name === "RF Medio Plazo") {
      return t("portfolioBuilder.sections.subsections.rfMedioPlazo.name");
    }
    return name;
  };

  // Función para traducir descripciones de subsecciones
  const translateSubsectionDescription = (name, originalDescription) => {
    if (name === "Renta Fija Corto Plazo" || name === "RF Corto Plazo") {
      return t(
        "portfolioBuilder.sections.subsections.rfCortoPlazo.description",
      );
    } else if (name === "Renta Fija Medio Plazo" || name === "RF Medio Plazo") {
      return t(
        "portfolioBuilder.sections.subsections.rfMedioPlazo.description",
      );
    }
    return originalDescription || "";
  };

  // Función para traducir tips comunes
  const translateTip = (tip) => {
    if (!tip) return "";

    // Traducir tips conocidos por patrones
    if (tip.includes("En caso de caidas") || tip.includes("caidas fuertes")) {
      return t("portfolioBuilder.tips.enCasoDeCaidas");
    }
    if (tip.includes("Siempre y cuando")) {
      return t("portfolioBuilder.tips.siempreYCuando");
    }
    if (tip.includes("Máxima rentabilidad")) {
      return t("portfolioBuilder.tips.maximaRentabilidad");
    }
    if (tip.includes("Inversión en empresas")) {
      return t("portfolioBuilder.tips.inversionEnEmpresas");
    }

    // Si no hay traducción específica, devolver el original
    return tip;
  };

  // Función para traducir descripciones comunes
  const translateDescription = (description) => {
    if (!description) return "";

    if (description.includes("Máxima rentabilidad")) {
      return t("portfolioBuilder.descriptions.maximaRentabilidad");
    }
    if (description.includes("Inversión en empresas")) {
      return t("portfolioBuilder.descriptions.inversionEnEmpresas");
    }

    return description;
  };

  // Función para calcular el monto total de una categoría
  const calculateCategoryTotal = (categoryName) => {
    if (!categoryName) return 0;
    const category = calculatorData.categories.find(
      (cat) => cat.name === categoryName,
    );
    if (!category) return 0;
    const totalAmount = calculatorData.totalAmount || 0;
    const weight = parseFloat(category.weight) || 0;
    return totalAmount * (weight / 100);
  };

  // Función para calcular el monto de un fondo basado en la categoría
  const calculateFundAmount = (section, subsection = null) => {
    if (!portfolioData || !calculatorData) return null;

    const categoryName = getCategoryName(section, subsection);
    if (!categoryName) return null;

    const categoryTotalAmount = calculateCategoryTotal(categoryName);

    // Determinar los fondos de esta categoría
    let funds = [];
    if (subsection && subsection.funds) {
      funds = subsection.funds;
    } else if (section.funds) {
      funds = section.funds;
    }

    if (funds.length === 0) return null;

    // Distribuir equitativamente entre los fondos
    const amountPerFund = categoryTotalAmount / funds.length;
    return amountPerFund;
  };

  // Funciones para toggle de secciones
  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
      }
      return newSet;
    });
  };

  const toggleVideos = (sectionIdentifier) => {
    setExpandedVideos((prev) => {
      const newSet = new Set(prev);
      const videoId =
        typeof sectionIdentifier === "number"
          ? `videos-${sectionIdentifier}`
          : `videos-${sectionIdentifier}`;
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <div className="space-y-8">
        <div className="mb-2">
          <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
            {t("portfolioBuilder.title")}
          </h1>
        </div>
        <div className="card">
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!portfolioData) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
          {t("portfolioBuilder.title")}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 tracking-tight">
          {t("portfolioBuilder.subtitle")}
        </p>
      </div>

      {/* Estado de sincronización */}
      {syncStatus && (
        <div className="card">
          <div
            className={`p-4 rounded-lg flex items-center gap-3 min-h-[3rem] ${
              syncStatus.type === "error"
                ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
                : syncStatus.type === "success"
                  ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                  : ""
            }`}
            style={
              syncStatus.type !== "error" && syncStatus.type !== "success"
                ? isDark
                  ? {
                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                      borderColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.3)`,
                    }
                  : {
                      backgroundColor: "var(--user-color-50)",
                      borderColor: "var(--user-color-200)",
                    }
                : {}
            }
          >
            {syncing && (
              <div
                className="flex-shrink-0 w-4 h-4 border-2 rounded-full animate-spin"
                style={{
                  borderColor: "var(--user-color-500)",
                  borderTopColor: "transparent",
                }}
              ></div>
            )}
            <p
              className={`text-sm font-medium ${
                syncStatus.type === "error"
                  ? "text-red-800 dark:text-red-200"
                  : syncStatus.type === "success"
                    ? "text-green-800 dark:text-green-200"
                    : ""
              }`}
              style={
                syncStatus.type !== "error" && syncStatus.type !== "success"
                  ? isDark
                    ? {
                        color: "var(--user-color-300)",
                      }
                    : {
                        color: "var(--user-color-800)",
                      }
                  : {}
              }
            >
              {typeof syncStatus === "string" ? syncStatus : syncStatus.message}
            </p>
          </div>
        </div>
      )}

      {/* Tabla de Cálculos Interactiva - Asignación de Cartera */}
      <div className="card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => toggleSection("calculator")}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {expandedSections.has("calculator") ? (
                <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
              ) : (
                <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
              )}
            </button>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: "var(--user-color-600)" }}
            >
              <Calculator className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                {t("portfolioBuilder.calculator.title")}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {t("portfolioBuilder.calculator.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {expandedSections.has("calculator") && (
          <div className="mt-6">
            {/* Input del monto total */}
            <div
              className="mb-6 p-4 rounded-lg border"
              style={
                isDark
                  ? {
                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                      borderColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.3)`,
                    }
                  : {
                      backgroundColor: "var(--user-color-50)",
                      borderColor: "var(--user-color-200)",
                    }
              }
            >
              <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                {t("portfolioBuilder.calculator.totalAmount")}
              </label>
              <input
                type="number"
                value={calculatorData.totalAmount}
                onChange={(e) =>
                  setCalculatorData({
                    ...calculatorData,
                    totalAmount: parseFloat(e.target.value) || 0,
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#1d1d1f] text-gray-900 dark:text-gray-100 text-lg font-semibold"
                placeholder="120000"
              />
            </div>

            {/* Tabla de asignación */}
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100 dark:bg-[#1d1d1f]">
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.category")}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.expectedReturn")}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.weight")}
                    </th>
                    <th className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.portfolioReturn")}
                    </th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.amount")}
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700">
                      {t("portfolioBuilder.calculator.description")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {allocationValues.categories.map((category, index) => (
                    <tr
                      key={index}
                      className="hover:bg-gray-50 dark:hover:bg-[#1d1d1f]"
                    >
                      <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {getCategoryDisplayName(category.name)}
                      </td>
                      <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-gray-100">
                        {category.expectedReturn.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={category.weight}
                          onChange={(e) => {
                            const newValue = parseFloat(e.target.value) || 0;

                            // Calcular la suma de los otros pesos (excluyendo el actual)
                            const sumOfOthers =
                              calculatorData.categories.reduce(
                                (sum, cat, idx) => {
                                  if (idx === index) return sum;
                                  return sum + (parseFloat(cat.weight) || 0);
                                },
                                0,
                              );

                            // Calcular el máximo permitido para este peso
                            const maxAllowed = 100 - sumOfOthers;

                            // Limitar el valor al máximo permitido
                            const limitedValue = Math.min(
                              Math.max(0, newValue),
                              maxAllowed,
                            );

                            const newCategories = [
                              ...calculatorData.categories,
                            ];
                            newCategories[index].weight = limitedValue;
                            setCalculatorData({
                              ...calculatorData,
                              categories: newCategories,
                            });
                          }}
                          className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-[#1d1d1f] text-gray-900 dark:text-gray-100 text-center text-sm font-semibold"
                        />
                        <span className="ml-1 text-sm text-gray-600 dark:text-gray-400">
                          %
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {(category.portfolioReturn * 100).toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrency(category.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 italic">
                        {translateCategoryDescription(category.name) ||
                          category.description}
                      </td>
                    </tr>
                  ))}
                  <tr
                    className={`font-semibold ${totalWeightSum > 100 ? "bg-red-50 dark:bg-red-900/20" : ""}`}
                    style={
                      totalWeightSum <= 100
                        ? isDark
                          ? {
                              backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                            }
                          : {
                              backgroundColor: "var(--user-color-50)",
                            }
                        : {}
                    }
                  >
                    <td
                      className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
                      colSpan="3"
                    >
                      {t("portfolioBuilder.calculator.total")}
                      {totalWeightSum !== 100 && (
                        <span
                          className={`ml-2 text-xs font-normal ${
                            totalWeightSum > 100
                              ? "text-red-600 dark:text-red-400"
                              : "text-yellow-600 dark:text-yellow-400"
                          }`}
                        >
                          ({totalWeightSum.toFixed(1)}%)
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-center text-sm"
                      style={
                        isDark
                          ? {
                              color: "var(--user-color-400)",
                            }
                          : {
                              color: "var(--user-color-900)",
                            }
                      }
                    >
                      {allocationValues.totalReturn}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-gray-900 dark:text-gray-100"></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {t("portfolioBuilder.calculator.riskProfile")}
                          </span>
                          <span
                            className={`px-2 py-1 rounded text-xs font-semibold ${
                              riskProfile.color === "green"
                                ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200"
                                : riskProfile.color === "yellow"
                                  ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200"
                                  : riskProfile.color === "orange"
                                    ? "bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200"
                                    : riskProfile.color === "red"
                                      ? "bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200"
                                      : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                            }`}
                            style={
                              riskProfile.color === "blue"
                                ? isDark
                                  ? {
                                      backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.2)`,
                                      color: "var(--user-color-300)",
                                    }
                                  : {
                                      backgroundColor: "var(--user-color-100)",
                                      color: "var(--user-color-800)",
                                    }
                                : {}
                            }
                          >
                            {riskProfile.profile}
                          </span>
                        </div>
                        {totalWeightSum > 100 && (
                          <span className="text-xs text-red-600 dark:text-red-400 font-medium">
                            {t("portfolioBuilder.calculator.weightSumWarning")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Secciones de Tipos de Inversión */}
      {portfolioData.sections
        .filter((section) => section.number !== 1)
        .flatMap((section) => {
          // Si es Renta Fija (sección 4), expandir las subsecciones como cards separadas
          if (
            section.number === 4 &&
            section.subsections &&
            section.subsections.length > 0
          ) {
            return section.subsections
              .sort((a, b) => {
                // Ordenar: Renta Fija Corto Plazo primero, luego Renta Fija Medio Plazo
                if (a.name === "Renta Fija Corto Plazo") return -1;
                if (b.name === "Renta Fija Corto Plazo") return 1;
                if (a.name === "Renta Fija Medio Plazo") return -1;
                if (b.name === "Renta Fija Medio Plazo") return 1;
                return 0;
              })
              .map((subsection) => ({
                ...section,
                isSubsection: true,
                subsectionData: {
                  ...subsection,
                  // Pasar la nota de la sección principal a las subsecciones si no tienen una propia
                  note: subsection.note || section.note || null,
                },
                subsectionName: subsection.name,
                // Asignar números de orden para el sorting: Renta Fija Corto Plazo = 2, Renta Fija Medio Plazo = 3
                subsectionOrder:
                  subsection.name === "Renta Fija Corto Plazo" ? 2 : 3,
              }));
          }
          return [section];
        })
        .sort((a, b) => {
          // Ordenar según el orden de la calculadora: Monetarios, RF Corto, RF Medio, RV, Alternativos
          const orderA = a.isSubsection
            ? a.subsectionOrder
            : a.number === 2
              ? 1
              : a.number === 3
                ? 4
                : a.number === 5
                  ? 5
                  : 99;
          const orderB = b.isSubsection
            ? b.subsectionOrder
            : b.number === 2
              ? 1
              : b.number === 3
                ? 4
                : b.number === 5
                  ? 5
                  : 99;
          return orderA - orderB;
        })
        .map((section) => {
          // Si es una subsección de Renta Fija, usar datos de la subsección
          const isSubsection = section.isSubsection;
          const subsection = isSubsection ? section.subsectionData : null;
          // Función para formatear títulos con nombres completos
          const formatDisplayTitle = (title) => {
            if (title.includes("RF Corto Plazo")) {
              return title.replace(
                "RF Corto Plazo",
                t("portfolioBuilder.sections.subsections.rfCortoPlazo.name"),
              );
            }
            if (title.includes("Renta Fija Corto Plazo")) {
              return t(
                "portfolioBuilder.sections.subsections.rfCortoPlazo.name",
              );
            }
            if (title.includes("RF Medio Plazo")) {
              return title.replace(
                "RF Medio Plazo",
                t("portfolioBuilder.sections.subsections.rfMedioPlazo.name"),
              );
            }
            if (title.includes("Renta Fija Medio Plazo")) {
              return t(
                "portfolioBuilder.sections.subsections.rfMedioPlazo.name",
              );
            }
            if (title.includes("(RV)")) {
              return title.replace("(RV)", "");
            }
            // Traducir títulos de secciones
            if (
              title.includes("Ahorro Remunerado") ||
              title.includes("Fondos Monetarios")
            ) {
              return t("portfolioBuilder.sections.monetarios.title");
            }
            if (
              title.includes("Inversión a Largo Plazo") ||
              title.includes("Fondos Indexados")
            ) {
              return t("portfolioBuilder.sections.rentaVariable.title");
            }
            if (title.includes("Renta Fija") || title.includes("Bonos")) {
              return t("portfolioBuilder.sections.rentaFija.title");
            }
            if (title.includes("Inversiones Alternativas")) {
              return t("portfolioBuilder.sections.alternativos.title");
            }
            return title;
          };

          const displayTitle = isSubsection
            ? translateSubsectionName(section.subsectionName)
            : `${section.number}. ${translateSectionTitle(section.number, section.title)}`;

          // Función para formatear descripciones eliminando diminutivos y traduciendo
          const formatDescription = (description) => {
            if (!description) return "";
            let formatted = description
              .replace(/\bRF\b/g, t("portfolioBuilder.categories.rfCorto"))
              .replace(/\bRV\b/g, t("portfolioBuilder.categories.rv"))
              .replace(/\bFM\b/g, "Fondo Monetario")
              .replace(/RF Corto/g, t("portfolioBuilder.categories.rfCorto"))
              .replace(/RF Medio/g, t("portfolioBuilder.categories.rfMedio"));
            return formatted;
          };

          const displayDescription = isSubsection
            ? translateSubsectionDescription(
                subsection?.name,
                subsection?.description,
              )
            : translateDescription(section.description) ||
              formatDescription(section.description || "");

          const Icon = section.icon;
          const sectionId = isSubsection
            ? `subsection-${section.number}-${subsection?.name?.replace(/\s+/g, "-")}`
            : `section-${section.number}`;
          const isExpanded = expandedSections.has(sectionId);

          // Si es Renta Fija con subsecciones y no es una subsección, no renderizar la card principal
          if (
            section.number === 4 &&
            section.subsections &&
            section.subsections.length > 0 &&
            !isSubsection
          ) {
            return null;
          }

          return (
            <div
              key={isSubsection ? sectionId : section.number}
              className="card"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <button
                    onClick={() => toggleSection(sectionId)}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors mt-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                    )}
                  </button>
                  <div
                    className="p-3 rounded-lg flex-shrink-0"
                    style={{ backgroundColor: "var(--user-color-600)" }}
                  >
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      {displayTitle}
                    </h2>
                    {displayDescription && (
                      <p className="text-gray-600 dark:text-gray-400 mb-4">
                        {displayDescription}
                      </p>
                    )}
                    {(isSubsection ? subsection?.note : section.note) && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mb-4">
                        <p className="text-sm text-amber-800 dark:text-amber-200">
                          <AlertCircle className="h-4 w-4 inline mr-2" />
                          {translateTip(
                            isSubsection ? subsection?.note : section.note,
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="mt-6">
                  {/* Tips */}
                  {section.tips && section.tips.length > 0 && (
                    <div className="mb-6 space-y-2">
                      {section.tips.map((tip, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-2 p-3 rounded-lg"
                          style={
                            isDark
                              ? {
                                  backgroundColor: `rgba(var(--user-color-600-rgb, 2, 132, 199), 0.1)`,
                                }
                              : {
                                  backgroundColor: "var(--user-color-50)",
                                }
                          }
                        >
                          <Info
                            className="h-5 w-5 flex-shrink-0 mt-0.5"
                            style={
                              isDark
                                ? {
                                    color: "var(--user-color-400)",
                                  }
                                : {
                                    color: "var(--user-color-600)",
                                  }
                            }
                          />
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {translateTip(tip)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Ratios de Inmuebles */}
                  {section.ratios && section.ratios.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {t("portfolioBuilder.sections.ratios.title")}
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="min-w-full">
                          <thead className="bg-gray-100 dark:bg-[#1d1d1f]">
                            <tr>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t("portfolioBuilder.sections.ratios.price")}
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t("portfolioBuilder.sections.ratios.rent")}
                              </th>
                              <th className="px-4 py-2 text-left text-sm font-semibold text-gray-900 dark:text-gray-100">
                                {t("portfolioBuilder.sections.ratios.ratio")}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {section.ratios.map((ratio, idx) => (
                              <tr key={idx}>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {formatCurrency(ratio.price)}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {formatCurrency(ratio.rent)}
                                </td>
                                <td className="px-4 py-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  {ratio.ratio.toFixed(0)}:1
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Financiación */}
                  {section.financing && section.financing.length > 0 && (
                    <div className="mb-6">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        {t("portfolioBuilder.sections.financing.title")}
                      </h3>
                      <ul className="space-y-2">
                        {section.financing.map((item, idx) => (
                          <li
                            key={idx}
                            className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300"
                          >
                            <span
                              className="mt-1"
                              style={
                                isDark
                                  ? {
                                      color: "var(--user-color-400)",
                                    }
                                  : {
                                      color: "var(--user-color-600)",
                                    }
                              }
                            >
                              •
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Distribución de Capital para RV */}
                  {(() => {
                    // Para RV, priorizar distribution si existe, sino usar funds
                    const hasDistribution =
                      section.distribution && section.distribution.length > 0;
                    const hasFunds = section.funds && section.funds.length > 0;

                    if (!hasDistribution && !hasFunds) return null;

                    const categoryName = getCategoryName(section);
                    const dynamicTotal = calculateCategoryTotal(categoryName);

                    return (
                      <div className="mb-6">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                          {t(
                            "portfolioBuilder.sections.capitalDistribution.title",
                          )}
                          {dynamicTotal > 0 && (
                            <span className="ml-2 text-gray-600 dark:text-gray-400 font-normal">
                              {t(
                                "portfolioBuilder.sections.capitalDistribution.total",
                                {
                                  amount: formatCurrency(dynamicTotal),
                                },
                              )}
                            </span>
                          )}
                        </h3>

                        {/* Si hay distribución con porcentajes específicos, mostrar esa */}
                        {hasDistribution && (
                          <div className="space-y-3 mb-6">
                            {section.distribution.map((item, idx) => {
                              // Calcular la cantidad dinámicamente basada en el porcentaje
                              const percentage = parseFloat(
                                item.percentage?.replace("%", "") || 0,
                              );
                              const dynamicAmount =
                                dynamicTotal * (percentage / 100);

                              return (
                                <div
                                  key={idx}
                                  className="p-4 bg-gray-50 dark:bg-[#1d1d1f] rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                        {item.name}
                                      </h4>
                                      {item.isin && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {t(
                                            "portfolioBuilder.sections.capitalDistribution.isin",
                                          )}{" "}
                                          {item.isin}
                                        </p>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                        {item.percentage}
                                      </p>
                                      {dynamicAmount > 0 && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                          {formatCurrency(dynamicAmount)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    {item.link && (
                                      <a
                                        href={item.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm hover:underline"
                                        style={
                                          isDark
                                            ? {
                                                color: "var(--user-color-400)",
                                              }
                                            : {
                                                color: "var(--user-color-600)",
                                              }
                                        }
                                      >
                                        {t(
                                          "portfolioBuilder.sections.capitalDistribution.viewFinect",
                                        )}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Si hay fondos adicionales que no están en distribution, mostrarlos también */}
                        {hasFunds &&
                          (() => {
                            // Filtrar fondos que no están en distribution
                            const additionalFunds = section.funds.filter(
                              (fund) => {
                                if (hasDistribution) {
                                  return !section.distribution.some(
                                    (dist) => dist.name === fund.name,
                                  );
                                }
                                return true;
                              },
                            );

                            // Calcular el porcentaje total ya asignado en distribution
                            const assignedPercentage = hasDistribution
                              ? section.distribution.reduce((sum, dist) => {
                                  const pct = parseFloat(
                                    dist.percentage?.replace("%", "") || 0,
                                  );
                                  return sum + pct;
                                }, 0)
                              : 0;

                            // El porcentaje restante se distribuye entre los fondos adicionales
                            const remainingPercentage =
                              100 - assignedPercentage;
                            const percentagePerFund =
                              additionalFunds.length > 0
                                ? remainingPercentage / additionalFunds.length
                                : 0;

                            return (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {additionalFunds.map((fund, idx) => {
                                  // Calcular el monto basado en el porcentaje restante
                                  const fundAmount =
                                    percentagePerFund > 0
                                      ? dynamicTotal * (percentagePerFund / 100)
                                      : 0;

                                  return (
                                    <div
                                      key={idx}
                                      className="p-4 bg-gray-50 dark:bg-[#1d1d1f] rounded-lg border border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="flex items-start justify-between mb-2">
                                        <div className="flex-1">
                                          <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                            {fund.name}
                                          </h4>
                                          {fund.isin && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                              ISIN: {fund.isin}
                                            </p>
                                          )}
                                        </div>
                                        <div className="text-right">
                                          <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                            {percentagePerFund > 0
                                              ? `${percentagePerFund.toFixed(1)}%`
                                              : ""}
                                          </p>
                                          {fundAmount && fundAmount > 0 && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                              {formatCurrency(fundAmount)}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-4 text-sm mb-2">
                                        {fund.volatility12M && (
                                          <div>
                                            <span className="text-gray-600 dark:text-gray-400">
                                              {t(
                                                "portfolioBuilder.sections.capitalDistribution.vol12M",
                                              )}{" "}
                                            </span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                              {fund.volatility12M}
                                            </span>
                                          </div>
                                        )}
                                        {fund.return12M && (
                                          <div>
                                            <span className="text-gray-600 dark:text-gray-400">
                                              {t(
                                                "portfolioBuilder.sections.capitalDistribution.r12M",
                                              )}{" "}
                                            </span>
                                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                              {fund.return12M}
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        {fund.link && (
                                          <a
                                            href={fund.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-sm hover:underline"
                                            style={
                                              isDark
                                                ? {
                                                    color:
                                                      "var(--user-color-400)",
                                                  }
                                                : {
                                                    color:
                                                      "var(--user-color-600)",
                                                  }
                                            }
                                          >
                                            {t(
                                              "portfolioBuilder.sections.capitalDistribution.viewDetails",
                                            )}
                                            <ExternalLink className="h-3 w-3" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })()}

                  {/* Fondos de subsección (para Renta Fija Corto Plazo y Renta Fija Medio Plazo cuando son cards separadas) */}
                  {isSubsection &&
                    subsection &&
                    subsection.funds &&
                    subsection.funds.length > 0 &&
                    (() => {
                      const categoryName = getCategoryName(section, subsection);
                      const dynamicTotal = calculateCategoryTotal(categoryName);

                      return (
                        <div className="mb-6">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                            {t(
                              "portfolioBuilder.sections.capitalDistribution.title",
                            )}
                            {dynamicTotal > 0 && (
                              <span className="ml-2 text-gray-600 dark:text-gray-400 font-normal">
                                {t(
                                  "portfolioBuilder.sections.capitalDistribution.total",
                                  {
                                    amount: formatCurrency(dynamicTotal),
                                  },
                                )}
                              </span>
                            )}
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {subsection.funds.map((fund, idx) => {
                              const fundAmount = calculateFundAmount(
                                section,
                                subsection,
                              );
                              // Calcular el porcentaje equitativo para cada fondo
                              const percentagePerFund =
                                subsection.funds.length > 0
                                  ? (100 / subsection.funds.length).toFixed(1)
                                  : "0";

                              return (
                                <div
                                  key={idx}
                                  className="p-4 bg-gray-50 dark:bg-[#1d1d1f] rounded-lg border border-gray-200 dark:border-gray-700"
                                >
                                  <div className="flex items-start justify-between mb-2">
                                    <div className="flex-1">
                                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                        {fund.name}
                                      </h4>
                                      {fund.isin && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                          {t(
                                            "portfolioBuilder.sections.capitalDistribution.isin",
                                          )}{" "}
                                          {fund.isin}
                                        </p>
                                      )}
                                      {fund.risk &&
                                        subsection.name !==
                                          "Renta Fija Corto Plazo" && (
                                          <span
                                            className={`inline-block mt-2 px-2 py-1 rounded text-xs font-medium ${
                                              fund.risk.includes("alto")
                                                ? "bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200"
                                                : fund.risk.includes("medio")
                                                  ? "bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200"
                                                  : "bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200"
                                            }`}
                                          >
                                            {fund.risk.includes("alto")
                                              ? t(
                                                  "portfolioBuilder.calculator.riskProfiles.veryAggressive",
                                                )
                                              : fund.risk.includes("medio")
                                                ? t(
                                                    "portfolioBuilder.calculator.riskProfiles.moderate",
                                                  )
                                                : fund.risk.includes("bajo")
                                                  ? t(
                                                      "portfolioBuilder.calculator.riskProfiles.conservative",
                                                    )
                                                  : fund.risk}
                                          </span>
                                        )}
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                        {percentagePerFund}%
                                      </p>
                                      {fundAmount && fundAmount > 0 && (
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                          {formatCurrency(fundAmount)}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-4 text-sm mb-2">
                                    {fund.volatility12M && (
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">
                                          {t(
                                            "portfolioBuilder.sections.capitalDistribution.vol",
                                          )}{" "}
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                          {fund.volatility12M}
                                        </span>
                                      </div>
                                    )}
                                    {fund.return12M && (
                                      <div>
                                        <span className="text-gray-600 dark:text-gray-400">
                                          R 12M:{" "}
                                        </span>
                                        <span className="font-medium text-gray-900 dark:text-gray-100">
                                          {fund.return12M}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {fund.link && (
                                      <a
                                        href={fund.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm hover:underline"
                                        style={
                                          isDark
                                            ? {
                                                color: "var(--user-color-400)",
                                              }
                                            : {
                                                color: "var(--user-color-600)",
                                              }
                                        }
                                      >
                                        {t(
                                          "portfolioBuilder.sections.capitalDistribution.viewFinect",
                                        )}
                                        <ExternalLink className="h-3 w-3" />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {(isSubsection ? subsection?.videos : section.videos) &&
                    (isSubsection
                      ? subsection.videos.length > 0
                      : section.videos.length > 0) && (
                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            {t("portfolioBuilder.sections.videos.title")}
                          </h3>
                          <button
                            onClick={() =>
                              toggleVideos(
                                isSubsection ? sectionId : section.number,
                              )
                            }
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            {expandedVideos.has(
                              `videos-${isSubsection ? sectionId : section.number}`,
                            ) ? (
                              <ChevronDown className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                            ) : (
                              <ChevronRight className="h-5 w-5 text-gray-800 dark:text-[#e5e5e5]" />
                            )}
                          </button>
                        </div>
                        {expandedVideos.has(
                          `videos-${isSubsection ? sectionId : section.number}`,
                        ) && (
                          <div className="space-y-2">
                            {(isSubsection
                              ? subsection.videos
                              : section.videos
                            ).map((video, idx) => (
                              <a
                                key={idx}
                                href={video.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-[#1d1d1f] rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-[#252525] transition-colors"
                              >
                                <Play className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                    {video.description ||
                                      t(
                                        "portfolioBuilder.sections.videos.viewVideo",
                                      )}
                                  </p>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {video.url}
                                  </p>
                                </div>
                                <ExternalLink className="h-4 w-4 text-gray-400 flex-shrink-0" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
};

export default PortfolioBuilder;
