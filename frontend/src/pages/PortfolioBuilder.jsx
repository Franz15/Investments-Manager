import React, { useState, useEffect, useMemo } from "react";
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
import {
  DEFAULT_PORTFOLIO_ALLOCATION,
  DEFAULT_RV_DISTRIBUTION,
  DEFAULT_SECTION_DESCRIPTIONS,
  DEFAULT_SECTION_TIPS,
  DEFAULT_SECTION_VIDEOS,
} from "../data/portfolioBuilderData";

const PortfolioBuilder = () => {
  const { t } = useTranslation();
  const { isDark } = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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

  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [addingExtra, setAddingExtra] = useState(null);

  // Mapear un fondo de la API al formato que usa la UI
  const mapFundToSection = (f) => ({
    name: f.name,
    isin: f.isin ?? null,
    link: f.link ?? null,
    volatility12M: f.volatility12M ?? null,
    return12M: f.return12M ?? null,
    notes: f.notes ?? null,
  });

  // Construir datos del portfolio desde config (API: allocation, rvDistribution, funds con showInSection)
  // Solo se muestran fondos "principales" (Cartera1) + los que el usuario ha añadido como extra.
  const buildPortfolioDataFromConfig = (config, tFn) => {
    const allocation = config?.allocation || DEFAULT_PORTFOLIO_ALLOCATION;
    const rvDist = config?.rvDistribution || DEFAULT_RV_DISTRIBUTION;
    const fundsList = config?.funds || [];
    const rvDistributionIsins = new Set(
      (rvDist || []).map((d) => (d.isin || "").trim()).filter(Boolean),
    );
    const byCategory = (cat, onlyShowInSection = true) =>
      fundsList
        .filter(
          (f) =>
            f.category === cat &&
            (!onlyShowInSection || f.showInSection === true),
        )
        .map(mapFundToSection);
    const rvFundsOnlyExtras = () =>
      fundsList
        .filter(
          (f) =>
            f.category === "Renta Variable" &&
            f.showInSection === true &&
            !rvDistributionIsins.has((f.isin || "").trim()),
        )
        .map(mapFundToSection);

    // Fallback para fondos conocidos que pueden no estar en fundsList (p. ej. Heptagon en configs antiguas)
    const KNOWN_RV_FUND_FALLBACKS = {
      Heptagon: {
        name: "Heptagon Fund ICAV - Kopernik Global All-Cap Equity Fund AE EUR Acc",
        isin: "IE00BH6XSF26",
        link: "https://www.finect.com/fondos-inversion/IE00BH6XSF26-Heptagon_kopernik_glb_allcp_eq_ae__acc",
        volatility12M: "9.87%",
        return12M: "54.87%",
      },
    };

    // Enriquecer cada ítem de la distribución RV con datos de fundsList (p. ej. Heptagon con ISIN, link, volatilidad, rentabilidad)
    const enrichDistributionItem = (d) => {
      const isin = (d.isin || "").trim();
      let fund =
        (isin && fundsList.find((f) => (f.isin || "").trim() === isin)) ||
        (d.name &&
          fundsList.find((f) =>
            (f.name || "").toLowerCase().includes((d.name || "").toLowerCase()),
          )) ||
        (d.name &&
          fundsList.find((f) =>
            (d.name || "")
              .toLowerCase()
              .includes((f.name || "").split(" ")[0].toLowerCase()),
          ));
      if (!fund && d.name && KNOWN_RV_FUND_FALLBACKS[d.name.trim()]) {
        fund = KNOWN_RV_FUND_FALLBACKS[d.name.trim()];
      }
      if (fund) {
        return {
          amount: null,
          percentage: d.percentage,
          name: d.name || fund.name,
          isin: isin || (fund.isin || "").trim() || null,
          link: d.link || fund.link || null,
          volatility12M: d.volatility12M ?? fund.volatility12M ?? null,
          return12M: d.return12M ?? fund.return12M ?? null,
          calculatedAmount: d.calculatedAmount ?? null,
        };
      }
      return {
        amount: null,
        percentage: d.percentage,
        name: d.name,
        isin: d.isin ?? null,
        link: d.link ?? null,
        volatility12M: d.volatility12M ?? null,
        return12M: d.return12M ?? null,
        calculatedAmount: d.calculatedAmount ?? null,
      };
    };

    return {
      sections: [
        {
          number: 2,
          title: tFn("portfolioBuilder.sections.monetarios.title"),
          icon: PiggyBank,
          description: DEFAULT_SECTION_DESCRIPTIONS[2] || "",
          funds: byCategory("Monetarios"),
          categoryKey: "Monetarios",
          tips: DEFAULT_SECTION_TIPS[2] || [],
          videos: DEFAULT_SECTION_VIDEOS[2] || [],
        },
        {
          number: 3,
          title: tFn("portfolioBuilder.sections.rentaVariable.title"),
          icon: TrendingUp,
          description: DEFAULT_SECTION_DESCRIPTIONS[3] || "",
          totalAmount:
            allocation.categories?.find((c) => c.name === "RV")?.amount ??
            30000,
          distribution: (rvDist || []).map(enrichDistributionItem),
          funds: rvFundsOnlyExtras(),
          categoryKey: "Renta Variable",
          tips: DEFAULT_SECTION_TIPS[3] || [],
          videos: DEFAULT_SECTION_VIDEOS[3] || [],
        },
        {
          number: 4,
          title: tFn("portfolioBuilder.sections.rentaFija.title"),
          icon: DollarSign,
          description: "",
          note: "",
          subsections: [
            {
              name: tFn(
                "portfolioBuilder.sections.subsections.rfCortoPlazo.name",
              ),
              description: tFn(
                "portfolioBuilder.sections.subsections.rfCortoPlazo.description",
              ),
              funds: byCategory("RF corto plazo"),
              categoryKey: "RF corto plazo",
            },
            {
              name: tFn(
                "portfolioBuilder.sections.subsections.rfMedioPlazo.name",
              ),
              description: tFn(
                "portfolioBuilder.sections.subsections.rfMedioPlazo.description",
              ),
              funds: byCategory("RF medio plazo"),
              categoryKey: "RF medio plazo",
            },
          ],
          videos: DEFAULT_SECTION_VIDEOS[4] || [],
        },
        {
          number: 5,
          title: tFn("portfolioBuilder.sections.alternativos.title"),
          icon: Layers,
          description: tFn(
            "portfolioBuilder.sections.alternativos.description",
          ),
          funds: byCategory("Alternativos"),
          categoryKey: "Alternativos",
          videos: DEFAULT_SECTION_VIDEOS[5] || [],
        },
      ],
      portfolioAllocation: allocation,
      detailedAllocation: {},
      fundsList: fundsList,
      extraFundIsinsByCategory: config?.extraFundIsinsByCategory || {},
      excludedFundIsinsByCategory: config?.excludedFundIsinsByCategory || {},
    };
  };

  const loadConfig = React.useCallback(() => {
    setLoading(true);
    setError(null);
    return api
      .get("/portfolio-builder/config")
      .then((res) => {
        const config = res.data;
        const processedData = buildPortfolioDataFromConfig(config, t);
        setPortfolioData(processedData);

        const allocation = config.allocation || DEFAULT_PORTFOLIO_ALLOCATION;
        const totalAmount = allocation.totalAmountCalculated ?? 120000;
        const categories = (allocation.categories || []).map((cat) => ({
          name: cat.name,
          expectedReturn: cat.expectedReturn
            ? parseFloat(String(cat.expectedReturn).replace("%", ""))
            : 0,
          weight: cat.weight
            ? parseFloat(String(cat.weight).replace("%", ""))
            : 0,
          description: cat.description || "",
        }));

        setCalculatorData((prev) => ({
          totalAmount,
          categories: categories.length > 0 ? categories : prev.categories,
        }));
      })
      .catch((err) => {
        console.error("Error cargando config Portfolio Builder:", err);
        setError(
          err.response?.data?.message ||
            t("portfolioBuilder.errors.loadConfig") +
              ": " +
              (err.message || "Sin conexión"),
        );
        const fallback = buildPortfolioDataFromConfig(null, t);
        setPortfolioData(fallback);
        const allocation = DEFAULT_PORTFOLIO_ALLOCATION;
        setCalculatorData({
          totalAmount: allocation.totalAmountCalculated || 120000,
          categories: allocation.categories.map((cat) => ({
            name: cat.name,
            expectedReturn: cat.expectedReturn
              ? parseFloat(String(cat.expectedReturn).replace("%", ""))
              : 0,
            weight: cat.weight
              ? parseFloat(String(cat.weight).replace("%", ""))
              : 0,
            description: cat.description || "",
          })),
        });
      })
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const addExtraFund = async (category, isin = null) => {
    if (!category) return;
    setAddingExtra(category);
    try {
      const res = await api.post("/portfolio-builder/config/extra-fund", {
        category,
        ...(isin ? { isin: (isin || "").trim() } : {}),
      });
      const {
        extraFundIsinsByCategory,
        excludedFundIsinsByCategory,
        addedIsin,
      } = res.data || {};
      if (!addedIsin && !res.data) {
        setAddingExtra(null);
        return;
      }
      const isinNorm = (addedIsin || "").trim();
      const catKey = String(category).trim();
      setPortfolioData((prev) => {
        if (!prev?.fundsList) return prev;
        const updatedFundsList = prev.fundsList.map((f) =>
          (f.isin || "").trim() === isinNorm && f.category === catKey
            ? { ...f, showInSection: true }
            : f,
        );
        const rvSection = prev.sections?.find((s) => s.number === 3);
        const syntheticConfig = {
          allocation: prev.portfolioAllocation,
          rvDistribution: rvSection?.distribution ?? [],
          funds: updatedFundsList,
          extraFundIsinsByCategory:
            extraFundIsinsByCategory || prev.extraFundIsinsByCategory || {},
          excludedFundIsinsByCategory:
            excludedFundIsinsByCategory ??
            prev.excludedFundIsinsByCategory ??
            {},
        };
        return buildPortfolioDataFromConfig(syntheticConfig, t);
      });
    } catch (err) {
      console.error("Error al añadir fondo extra:", err);
    } finally {
      setAddingExtra(null);
    }
  };

  const removeExtraFund = async (category, isin) => {
    if (!category || !isin) return;
    const catKey = String(category).trim();
    const isinNorm = (isin || "").trim();
    try {
      const res = await api.delete("/portfolio-builder/config/extra-fund", {
        params: { category: catKey, isin: isinNorm },
      });
      const { extraFundIsinsByCategory, excludedFundIsinsByCategory } =
        res.data || {};
      setPortfolioData((prev) => {
        if (!prev?.fundsList) return prev;
        const updatedFundsList = prev.fundsList.map((f) =>
          f.category === catKey && (f.isin || "").trim() === isinNorm
            ? { ...f, showInSection: false }
            : f,
        );
        const syntheticConfig = {
          allocation: prev.portfolioAllocation,
          rvDistribution:
            prev.sections?.find((s) => s.number === 3)?.distribution ?? [],
          funds: updatedFundsList,
          extraFundIsinsByCategory:
            extraFundIsinsByCategory ?? prev.extraFundIsinsByCategory ?? {},
          excludedFundIsinsByCategory:
            excludedFundIsinsByCategory ??
            prev.excludedFundIsinsByCategory ??
            {},
        };
        return buildPortfolioDataFromConfig(syntheticConfig, t);
      });
    } catch (err) {
      console.error("Error al eliminar fondo extra:", err);
    }
  };

  // Guardar config en la API (asignación + distribución RV)
  const savePortfolioConfig = async () => {
    if (!portfolioData) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const rvSection = portfolioData.sections?.find((s) => s.number === 3);
      const rvDistribution = (rvSection?.distribution || []).map((d) => ({
        percentage: d.percentage,
        name: d.name,
        isin: d.isin ?? null,
        link: d.link ?? null,
        volatility12M: d.volatility12M ?? null,
        return12M: d.return12M ?? null,
        calculatedAmount: d.calculatedAmount ?? null,
      }));

      const allocation = {
        totalAmountCalculated: calculatorData.totalAmount,
        totalReturn: portfolioData.portfolioAllocation?.totalReturn ?? "5.73%",
        categories: calculatorData.categories.map((cat) => ({
          name: cat.name,
          expectedReturn: `${cat.expectedReturn}%`,
          weight: `${cat.weight}%`,
          portfolioReturn: `${((cat.expectedReturn * cat.weight) / 100).toFixed(2)}%`,
          amount: Math.round((calculatorData.totalAmount * cat.weight) / 100),
          description: cat.description || null,
        })),
      };

      await api.put("/portfolio-builder/config", {
        allocation,
        rvDistribution,
      });
      setSaveMessage({ type: "success", text: "Configuración guardada" });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({
        type: "error",
        text: err.response?.data?.message || err.message || "Error al guardar",
      });
    } finally {
      setSaving(false);
    }
  };

  // Parsear porcentaje "20%" o "20" -> número
  const parsePct = (p) => {
    if (p == null) return 0;
    const s = String(p).replace("%", "").trim();
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };

  // Redistribuir % para que sumen 100% manteniendo proporciones (array de números)
  const redistributePercentages = (values) => {
    if (!values.length) return [];
    const sum = values.reduce((a, b) => a + b, 0);
    if (sum <= 0) return values.map(() => 100 / values.length);
    const scaled = values.map((v) => (v / sum) * 100);
    const rounded = scaled.map((v) => Math.round(v));
    let diff = 100 - rounded.reduce((a, b) => a + b, 0);
    if (diff !== 0) {
      const byError = rounded.map((r, i) => ({ i, err: scaled[i] - r }));
      byError.sort((a, b) => Math.abs(b.err) - Math.abs(a.err));
      for (let j = 0; j < Math.abs(diff); j++) {
        rounded[byError[j % byError.length].i] += diff > 0 ? 1 : -1;
      }
    }
    return rounded;
  };

  // Añadir un fondo a la distribución RV; se ajustan % manteniendo proporción (nuevo recibe parte, el resto se escala)
  const addRvFundToDistribution = () => {
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3) return s;
          const dist = s.distribution || [];
          const currentPcts = dist.map((d) => parsePct(d.percentage));
          const defaultNewPct = 10;
          const sumExisting = currentPcts.reduce((a, b) => a + b, 0) || 100;
          const scale =
            sumExisting > 0 ? (100 - defaultNewPct) / sumExisting : 1;
          const newPcts = redistributePercentages([
            ...currentPcts.map((p) => p * scale),
            defaultNewPct,
          ]);
          const newDist = newPcts.map((pct, i) =>
            i < dist.length
              ? { ...dist[i], percentage: `${newPcts[i]}%` }
              : {
                  percentage: `${newPcts[i]}%`,
                  name: "",
                  isin: null,
                  link: null,
                  volatility12M: null,
                  return12M: null,
                  calculatedAmount: null,
                },
          );
          return { ...s, distribution: newDist };
        }),
      };
    });
  };

  // Actualizar un fondo en la distribución RV
  const updateRvFundInDistribution = (idx, updates) => {
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3 || !s.distribution) return s;
          const nextDist = [...s.distribution];
          if (idx < 0 || idx >= nextDist.length) return s;
          nextDist[idx] = { ...nextDist[idx], ...updates };
          return { ...s, distribution: nextDist };
        }),
      };
    });
  };

  // Eliminar un fondo de la distribución RV; se reparten su % entre el resto manteniendo proporción
  const removeRvFundFromDistribution = (idx) => {
    setPortfolioData((prev) => {
      if (!prev?.sections) return prev;
      return {
        ...prev,
        sections: prev.sections.map((s) => {
          if (s.number !== 3 || !s.distribution) return s;
          const dist = s.distribution.filter((_, i) => i !== idx);
          if (dist.length === 0) return { ...s, distribution: [] };
          const currentPcts = dist.map((d) => parsePct(d.percentage));
          const newPcts = redistributePercentages(currentPcts);
          const nextDist = dist.map((d, i) => ({
            ...d,
            percentage: `${newPcts[i]}%`,
          }));
          return { ...s, distribution: nextDist };
        }),
      };
    });
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
            {/* Guardar configuración en BBDD */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={savePortfolioConfig}
                disabled={saving || !portfolioData}
                className="px-4 py-2 rounded-lg font-medium text-white disabled:opacity-50"
                style={
                  isDark
                    ? { backgroundColor: "var(--user-color-600)" }
                    : { backgroundColor: "var(--user-color-600)" }
                }
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {saveMessage && (
                <span
                  className={`text-sm ${
                    saveMessage.type === "success"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {saveMessage.text}
                </span>
              )}
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
          // categoryKey para fondos extra / eliminar: en subsecciones viene de subsection, si no de section
          const currentCategoryKey =
            (isSubsection && subsection?.categoryKey) || section?.categoryKey;
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
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                                        {item.name || "(Sin nombre)"}
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
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
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
                                    {section.number === 3 && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeRvFundFromDistribution(idx)
                                        }
                                        className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Añadir fondo a la distribución RV (solo sección 3) */}
                        {section.number === 3 && (
                          <div className="mt-3">
                            <button
                              type="button"
                              onClick={addRvFundToDistribution}
                              className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
                            >
                              + Añadir fondo
                            </button>
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
                                      <div className="flex items-center gap-2 flex-wrap">
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
                                        {currentCategoryKey && fund.isin && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              removeExtraFund(
                                                currentCategoryKey,
                                                fund.isin,
                                              )
                                            }
                                            className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                          >
                                            Eliminar
                                          </button>
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
                                    {currentCategoryKey && fund.isin && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeExtraFund(
                                            currentCategoryKey,
                                            fund.isin,
                                          )
                                        }
                                        className="text-sm text-red-600 dark:text-red-400 hover:underline"
                                      >
                                        Eliminar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {/* Añadir más: añade el siguiente fondo de la lista (mejor R12M) */}
                  {portfolioData?.fundsList &&
                    currentCategoryKey &&
                    (() => {
                      const availableToAdd = portfolioData.fundsList.filter(
                        (f) =>
                          f.category === currentCategoryKey &&
                          f.showInSection !== true,
                      );
                      if (availableToAdd.length === 0) return null;
                      const isAdding = addingExtra === currentCategoryKey;
                      return (
                        <div className="mt-3 mb-4">
                          <button
                            type="button"
                            onClick={() => addExtraFund(currentCategoryKey)}
                            disabled={isAdding}
                            className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-50"
                          >
                            {isAdding
                              ? "Añadiendo…"
                              : "+ Añadir más (siguiente de la lista)"}
                          </button>
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
