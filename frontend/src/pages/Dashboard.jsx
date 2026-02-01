import React, { useEffect, useState, useRef } from "react";
import {
  CgTrending,
  CgTrendingDown,
  CgEditMarkup,
  CgTime,
  CgCreditCard,
  CgDollar,
  CgDanger,
  CgArrowUp,
  CgArrowDown,
} from "react-icons/cg";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { ResponsiveTreeMap } from "@nivo/treemap";
import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "../contexts/TranslationContext";
import { useTheme } from "../contexts/ThemeContext";

// Funciones auxiliares
const formatPrice = (value, currency = "EUR") => {
  if (value === null || value === undefined || isNaN(value)) {
    return "0,00 €";
  }

  const decimalPart = Math.abs((value * 10000) % 100);
  const hasTrailingZeros = decimalPart === 0;
  const decimals = hasTrailingZeros ? 2 : 4;

  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

// Esta función se moverá dentro del componente para usar traducciones

const calculateProfitLoss = (investment) => {
  if (investment.isAutomatedPortfolio) {
    return investment.currentPrice - investment.quantity;
  }
  const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
  return (investment.currentPrice - avgPrice) * investment.quantity;
};

const calculateProfitLossPercentage = (investment) => {
  if (investment.isAutomatedPortfolio) {
    if (investment.quantity === 0) return 0;
    return (
      ((investment.currentPrice - investment.quantity) / investment.quantity) *
      100
    );
  }
  const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
  if (!avgPrice || avgPrice === 0) return 0;
  return ((investment.currentPrice - avgPrice) / avgPrice) * 100;
};

// Tooltip común para gráficas: estilo moderno y compatible con tema claro/oscuro
const ChartTooltip = ({
  active,
  payload,
  label,
  labelLabel = "Fecha",
  valueFormatter,
  isDark,
}) => {
  if (!active || !payload?.length) return null;
  const bg = isDark
    ? "bg-[#2c2c2e] border-[#404040]"
    : "bg-white border-gray-200";
  return (
    <div
      className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[140px]`}
    >
      {label && (
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
          {labelLabel}: {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center justify-between gap-4">
          <span
            className="text-sm text-gray-600 dark:text-gray-300"
            style={{ color: entry.color }}
          >
            ● {entry.name}
          </span>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {valueFormatter ? valueFormatter(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// Lista de barras horizontales apiladas para distribución por banco (sub-colores por subcuenta)
const BankBarList = ({ banks, generateBankColors, isDark, formatCurrency }) => {
  const [hoveredBank, setHoveredBank] = useState(null);
  const sorted = [...banks].sort((a, b) => (b.total || 0) - (a.total || 0));
  const maxTotal = Math.max(...sorted.map((b) => b.total || 0), 1);

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {sorted.map((bank) => {
        const colors = generateBankColors(
          bank.bankName,
          bank.subAccounts?.length || 0,
          bank.color,
        );
        const subs = bank.subAccounts || [];
        const total = bank.total || 0;
        const barPct =
          maxTotal > 0 ? Math.max(total / maxTotal, 0.02) * 100 : 0;
        const isHovered = hoveredBank === bank.bankName;

        return (
          <div
            key={bank.bankName}
            className="group relative"
            onMouseEnter={() => setHoveredBank(bank.bankName)}
            onMouseLeave={() => setHoveredBank(null)}
          >
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate min-w-0 flex-1">
                {bank.bankName}
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 tabular-nums shrink-0 w-24 text-right">
                {formatCurrency(total)}
              </span>
            </div>
            {/* Fondo de la barra (ancho completo); la barra coloreada mide barPct% = proporcional al capital */}
            <div
              className="h-2.5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800"
              role="presentation"
            >
              <div
                className="h-full flex rounded-full overflow-hidden transition-all duration-300 ease-out"
                style={{ width: `${barPct}%`, minWidth: total > 0 ? 8 : 0 }}
              >
                {subs.length > 0 ? (
                  subs.map((sub, i) => {
                    const segPct = total > 0 ? (sub.value || 0) / total : 0;
                    const segColor = colors.variations[i] ?? colors.base;
                    const isFirst = i === 0;
                    const isLast = i === subs.length - 1;
                    return (
                      <div
                        key={i}
                        className="h-full transition-opacity duration-200"
                        style={{
                          width: `${segPct * 100}%`,
                          minWidth: segPct > 0 ? 4 : 0,
                          backgroundColor: segColor,
                          opacity: isHovered ? 1 : 0.9,
                          borderRadius:
                            isFirst && isLast
                              ? "9999px"
                              : isFirst
                                ? "9999px 0 0 9999px"
                                : isLast
                                  ? "0 9999px 9999px 0"
                                  : 0,
                        }}
                        title={sub.name}
                      />
                    );
                  })
                ) : (
                  <div
                    className="h-full w-full rounded-full transition-opacity duration-200"
                    style={{
                      backgroundColor: colors.base,
                      opacity: isHovered ? 1 : 0.85,
                    }}
                  />
                )}
              </div>
            </div>
            {isHovered && subs.length > 0 && (
              <div
                className={`absolute z-10 left-0 top-full mt-1 py-2 px-3 rounded-lg border shadow-lg text-sm min-w-[180px] ${
                  isDark
                    ? "bg-[#2c2c2e] border-[#404040]"
                    : "bg-white border-gray-200"
                }`}
              >
                <p className="font-medium text-gray-900 dark:text-gray-100 mb-2 pb-1 border-b border-gray-200 dark:border-gray-600">
                  {bank.bankName}
                </p>
                {subs.map((sub, i) => (
                  <div
                    key={i}
                    className="flex justify-between gap-4 py-0.5 items-center"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor: colors.variations[i] ?? colors.base,
                        }}
                        aria-hidden
                      />
                      <span
                        className="truncate"
                        style={{ color: colors.variations[i] ?? colors.base }}
                      >
                        {sub.name}
                      </span>
                    </span>
                    <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums shrink-0">
                      {formatCurrency(sub.value || 0)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between gap-4 mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-600 font-semibold text-gray-900 dark:text-gray-100">
                  <span>Total</span>
                  <span className="tabular-nums">{formatCurrency(total)}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Dashboard = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [stats, setStats] = useState(null);
  const [balanceChart, setBalanceChart] = useState([]);
  const [investmentsEvolution, setInvestmentsEvolution] = useState([]);
  const [distributionByAssetClass, setDistributionByAssetClass] = useState([]);
  const [distributionByAssetType, setDistributionByAssetType] = useState([]);
  const [investmentsDetailed, setInvestmentsDetailed] = useState([]);
  const [distributionByBank, setDistributionByBank] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [showBalanceTooltip, setShowBalanceTooltip] = useState(false);
  const [showInvestmentDetailModal, setShowInvestmentDetailModal] =
    useState(false);
  const [selectedTreemapInvestment, setSelectedTreemapInvestment] =
    useState(null);
  const [detailInvestmentHistory, setDetailInvestmentHistory] = useState([]);
  const [detailDailyVariations, setDetailDailyVariations] = useState([]);
  const navigate = useNavigate();
  const resizeTimeoutRef = useRef(null);

  const getTypeLabel = (type, isAutomatedPortfolio = false) => {
    if (isAutomatedPortfolio) {
      return t("investments.investmentTypes.automatedPortfolio");
    }
    const types = {
      stock: t("investments.investmentTypes.stock"),
      bond: t("investments.investmentTypes.bond"),
      crypto: t("investments.investmentTypes.crypto"),
      fund: t("investments.investmentTypes.fund"),
      etf: t("investments.investmentTypes.etf"),
      automated_portfolio: t("investments.investmentTypes.automatedPortfolio"),
      other: t("investments.investmentTypes.other"),
    };
    return types[type] || type;
  };

  const getFixedIncomeSubtypeLabel = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === "short") {
      return t("investments.assetClassLabels.fixedIncomeSubtypeShort");
    }
    if (fixedIncomeSubtype === "medium") {
      return t("investments.assetClassLabels.fixedIncomeSubtypeMedium");
    }
    return "";
  };

  const getFixedIncomeSubtypeTone = (fixedIncomeSubtype) => {
    if (fixedIncomeSubtype === "short") {
      return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200";
    }
    if (fixedIncomeSubtype === "medium") {
      return "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100";
    }
    return "";
  };

  const COLORS = [
    "#0ea5e9",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#f97316",
    "#06b6d4",
    "#84cc16",
    "#a855f7",
  ];

  // Colores específicos para cada clase de activo
  const ASSET_CLASS_COLORS = {
    "Renta Fija": "#3b82f6", // Azul
    "Renta Variable": "#10b981", // Verde
    Efectivo: "#f59e0b", // Amarillo/Naranja
  };

  // Colores para tipo de renta (fija corto/medio, variable, alternativa)
  const ASSET_TYPE_COLORS = {
    fixed_short: "#0ea5e9", // sky
    fixed_medium: "#3b82f6", // blue
    variable: "#10b981", // emerald
    alternative: "#8b5cf6", // violet
  };

  // Generar colores para bancos y variaciones para subcuentas
  const generateBankColors = (bankName, subAccountCount, savedColor = null) => {
    const isRenta4 =
      String(bankName || "")
        .toLowerCase()
        .replace(/\s/g, "") === "renta4";
    const baseColor =
      savedColor && savedColor.trim() !== ""
        ? savedColor
        : (() => {
            const bankBaseColors = {
              Santander: "#ec0000",
              BBVA: "#004481",
              CaixaBank: "#004481",
              ING: "#ff6200",
              MyInvestor: "#00a859",
              Openbank: "#00a859",
              N26: "#000000",
              Revolut: "#0075eb",
              Renta4: "#e85d04",
            };
            return (
              bankBaseColors[bankName] || generateColorFromString(bankName)
            );
          })();

    // Renta4: variaciones muy sutiles (Efectivo / Inversiones) del mismo color
    const variations =
      isRenta4 && subAccountCount > 0
        ? generateSubtleColorVariations(baseColor, subAccountCount)
        : generateColorVariations(baseColor, subAccountCount);

    return {
      base: baseColor,
      variations,
    };
  };

  // Generar color a partir de un string
  const generateColorFromString = (str) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = hash % 360;
    return `hsl(${hue}, 70%, 50%)`;
  };

  // Generar variaciones de un color manteniendo el mismo matiz (hue)
  const generateColorVariations = (baseColor, count) => {
    if (count === 0) return [];

    let hue, saturation, lightness;

    // Si es un color HSL, extraer los valores
    if (baseColor.startsWith("hsl")) {
      const match = baseColor.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        hue = parseInt(match[1]);
        saturation = parseInt(match[2]);
        lightness = parseInt(match[3]);
      } else {
        // Si no coincide, usar valores por defecto
        hue = 200;
        saturation = 70;
        lightness = 50;
      }
    } else {
      // Si es un color hexadecimal, convertir a HSL
      let hex = baseColor.replace("#", "");

      // Manejar colores de 3 dígitos
      if (hex.length === 3) {
        hex = hex
          .split("")
          .map((char) => char + char)
          .join("");
      }

      const r = parseInt(hex.substr(0, 2), 16) / 255;
      const g = parseInt(hex.substr(2, 2), 16) / 255;
      const b = parseInt(hex.substr(4, 2), 16) / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      let h,
        s,
        l = (max + min) / 2;

      if (max === min) {
        // Color gris: sin matiz, saturación 0
        h = 0;
        s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
          default:
            h = 0;
        }
      }

      hue = Math.round(h * 360);
      saturation = Math.round(s * 100);
      lightness = Math.round(l * 100);
    }

    // Generar variaciones manteniendo el mismo matiz (hue), variando solo saturación y luminosidad
    return Array.from({ length: count }, (_, i) => {
      // Variar la luminosidad: más claro para las primeras subcuentas, más oscuro para las últimas
      const lightVariation = lightness + i * 8 - (count - 1) * 4;

      // Para colores grises (saturación 0), mantener saturación en 0 y solo variar luminosidad
      // Para colores con saturación, variar ligeramente la saturación para crear más contraste
      let satVariation;
      if (saturation === 0) {
        // Color gris: mantener saturación en 0
        satVariation = 0;
      } else {
        // Color con saturación: variar ligeramente
        satVariation = saturation + (i % 2 === 0 ? 5 : -5);
        satVariation = Math.max(50, Math.min(100, satVariation));
      }

      // Mantener el matiz (hue) constante, solo variar saturación y luminosidad
      return `hsl(${hue}, ${satVariation}%, ${Math.max(35, Math.min(75, lightVariation))}%)`;
    });
  };

  // Variaciones muy sutiles del mismo color (solo ±luminosidad pequeña): para Renta4 Efectivo/Inversiones
  const generateSubtleColorVariations = (baseColor, count) => {
    if (count === 0) return [];
    // Recalcular con pasos de luminosidad mucho menores (±3% por paso)
    let hue, saturation, lightness;
    const bc = baseColor.replace(/\s/g, "");
    if (bc.startsWith("hsl")) {
      const match = bc.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
      if (match) {
        hue = parseInt(match[1]);
        saturation = parseInt(match[2]);
        lightness = parseInt(match[3]);
      } else {
        hue = 200;
        saturation = 70;
        lightness = 50;
      }
    } else {
      let hex = baseColor.replace("#", "");
      if (hex.length === 3)
        hex = hex
          .split("")
          .map((c) => c + c)
          .join("");
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const l = (max + min) / 2;
      let h = 0;
      let s = 0;
      if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r:
            h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
            break;
          case g:
            h = ((b - r) / d + 2) / 6;
            break;
          case b:
            h = ((r - g) / d + 4) / 6;
            break;
          default:
            break;
        }
      }
      hue = Math.round(h * 360);
      saturation = Math.round(s * 100);
      lightness = Math.round(l * 100);
    }
    const step = 3;
    const half = (count - 1) / 2;
    return Array.from({ length: count }, (_, i) => {
      const lightVariation = lightness + (i - half) * step;
      return `hsl(${hue}, ${saturation}%, ${Math.max(20, Math.min(85, lightVariation))}%)`;
    });
  };

  // Preparar datos para el gráfico de barras apiladas
  const prepareBankChartData = () => {
    if (!distributionByBank || distributionByBank.length === 0) return [];

    return distributionByBank.map((bank) => {
      const bankColors = generateBankColors(
        bank.bankName,
        bank.subAccounts.length,
        bank.color,
      );
      const dataPoint = {
        bank: bank.bankName,
        total: bank.total,
      };

      // Agregar cada subcuenta como una propiedad separada con nombre único
      bank.subAccounts.forEach((subAccount, index) => {
        const subAccountKey = `${bank.bankName}_sub_${index}`;
        dataPoint[subAccountKey] = subAccount.value;
        dataPoint[`${subAccountKey}_name`] = subAccount.name;
        dataPoint[`${subAccountKey}_type`] = subAccount.type;
        dataPoint[`${subAccountKey}_color`] =
          bankColors.variations[index] || bankColors.base;
      });

      dataPoint._bankColors = bankColors;
      dataPoint._subAccounts = bank.subAccounts;
      dataPoint._bankName = bank.bankName;

      return dataPoint;
    });
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [
        statsRes,
        balanceRes,
        evolutionRes,
        assetClassRes,
        assetTypeRes,
        detailedRes,
        bankRes,
        performanceRes,
      ] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/dashboard/balance-daily"),
        api.get("/investment-history/evolution?months=6"),
        api.get("/dashboard/distribution-by-asset-class"),
        api.get("/dashboard/distribution-by-asset-type"),
        api.get("/dashboard/investments-detailed"),
        api.get("/dashboard/distribution-by-bank"),
        api.get("/dashboard/performance"),
      ]);
      setStats(statsRes.data);
      // Asegurar que los datos estén ordenados por fecha
      const sortedBalanceData = balanceRes.data.sort(
        (a, b) => new Date(a.date) - new Date(b.date),
      );
      // Verificar valores únicos
      const uniqueBalances = [
        ...new Set(sortedBalanceData.map((item) => item.balance)),
      ];

      setBalanceChart(sortedBalanceData);
      setInvestmentsEvolution(evolutionRes.data);
      setDistributionByAssetClass(assetClassRes.data);
      setDistributionByAssetType(assetTypeRes.data);
      setInvestmentsDetailed(detailedRes.data);
      setDistributionByBank(bankRes.data);
      setPerformance(performanceRes.data);
    } catch (error) {}
  };

  if (!stats) {
    return <LoadingSpinner />;
  }

  // Capital aportado INCLUYE EFECTIVO: neto invertido (historial) + efectivo (subcuentas cash/savings/inversión)
  const contributedCapital =
    stats && typeof stats.capitalAportadoIncluyeEfectivo === "number"
      ? Math.max(0, stats.capitalAportadoIncluyeEfectivo)
      : stats &&
          typeof stats.netInvestedCapital === "number" &&
          typeof stats.totalCashSavings === "number"
        ? Math.max(0, stats.netInvestedCapital + stats.totalCashSavings)
        : stats && typeof stats.netInvestedCapital === "number"
          ? Math.max(0, stats.netInvestedCapital)
          : stats && performance
            ? Math.max(
                0,
                (stats.totalBalance || 0) -
                  (performance.accumulatedReturn || 0),
              )
            : null;
  // Rendimiento acumulado = solo inversiones (valor actual - capital neto invertido), no incluye efectivo
  const accumulatedReturn =
    stats && typeof stats.accumulatedReturn === "number"
      ? stats.accumulatedReturn
      : (performance?.accumulatedReturn ?? null);
  const accumulatedReturnPercent =
    contributedCapital != null &&
    contributedCapital > 0 &&
    accumulatedReturn != null
      ? Number(((accumulatedReturn / contributedCapital) * 100).toFixed(2))
      : ((typeof stats?.accumulatedReturnPercent === "number"
          ? stats.accumulatedReturnPercent
          : performance?.accumulatedReturnPercent) ?? 0);

  // Datos para Nivo Treemap: jerarquía root -> inversiones (hojas)
  const nivoTreemapData =
    investmentsDetailed?.length > 0
      ? {
          id: "inversiones",
          children: investmentsDetailed.map((inv) => ({
            id: String(inv._id ?? inv.name),
            value: Math.max(Number(inv.value) || 0, 0.01),
            name: inv.name,
            _id: inv._id,
            totalReturnPercent: inv.totalReturnPercent,
            totalReturn: inv.totalReturn,
          })),
        }
      : null;

  const handleTreemapClick = async (node) => {
    if (!node?.data?._id || !node.isLeaf) return;
    const dataItem = node.data;
    try {
      const res = await api.get(`/investments/${dataItem._id}`);
      setSelectedTreemapInvestment(res.data);
      const [hist, vars] = await Promise.all([
        api.get(`/investment-history/investment/${dataItem._id}`),
        api.get(
          `/investment-history/investment/${dataItem._id}/daily-variations`,
        ),
      ]);
      setDetailInvestmentHistory(hist.data || []);
      setDetailDailyVariations(vars.data || []);
      setShowInvestmentDetailModal(true);
    } catch (err) {
      console.error("Error al cargar detalles:", err);
      setSelectedTreemapInvestment(dataItem);
      setShowInvestmentDetailModal(true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <h1 className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mb-2 tracking-tight">
          {t("dashboard.title")}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 tracking-tight">
          {t("dashboard.subtitle")}
        </p>
      </div>

      {/* Primera fila: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 auto-rows-fr">
        <div
          className="stat-card row-span-2 col-span-1 md:col-span-2 lg:col-span-2 xl:col-span-2 flex flex-col cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setShowBalanceTooltip(true)}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t("dashboard.totalBalance")}
              </p>
              <p className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-gray-100 break-words">
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  maximumFractionDigits: 0,
                }).format(stats.totalBalance)}
              </p>
              {performance &&
                performance.annualizedReturn !== null &&
                contributedCapital !== null && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                    {t("dashboard.contributedCapital")}:{" "}
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(contributedCapital || 0)}
                  </p>
                )}
            </div>
            <div
              className="flex-shrink-0 p-2.5 rounded"
              style={{ backgroundColor: "var(--user-color-600)" }}
            >
              <CgCreditCard className="h-4 w-4 text-white" />
            </div>
          </div>

          {/* Barra de distribución */}
          {(() => {
            const totalAssets =
              (stats.totalCashSavings || 0) + (stats.totalInvestments || 0);
            const cashPercent =
              totalAssets > 0
                ? ((stats.totalCashSavings || 0) / totalAssets) * 100
                : 0;
            const investmentPercent =
              totalAssets > 0
                ? ((stats.totalInvestments || 0) / totalAssets) * 100
                : 0;
            const cashColor = ASSET_CLASS_COLORS["Efectivo"] || "#f59e0b";

            return (
              <div className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      {investmentPercent > 0 && (
                        <div
                          className="bg-green-500 dark:bg-green-600 transition-all duration-300"
                          style={{ width: `${investmentPercent}%` }}
                        />
                      )}
                      {cashPercent > 0 && (
                        <div
                          className="transition-all duration-300"
                          style={{
                            width: `${cashPercent}%`,
                            backgroundColor: cashColor,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-green-500 dark:bg-green-600"></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">
                        {t("dashboard.invested")}:{" "}
                        {investmentPercent.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: cashColor }}
                      ></div>
                      <span className="text-gray-600 dark:text-gray-400 font-medium">
                        {t("dashboard.cash")}: {cashPercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                <div className="pt-3 space-y-2.5 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t("dashboard.investedCapital")}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: "EUR",
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(stats.totalInvestments || 0)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {t("dashboard.cash")}
                    </span>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: "EUR",
                        notation: "compact",
                        maximumFractionDigits: 1,
                      }).format(stats.totalCashSavings || 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Primera fila: Cambio Diario, Rendimiento Mensual, Rendimiento Acumulado, Deuda */}
        {performance && performance.annualizedReturn !== null && (
          <>
            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.dailyChange")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.dailyReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {(performance.dailyReturnPercent || 0) >= 0 ? "+" : ""}
                    {(performance.dailyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(performance.dailyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.dailyReturnPercent || 0) >= 0 ? "bg-purple-500 dark:bg-purple-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.monthlyReturn")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.monthlyReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {(performance.monthlyReturnPercent || 0) >= 0 ? "+" : ""}
                    {(performance.monthlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(performance.monthlyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.monthlyReturnPercent || 0) >= 0 ? "bg-cyan-500 dark:bg-cyan-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.accumulatedReturn")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${accumulatedReturnPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {accumulatedReturnPercent >= 0 ? "+" : ""}
                    {accumulatedReturnPercent.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(accumulatedReturn ?? 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${accumulatedReturnPercent >= 0 ? "bg-green-500 dark:bg-green-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
          </>
        )}

        <div className="stat-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                {t("dashboard.debt")}
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400 break-words">
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(stats.totalDebts || 0)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {new Intl.NumberFormat("es-ES", {
                  style: "currency",
                  currency: "EUR",
                  notation: "compact",
                  maximumFractionDigits: 1,
                }).format(stats.totalMonthlyDebtPayments || 0)}
                {t("dashboard.monthly")}
              </p>
            </div>
            <div className="flex-shrink-0 p-2.5 bg-red-500 dark:bg-red-600 rounded">
              <CgDanger className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>

        {/* Segunda fila: Rendimiento Trimestral, Rendimiento Anual, Rendimiento Anualizado, vs SP500 */}
        {performance && performance.annualizedReturn !== null && (
          <>
            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.quarterlyReturn")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.quarterlyReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {(performance.quarterlyReturnPercent || 0) >= 0 ? "+" : ""}
                    {(performance.quarterlyReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(performance.quarterlyReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.quarterlyReturnPercent || 0) >= 0 ? "bg-teal-500 dark:bg-teal-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.annualReturn")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${(performance.annualReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {(performance.annualReturnPercent || 0) >= 0 ? "+" : ""}
                    {(performance.annualReturnPercent || 0).toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(performance.annualReturn || 0)}
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${(performance.annualReturnPercent || 0) >= 0 ? "bg-green-500 dark:bg-green-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgDollar className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            <div className="stat-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                    {t("dashboard.annualizedReturn")}
                  </p>
                  <p
                    className={`text-2xl sm:text-3xl font-bold break-words ${performance.annualizedReturn >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                  >
                    {performance.annualizedReturn >= 0 ? "+" : ""}
                    {performance.annualizedReturn.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Período: {performance.years.toFixed(1)} años
                  </p>
                </div>
                <div
                  className={`flex-shrink-0 p-2.5 rounded ${performance.annualizedReturn >= 0 ? "bg-blue-500 dark:bg-blue-600" : "bg-red-500 dark:bg-red-600"}`}
                >
                  <CgTrending className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>

            {performance.sp500Comparison && (
              <div className="stat-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
                      {t("dashboard.vsSP500")}
                    </p>
                    {performance.sp500Comparison.outperformance !== null ? (
                      <>
                        <p
                          className={`text-2xl sm:text-3xl font-bold break-words ${performance.sp500Comparison.outperformance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {performance.sp500Comparison.outperformance >= 0
                            ? "+"
                            : ""}
                          {performance.sp500Comparison.outperformance.toFixed(
                            2,
                          )}
                          %
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                          Tu CAGR: {performance.annualizedReturn.toFixed(2)}% |
                          S&P 500:{" "}
                          {performance.sp500Comparison.historicalAnnualReturn}%
                        </p>
                      </>
                    ) : (
                      <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 break-words">
                        {performance.annualizedReturn.toFixed(2)}% vs{" "}
                        {performance.sp500Comparison.historicalAnnualReturn}%
                      </p>
                    )}
                  </div>
                  <div
                    className={`flex-shrink-0 p-2.5 rounded ${performance.sp500Comparison.outperformance !== null && performance.sp500Comparison.outperformance >= 0 ? "bg-purple-500 dark:bg-purple-600" : "bg-gray-500 dark:bg-gray-600"}`}
                  >
                    {performance.sp500Comparison.outperformance !== null &&
                    performance.sp500Comparison.outperformance >= 0 ? (
                      <CgArrowUp className="h-4 w-4 text-white" />
                    ) : (
                      <CgArrowDown className="h-4 w-4 text-white" />
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Fila 1: Gráficas de evolución (patrimonio total + inversiones) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {balanceChart.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("dashboard.totalNetWorthEvolution")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={balanceChart.map((item) => {
                  const balanceValue = parseFloat(item.balance) || 0;
                  const dateStr = new Date(item.date).toLocaleDateString(
                    "es-ES",
                    { month: "short", day: "numeric" },
                  );
                  return { date: dateStr, balance: balanceValue };
                })}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="balanceGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.4} />
                    <stop
                      offset="100%"
                      stopColor="#0ea5e9"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={
                    isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
                  }
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: isDark ? "#9ca3af" : "#6b7280", fontSize: 11 }}
                  axisLine={{ stroke: isDark ? "#404040" : "#e5e7eb" }}
                  tickLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fill: isDark ? "#9ca3af" : "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 0,
                    }).format(value)
                  }
                  width={52}
                />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload}
                      label={label}
                      labelLabel="Fecha"
                      valueFormatter={(v) =>
                        new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        }).format(v)
                      }
                      isDark={isDark}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="balance"
                  name={t("dashboard.totalNetWorth")}
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  fill="url(#balanceGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "white" }}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {investmentsEvolution.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Evolución de Inversiones
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={investmentsEvolution.map((item) => ({
                  date: new Date(item.date).toLocaleDateString("es-ES", {
                    month: "short",
                    day: "numeric",
                  }),
                  value: item.totalValue,
                }))}
                margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id="investmentsGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop
                      offset="100%"
                      stopColor="#8b5cf6"
                      stopOpacity={0.02}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={
                    isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
                  }
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: isDark ? "#9ca3af" : "#6b7280", fontSize: 11 }}
                  axisLine={{ stroke: isDark ? "#404040" : "#e5e7eb" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: isDark ? "#9ca3af" : "#6b7280", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) =>
                    new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      notation: "compact",
                      maximumFractionDigits: 0,
                    }).format(value)
                  }
                  width={52}
                />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload}
                      label={label}
                      labelLabel="Fecha"
                      valueFormatter={(v) =>
                        new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        }).format(v)
                      }
                      isDark={isDark}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Valor Total Inversiones"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="url(#investmentsGradient)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, fill: "white" }}
                  isAnimationActive
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Fila 2: Pie charts (clase de activo + tipo de renta) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card overflow-hidden">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t("dashboard.byAssetClass")}
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Pie
                data={distributionByAssetClass}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                stroke={isDark ? "#2c2c2e" : "#fff"}
                strokeWidth={2}
                label={({ name, percent }) =>
                  percent >= 0.08
                    ? `${name} ${(percent * 100).toFixed(0)}%`
                    : ""
                }
                labelLine={{
                  stroke: isDark ? "#525252" : "#d1d5db",
                  strokeWidth: 1,
                }}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
              >
                {distributionByAssetClass.map((entry, index) => {
                  const color =
                    ASSET_CLASS_COLORS[entry.name] ||
                    COLORS[index % COLORS.length];
                  return <Cell key={`asset-${index}`} fill={color} />;
                })}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const entry = payload[0].payload;
                  const total = distributionByAssetClass.reduce(
                    (s, d) => s + d.value,
                    0,
                  );
                  const pct = total > 0 ? (entry.value / total) * 100 : 0;
                  const bg = isDark
                    ? "bg-[#2c2c2e] border-[#404040]"
                    : "bg-white border-gray-200";
                  return (
                    <div
                      className={`${bg} border rounded-xl shadow-xl px-4 py-3`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{
                            backgroundColor:
                              ASSET_CLASS_COLORS[entry.name] ||
                              COLORS[
                                distributionByAssetClass.indexOf(entry) %
                                  COLORS.length
                              ],
                          }}
                        />
                        <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                          {entry.name}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: "EUR",
                        }).format(entry.value)}{" "}
                        · {pct.toFixed(1)}%
                      </div>
                    </div>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {distributionByAssetType.length > 0 && (
          <div className="card overflow-hidden">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              {t("dashboard.byAssetType")}
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
                <Pie
                  data={distributionByAssetType}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={2}
                  dataKey="value"
                  stroke={isDark ? "#2c2c2e" : "#fff"}
                  strokeWidth={2}
                  nameKey="id"
                  label={({ id, percent }) =>
                    percent >= 0.08
                      ? `${t(`dashboard.assetType.${id}`)} ${(percent * 100).toFixed(0)}%`
                      : ""
                  }
                  labelLine={{
                    stroke: isDark ? "#525252" : "#d1d5db",
                    strokeWidth: 1,
                  }}
                  isAnimationActive
                  animationDuration={600}
                  animationEasing="ease-out"
                >
                  {distributionByAssetType.map((entry, index) => {
                    const color =
                      ASSET_TYPE_COLORS[entry.id] ||
                      COLORS[index % COLORS.length];
                    return <Cell key={`asset-type-${entry.id}`} fill={color} />;
                  })}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0].payload;
                    const total = distributionByAssetType.reduce(
                      (s, d) => s + d.value,
                      0,
                    );
                    const pct = total > 0 ? (entry.value / total) * 100 : 0;
                    const bg = isDark
                      ? "bg-[#2c2c2e] border-[#404040]"
                      : "bg-white border-gray-200";
                    return (
                      <div
                        className={`${bg} border rounded-xl shadow-xl px-4 py-3`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                ASSET_TYPE_COLORS[entry.id] ||
                                COLORS[
                                  distributionByAssetType.indexOf(entry) %
                                    COLORS.length
                                ],
                            }}
                          />
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                            {t(`dashboard.assetType.${entry.id}`)}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          }).format(entry.value)}{" "}
                          · {pct.toFixed(1)}%
                        </div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Distribución por banco - 100% ancho */}
      {distributionByBank && distributionByBank.length > 0 && (
        <div className="card w-full">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t("dashboard.byBank")}
          </h2>
          <BankBarList
            banks={distributionByBank}
            generateBankColors={generateBankColors}
            isDark={isDark}
            formatCurrency={(v) =>
              new Intl.NumberFormat("es-ES", {
                style: "currency",
                currency: "EUR",
              }).format(v)
            }
          />
        </div>
      )}

      {/* Distribución por inversión individual (Treemap) - 100% ancho */}
      {nivoTreemapData && investmentsDetailed.length > 0 && (
        <div className="card w-full overflow-visible">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {t("dashboard.byInvestment")}
            </h2>
            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-green-600" aria-hidden />
                Beneficio
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: "#b91c1c" }}
                  aria-hidden
                />
                Pérdida
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-sm bg-slate-500" aria-hidden />
                Sin datos
              </span>
            </div>
          </div>
          <div
            className="w-full overflow-visible rounded-lg bg-gray-50 dark:bg-gray-900/50"
            style={{ height: "500px", minHeight: "500px" }}
          >
            <ResponsiveTreeMap
              data={nivoTreemapData}
              identity="id"
              value="value"
              valueFormat=".2s"
              leavesOnly
              tile="squarify"
              innerPadding={4}
              outerPadding={4}
              margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
              nodeOpacity={1}
              colors={(node) => {
                const pct = node.data.totalReturnPercent;
                if (pct == null) return "#64748b";
                if (pct === 0) return "#64748b";
                const abs = Math.abs(pct);
                if (pct > 0) {
                  if (abs >= 30) return "#047857";
                  if (abs >= 15) return "#166534";
                  if (abs >= 5) return "#15803d";
                  return "#16a34a";
                }
                if (abs >= 30) return "#991b1b";
                if (abs >= 15) return "#b91c1c";
                if (abs >= 5) return "#dc2626";
                return "#ef4444";
              }}
              borderWidth={1}
              borderColor={{ from: "color", modifiers: [["darker", 0.15]] }}
              enableParentLabel={false}
              label={(node) => {
                const name = String(node.data?.name ?? node.id ?? "");
                const w = node.width ?? 0;
                const h = node.height ?? 0;
                const minSide = Math.min(w, h);
                if (minSide < 36) return "";
                const maxChars = Math.max(5, Math.floor(minSide / 8));
                if (name.length <= maxChars) return name;
                return name.slice(0, maxChars).trim() + "…";
              }}
              labelSkipSize={36}
              labelTextColor="#ffffff"
              orientLabel={false}
              theme={{
                labels: {
                  text: {
                    fill: "#ffffff",
                    fontSize: 14,
                    fontWeight: 600,
                  },
                },
              }}
              animate
              motionConfig="gentle"
              isInteractive
              onClick={handleTreemapClick}
              tooltip={({ node }) => {
                const d = node.data;
                const name = d.name ?? node.id;
                const value = node.value ?? 0;
                const returnPct = d.totalReturnPercent;
                const returnAmt = d.totalReturn;
                const bg = isDark
                  ? "bg-[#2c2c2e] border-[#404040]"
                  : "bg-white border-gray-200";
                return (
                  <div
                    className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[220px]`}
                    style={{ zIndex: 9999 }}
                  >
                    <p
                      className="font-semibold text-gray-900 dark:text-gray-100 text-base mb-2 truncate"
                      title={name}
                    >
                      {name}
                    </p>
                    <div className="space-y-2 text-base">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500 dark:text-gray-400">
                          Valor
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                          {new Intl.NumberFormat("es-ES", {
                            style: "currency",
                            currency: "EUR",
                          }).format(value)}
                        </span>
                      </div>
                      {(returnPct != null || returnAmt != null) && (
                        <div className="flex justify-between gap-4 pt-1 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-500 dark:text-gray-400">
                            Rentabilidad
                          </span>
                          <span
                            className={`font-medium tabular-nums ${
                              returnPct != null && returnPct > 0
                                ? "text-green-600 dark:text-green-400"
                                : returnPct != null && returnPct < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            {returnPct != null
                              ? `${returnPct >= 0 ? "+" : ""}${returnPct.toFixed(2)}%`
                              : "—"}
                            {returnAmt != null && (
                              <span className="ml-1.5 text-sm">
                                ({returnAmt >= 0 ? "+" : ""}
                                {new Intl.NumberFormat("es-ES", {
                                  style: "currency",
                                  currency: "EUR",
                                }).format(returnAmt)}
                                )
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        </div>
      )}

      {/* Tooltip/Modal del Balance Total */}
      {showBalanceTooltip && (
        <div
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => setShowBalanceTooltip(false)}
        >
          <div
            className="modal-content max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {t("dashboard.totalBalance")}
              </h2>
              <button
                onClick={() => setShowBalanceTooltip(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Balance Total y Capital Aportado */}
              <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {t("dashboard.totalBalance")}
                  </span>
                  <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(stats.totalBalance)}
                  </span>
                </div>
                {performance && contributedCapital !== null && (
                  <>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {t("dashboard.contributedCapital")}
                      </span>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: "EUR",
                          maximumFractionDigits: 0,
                        }).format(contributedCapital || 0)}
                      </span>
                    </div>
                    {(() => {
                      const totalReturn =
                        stats.totalBalance - (contributedCapital || 0);
                      const totalReturnPercent =
                        (contributedCapital || 0) > 0
                          ? (totalReturn / (contributedCapital || 0)) * 100
                          : 0;
                      return (
                        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {t("dashboard.totalProfitLoss")}
                          </span>
                          <div className="text-right">
                            <span
                              className={`text-sm font-semibold ${totalReturn >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                            >
                              {totalReturn >= 0 ? "+" : ""}
                              {new Intl.NumberFormat("es-ES", {
                                style: "currency",
                                currency: "EUR",
                                maximumFractionDigits: 0,
                              }).format(totalReturn)}
                            </span>
                            <span
                              className={`text-xs ml-2 ${totalReturnPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                            >
                              ({totalReturnPercent >= 0 ? "+" : ""}
                              {totalReturnPercent.toFixed(2)}%)
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Patrimonio Neto */}
              {stats.totalDebts > 0 && (
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {t("dashboard.netWorth")}
                    </span>
                    <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                      }).format(stats.totalBalance - (stats.totalDebts || 0))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {t("dashboard.totalDebt")}
                    </span>
                    <span className="text-xs font-medium text-red-600 dark:text-red-400">
                      {new Intl.NumberFormat("es-ES", {
                        style: "currency",
                        currency: "EUR",
                        maximumFractionDigits: 0,
                      }).format(stats.totalDebts || 0)}
                    </span>
                  </div>
                </div>
              )}

              {/* Desglose de Activos */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {t("dashboard.assetBreakdown")}
                </h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Capital Invertido
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(stats.totalInvestments || 0)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Efectivo
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {new Intl.NumberFormat("es-ES", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 0,
                    }).format(stats.totalCashSavings || 0)}
                  </span>
                </div>
                {(() => {
                  const totalAssets =
                    (stats.totalCashSavings || 0) +
                    (stats.totalInvestments || 0);
                  const cashPercent =
                    totalAssets > 0
                      ? ((stats.totalCashSavings || 0) / totalAssets) * 100
                      : 0;
                  const investmentPercent =
                    totalAssets > 0
                      ? ((stats.totalInvestments || 0) / totalAssets) * 100
                      : 0;
                  const cashColor = ASSET_CLASS_COLORS["Efectivo"] || "#f59e0b";

                  return (
                    <div className="pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                        <span>{t("dashboard.distribution")}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full flex">
                          {investmentPercent > 0 && (
                            <div
                              className="bg-green-500 dark:bg-green-600 transition-all duration-300"
                              style={{ width: `${investmentPercent}%` }}
                            />
                          )}
                          {cashPercent > 0 && (
                            <div
                              className="transition-all duration-300"
                              style={{
                                width: `${cashPercent}%`,
                                backgroundColor: cashColor,
                              }}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-600"></div>
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("dashboard.invested")}:{" "}
                            {investmentPercent.toFixed(1)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: cashColor }}
                          ></div>
                          <span className="text-gray-600 dark:text-gray-400">
                            {t("dashboard.cash")}: {cashPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Rendimientos */}
              {performance && performance.annualizedReturn !== null && (
                <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Rendimientos
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {accumulatedReturn !== null &&
                      accumulatedReturnPercent !== null && (
                        <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Acumulado
                          </div>
                          <div
                            className={`text-sm font-bold ${(accumulatedReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {(accumulatedReturnPercent || 0) >= 0 ? "+" : ""}
                            {(accumulatedReturnPercent || 0).toFixed(2)}%
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(accumulatedReturn || 0)}
                          </div>
                        </div>
                      )}
                    {performance.annualizedReturn !== null &&
                      performance.annualizedReturnPercent !== null && (
                        <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Anualizado
                          </div>
                          <div
                            className={`text-sm font-bold ${(performance.annualizedReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {(performance.annualizedReturnPercent || 0) >= 0
                              ? "+"
                              : ""}
                            {(performance.annualizedReturnPercent || 0).toFixed(
                              2,
                            )}
                            %
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(performance.annualizedReturn || 0)}
                          </div>
                        </div>
                      )}
                    {performance.monthlyReturn !== null &&
                      performance.monthlyReturnPercent !== null && (
                        <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Mensual
                          </div>
                          <div
                            className={`text-sm font-bold ${(performance.monthlyReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {(performance.monthlyReturnPercent || 0) >= 0
                              ? "+"
                              : ""}
                            {(performance.monthlyReturnPercent || 0).toFixed(2)}
                            %
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(performance.monthlyReturn || 0)}
                          </div>
                        </div>
                      )}
                    {performance.dailyReturn !== null &&
                      performance.dailyReturnPercent !== null && (
                        <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3">
                          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                            Diario
                          </div>
                          <div
                            className={`text-sm font-bold ${(performance.dailyReturnPercent || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                          >
                            {(performance.dailyReturnPercent || 0) >= 0
                              ? "+"
                              : ""}
                            {(performance.dailyReturnPercent || 0).toFixed(2)}%
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: "EUR",
                              notation: "compact",
                              maximumFractionDigits: 1,
                            }).format(performance.dailyReturn || 0)}
                          </div>
                        </div>
                      )}
                  </div>
                  {performance.vsSP500 !== null &&
                    performance.vsSP500 !== undefined && (
                      <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-3 mt-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                          vs S&P 500
                        </div>
                        <div
                          className={`text-sm font-bold ${(performance.vsSP500 || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
                        >
                          {(performance.vsSP500 || 0) >= 0 ? "+" : ""}
                          {(performance.vsSP500 || 0).toFixed(2)}%
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle de inversión desde Treemap */}
      {showInvestmentDetailModal && selectedTreemapInvestment && (
        <div
          className="modal-overlay bg-black/50 dark:bg-black/70 flex items-center justify-center"
          style={{ zIndex: 10000 }}
          onClick={() => {
            setShowInvestmentDetailModal(false);
            setSelectedTreemapInvestment(null);
            setDetailInvestmentHistory([]);
            setDetailDailyVariations([]);
          }}
        >
          <div
            className="modal-content max-w-5xl w-full p-4 h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4 flex-shrink-0">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  {selectedTreemapInvestment.name}
                </h2>
                {selectedTreemapInvestment.symbol && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {selectedTreemapInvestment.symbol}
                  </p>
                )}
                {selectedTreemapInvestment.isin &&
                  !selectedTreemapInvestment.symbol && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      ISIN: {selectedTreemapInvestment.isin}
                    </p>
                  )}
              </div>
              <button
                onClick={() => {
                  setShowInvestmentDetailModal(false);
                  setSelectedTreemapInvestment(null);
                  setDetailInvestmentHistory([]);
                  setDetailDailyVariations([]);
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 overflow-hidden min-h-0">
              {/* Columna izquierda */}
              <div className="space-y-4 overflow-y-auto pr-2 h-full">
                {/* Información básica */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Información Básica
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Tipo:
                      </span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {getTypeLabel(
                          selectedTreemapInvestment.type,
                          selectedTreemapInvestment.isAutomatedPortfolio,
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-gray-400">
                        Moneda:
                      </span>
                      <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                        {selectedTreemapInvestment.currency}
                      </span>
                    </div>
                    {(selectedTreemapInvestment.account ||
                      selectedTreemapInvestment.subAccount) && (
                      <div className="col-span-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <span className="text-gray-600 dark:text-gray-400">
                          Cuenta:
                        </span>
                        <div className="mt-1">
                          {selectedTreemapInvestment.account && (
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {selectedTreemapInvestment.account.name ||
                                selectedTreemapInvestment.account.bankName ||
                                "N/A"}
                            </span>
                          )}
                          {selectedTreemapInvestment.subAccount && (
                            <span className="ml-2 text-gray-600 dark:text-gray-400">
                              → {selectedTreemapInvestment.subAccount.name}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedTreemapInvestment.assetClass && (
                      <div className="col-span-2">
                        <span className="text-gray-600 dark:text-gray-400">
                          Clase de Activo:
                        </span>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {selectedTreemapInvestment.assetClass ===
                            "fixed_income" && (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                                {t("investments.assetClassLabels.fixedIncome")}
                              </span>
                              {getFixedIncomeSubtypeLabel(
                                selectedTreemapInvestment.fixedIncomeSubtype,
                              ) && (
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getFixedIncomeSubtypeTone(
                                    selectedTreemapInvestment.fixedIncomeSubtype,
                                  )}`}
                                >
                                  {getFixedIncomeSubtypeLabel(
                                    selectedTreemapInvestment.fixedIncomeSubtype,
                                  )}
                                </span>
                              )}
                            </>
                          )}
                          {selectedTreemapInvestment.assetClass ===
                            "variable_income" && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                              {t("investments.assetClassLabels.variableIncome")}
                            </span>
                          )}
                          {selectedTreemapInvestment.assetClass === "mixed" && (
                            <>
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                                {t("investments.assetClassLabels.mixed")}
                              </span>
                              <span className="text-xs text-gray-600 dark:text-gray-400">
                                {t(
                                  "investments.assetClassLabels.fixedIncomeShort",
                                )}
                                :{" "}
                                {selectedTreemapInvestment.fixedIncomePercentage ||
                                  0}
                                % |{" "}
                                {t(
                                  "investments.assetClassLabels.variableIncomeShort",
                                )}
                                :{" "}
                                {selectedTreemapInvestment.variableIncomePercentage ||
                                  0}
                                %
                              </span>
                            </>
                          )}
                          {selectedTreemapInvestment.isAlternative && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200">
                              {t("investments.assetClassLabels.alternative")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {selectedTreemapInvestment.isAutomatedPortfolio && (
                      <div className="col-span-2">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200">
                          {t("investments.investmentTypes.automatedPortfolio")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Información financiera */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Información Financiera
                  </h3>
                  <div className="space-y-3 text-sm">
                    {selectedTreemapInvestment.isAutomatedPortfolio ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Monto invertido:
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: selectedTreemapInvestment.currency,
                            }).format(selectedTreemapInvestment.quantity)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Valor actual:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {formatPrice(
                              selectedTreemapInvestment.currentPrice,
                              selectedTreemapInvestment.currency,
                            )}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Cantidad:
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedTreemapInvestment.quantity} unidades
                          </span>
                        </div>
                        {selectedTreemapInvestment.averagePurchasePrice && (
                          <div className="flex justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Precio medio compra:
                            </span>
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                              {formatPrice(
                                selectedTreemapInvestment.averagePurchasePrice,
                                selectedTreemapInvestment.currency,
                              )}
                            </span>
                          </div>
                        )}
                        {selectedTreemapInvestment.purchasePrice &&
                          !selectedTreemapInvestment.averagePurchasePrice && (
                            <div className="flex justify-between">
                              <span className="text-gray-600 dark:text-gray-400">
                                Precio de compra:
                              </span>
                              <span className="font-medium text-gray-900 dark:text-gray-100">
                                {formatPrice(
                                  selectedTreemapInvestment.purchasePrice,
                                  selectedTreemapInvestment.currency,
                                )}
                              </span>
                            </div>
                          )}
                        <div className="flex justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Precio actual:
                          </span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {formatPrice(
                              selectedTreemapInvestment.currentPrice,
                              selectedTreemapInvestment.currency,
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                          <span className="text-gray-600 dark:text-gray-400">
                            Valor total:
                          </span>
                          <span className="font-bold text-gray-900 dark:text-gray-100">
                            {new Intl.NumberFormat("es-ES", {
                              style: "currency",
                              currency: selectedTreemapInvestment.currency,
                            }).format(
                              selectedTreemapInvestment.quantity *
                                selectedTreemapInvestment.currentPrice,
                            )}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <span className="text-gray-600 dark:text-gray-400">
                        Ganancia/Pérdida:
                      </span>
                      <span
                        className={`font-bold flex items-center ${
                          calculateProfitLoss(selectedTreemapInvestment) >= 0
                            ? "text-green-600"
                            : "text-red-600"
                        }`}
                      >
                        {calculateProfitLoss(selectedTreemapInvestment) >= 0 ? (
                          <CgTrending className="h-4 w-4 mr-1" />
                        ) : (
                          <CgTrendingDown className="h-4 w-4 mr-1" />
                        )}
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: selectedTreemapInvestment.currency,
                        }).format(
                          calculateProfitLoss(selectedTreemapInvestment),
                        )}
                        <span className="ml-2">
                          (
                          {calculateProfitLossPercentage(
                            selectedTreemapInvestment,
                          ).toFixed(2)}
                          %)
                        </span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Fechas */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Fechas
                  </h3>
                  <div className="space-y-2 text-sm">
                    {selectedTreemapInvestment.purchaseDate && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Fecha de compra:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            selectedTreemapInvestment.purchaseDate,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                    {selectedTreemapInvestment.createdAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Fecha de creación:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            selectedTreemapInvestment.createdAt,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                    {selectedTreemapInvestment.updatedAt && (
                      <div className="flex justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Última actualización:
                        </span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {new Date(
                            selectedTreemapInvestment.updatedAt,
                          ).toLocaleDateString("es-ES")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Configuración - Solo mostrar si se puede activar/desactivar actualización automática */}
                {(selectedTreemapInvestment.symbol ||
                  selectedTreemapInvestment.isin) &&
                  !selectedTreemapInvestment.isAutomatedPortfolio && (
                    <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Configuración
                      </h3>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Actualización automática:
                          </span>
                          <span
                            className={`font-medium ${
                              selectedTreemapInvestment.autoUpdate !== false
                                ? "text-green-600 dark:text-green-400"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {selectedTreemapInvestment.autoUpdate !== false
                              ? "Activada"
                              : "Desactivada"}
                          </span>
                        </div>
                        {selectedTreemapInvestment.platformUrl && (
                          <div>
                            <span className="text-gray-600 dark:text-gray-400">
                              Plataforma:
                            </span>
                            <a
                              href={selectedTreemapInvestment.platformUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-2 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {selectedTreemapInvestment.platformUrl}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                {/* Notas */}
                {selectedTreemapInvestment.notes && (
                  <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                      Notas
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {selectedTreemapInvestment.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Columna derecha */}
              <div className="flex flex-col gap-4 overflow-y-auto pl-2 h-full">
                {/* Gráfica de evolución del valor */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Evolución del Valor
                  </h3>
                  {detailInvestmentHistory.length > 0 ? (
                    <div style={{ height: "290px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={detailInvestmentHistory.map((h) => ({
                            date: new Date(h.date).toLocaleDateString("es-ES", {
                              day: "2-digit",
                              month: "short",
                            }),
                            value: h.totalValue,
                            dailyChange: h.dailyChangeAmount || 0,
                          }))}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="detailValueGradient"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="0%"
                                stopColor="#0ea5e9"
                                stopOpacity={0.35}
                              />
                              <stop
                                offset="100%"
                                stopColor="#0ea5e9"
                                stopOpacity={0.02}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={
                              isDark
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.06)"
                            }
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{
                              fill: isDark ? "#9ca3af" : "#6b7280",
                              fontSize: 11,
                            }}
                            axisLine={{
                              stroke: isDark ? "#404040" : "#e5e7eb",
                            }}
                            tickLine={false}
                            angle={-45}
                            textAnchor="end"
                            height={70}
                          />
                          <YAxis
                            tick={{
                              fill: isDark ? "#9ca3af" : "#6b7280",
                              fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value) =>
                              new Intl.NumberFormat("es-ES", {
                                style: "currency",
                                currency: selectedTreemapInvestment.currency,
                                notation: "compact",
                                maximumFractionDigits: 0,
                              }).format(value)
                            }
                            width={50}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0]?.payload;
                              const totalValue = data?.value || 0;
                              const formattedValue = new Intl.NumberFormat(
                                "es-ES",
                                {
                                  style: "currency",
                                  currency: selectedTreemapInvestment.currency,
                                },
                              ).format(totalValue);
                              const bg = isDark
                                ? "bg-[#2c2c2e] border-[#404040]"
                                : "bg-white border-gray-200";
                              return (
                                <div
                                  className={`${bg} border rounded-xl shadow-xl px-4 py-3`}
                                >
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    {label}
                                  </p>
                                  <div className="flex justify-between items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-300">
                                      Valor total
                                    </span>
                                    <span className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                      {formattedValue}
                                    </span>
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            name="Valor Total"
                            stroke="#0ea5e9"
                            strokeWidth={2}
                            fill="url(#detailValueGradient)"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2, fill: "white" }}
                            isAnimationActive
                            animationDuration={600}
                            animationEasing="ease-out"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">
                        No hay datos de historial para mostrar
                      </p>
                      <p className="text-xs mt-2">
                        El historial se genera automáticamente con las
                        operaciones
                      </p>
                    </div>
                  )}
                </div>

                {/* Gráfica de variación diaria */}
                <div className="bg-gray-50 dark:bg-[#2c2c2e]/50 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Variación Diaria
                  </h3>
                  {detailDailyVariations.length > 0 ? (
                    <div style={{ height: "290px" }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={detailDailyVariations.map((v) => {
                            const changeAmount =
                              v.dailyChangeAmount !== null &&
                              v.dailyChangeAmount !== undefined
                                ? v.dailyChangeAmount
                                : 0;
                            return {
                              date: new Date(v.date).toLocaleDateString(
                                "es-ES",
                                { day: "2-digit", month: "short" },
                              ),
                              dailyChange: changeAmount,
                              dailyChangePercent:
                                v.dailyChangePercent !== null &&
                                v.dailyChangePercent !== undefined
                                  ? v.dailyChangePercent
                                  : null,
                              dailyChangePositive:
                                changeAmount >= 0 ? changeAmount : 0,
                              dailyChangeNegative:
                                changeAmount < 0 ? changeAmount : 0,
                            };
                          })}
                          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                          barCategoryGap="20%"
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke={
                              isDark
                                ? "rgba(255,255,255,0.06)"
                                : "rgba(0,0,0,0.06)"
                            }
                            vertical={false}
                          />
                          <XAxis
                            dataKey="date"
                            tick={{
                              fill: isDark ? "#9ca3af" : "#6b7280",
                              fontSize: 11,
                            }}
                            axisLine={{
                              stroke: isDark ? "#404040" : "#e5e7eb",
                            }}
                            tickLine={false}
                            angle={-45}
                            textAnchor="end"
                            height={70}
                          />
                          <YAxis
                            tick={{
                              fill: isDark ? "#9ca3af" : "#6b7280",
                              fontSize: 11,
                            }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(value) =>
                              new Intl.NumberFormat("es-ES", {
                                style: "currency",
                                currency: selectedTreemapInvestment.currency,
                                notation: "compact",
                                maximumFractionDigits: 0,
                              }).format(value)
                            }
                            width={50}
                          />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (!active || !payload?.length) return null;
                              const data = payload[0]?.payload;
                              const dailyChange =
                                data?.dailyChange !== null &&
                                data?.dailyChange !== undefined
                                  ? data.dailyChange
                                  : 0;
                              const dailyChangePercent =
                                data?.dailyChangePercent;
                              const formattedChange = new Intl.NumberFormat(
                                "es-ES",
                                {
                                  style: "currency",
                                  currency: selectedTreemapInvestment.currency,
                                },
                              ).format(Math.abs(dailyChange));
                              const bg = isDark
                                ? "bg-[#2c2c2e] border-[#404040]"
                                : "bg-white border-gray-200";
                              return (
                                <div
                                  className={`${bg} border rounded-xl shadow-xl px-4 py-3 min-w-[160px]`}
                                >
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    {label}
                                  </p>
                                  <div className="space-y-2 text-sm">
                                    <div className="flex justify-between items-center gap-4">
                                      <span className="text-gray-600 dark:text-gray-300">
                                        Cambio diario
                                      </span>
                                      <span
                                        className={`font-semibold ${
                                          dailyChange > 0
                                            ? "text-green-600 dark:text-green-400"
                                            : dailyChange < 0
                                              ? "text-red-600 dark:text-red-400"
                                              : "text-gray-500 dark:text-gray-400"
                                        }`}
                                      >
                                        {dailyChange > 0
                                          ? "+"
                                          : dailyChange < 0
                                            ? "-"
                                            : ""}
                                        {formattedChange}
                                        {dailyChange === 0 &&
                                          " (Sin variación)"}
                                      </span>
                                    </div>
                                    {dailyChangePercent !== null &&
                                    dailyChangePercent !== undefined ? (
                                      <div className="flex justify-between items-center gap-4">
                                        <span className="text-gray-600 dark:text-gray-300">
                                          Variación
                                        </span>
                                        <span
                                          className={`font-semibold ${
                                            dailyChangePercent > 0
                                              ? "text-green-600 dark:text-green-400"
                                              : dailyChangePercent < 0
                                                ? "text-red-600 dark:text-red-400"
                                                : "text-gray-500 dark:text-gray-400"
                                          }`}
                                        >
                                          {dailyChangePercent > 0 ? "+" : ""}
                                          {dailyChangePercent.toFixed(2)}%
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="flex justify-between items-center gap-4 text-gray-500 dark:text-gray-400">
                                        <span>Variación</span>
                                        <span className="text-xs">
                                          Sin datos previos
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Bar
                            dataKey="dailyChangePositive"
                            fill="#10b981"
                            name="Ganancia"
                            radius={[6, 6, 0, 0]}
                            isAnimationActive
                            animationDuration={500}
                            animationEasing="ease-out"
                          />
                          <Bar
                            dataKey="dailyChangeNegative"
                            fill="#ef4444"
                            name="Pérdida"
                            radius={[6, 6, 0, 0]}
                            isAnimationActive
                            animationDuration={500}
                            animationEasing="ease-out"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      <p className="text-sm">
                        No hay datos de variación diaria para mostrar
                      </p>
                      <p className="text-xs mt-2">
                        Las variaciones se generan automáticamente al actualizar
                        precios
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex gap-3 mt-1 pt-1 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => {
                  navigate("/investments");
                }}
                className="flex-1 btn-secondary flex items-center justify-center"
              >
                <CgTime className="h-4 w-4 mr-2" />
                Ver en Inversiones
              </button>
              <button
                onClick={() => {
                  setShowInvestmentDetailModal(false);
                  setSelectedTreemapInvestment(null);
                  setDetailInvestmentHistory([]);
                  setDetailDailyVariations([]);
                }}
                className="flex-1 btn-primary"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
