import express from "express";
import Investment from "../models/Investment.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { updateMultipleQuotes, getQuote } from "../services/quoteService.js";
import {
  saveDailyVariation,
  recalculateDailyVariationsForInvestmentFromDate,
  calculateDailyChangeFromHistory,
} from "../services/dailyVariationService.js";
import { calculateHistoricalVariations } from "../services/historicalVariationService.js";

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Función helper para calcular diferencias respecto al día anterior
async function calculateDailyChanges(
  investmentId,
  userId,
  currentTotalValue,
  date,
) {
  return await calculateDailyChangeFromHistory(
    investmentId,
    userId,
    currentTotalValue,
    date || new Date(),
  );
}

const normalizeInvestmentClassification = (payload) => {
  if (!payload || typeof payload !== "object") return;
  if (Object.prototype.hasOwnProperty.call(payload, "assetClass")) {
    if (payload.assetClass === "alternative") {
      payload.assetClass = "variable_income";
      payload.isAlternative = true;
    }
    if (payload.assetClass !== "fixed_income") {
      delete payload.fixedIncomeSubtype;
    } else if (payload.fixedIncomeSubtype === "") {
      payload.fixedIncomeSubtype = null;
    }
  }
};

const getInvestmentAmountFromPayload = (payload) => {
  if (!payload) return 0;
  const quantity = Number(payload.quantity) || 0;
  if (payload.isAutomatedPortfolio) {
    return quantity;
  }
  const price = Number(payload.purchasePrice) || 0;
  return quantity * price;
};

const validateAllocationEntry = async (entry, userId) => {
  if (!entry || typeof entry !== "object") {
    return { error: "Asignación inválida" };
  }
  const accountId = entry.account;
  if (!accountId) {
    return { error: "Debe especificar una cuenta en cada asignación" };
  }
  const account = await Account.findOne({ _id: accountId, user: userId });
  if (!account) {
    return { error: "Cuenta no encontrada para una asignación" };
  }

  let subAccount = null;
  if (entry.subAccount) {
    subAccount = await SubAccount.findOne({
      _id: entry.subAccount,
      user: userId,
    });
    if (!subAccount) {
      return { error: "Subcuenta no encontrada para una asignación" };
    }
    if (subAccount.type !== "investment") {
      return { error: "La subcuenta debe ser de tipo inversión" };
    }
    const subAccountAccountId =
      subAccount.account?._id?.toString() || subAccount.account?.toString();
    if (subAccountAccountId !== accountId.toString()) {
      return {
        error: "La subcuenta no pertenece a la cuenta seleccionada",
      };
    }
  }

  const amount = Number(entry.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: "La cantidad de la asignación debe ser válida" };
  }

  return {
    allocation: {
      account: accountId,
      subAccount: entry.subAccount || null,
      amount,
    },
  };
};

const normalizeAllocations = async (allocations, userId) => {
  if (!Array.isArray(allocations)) {
    return { allocations: [] };
  }
  const merged = new Map();
  for (const entry of allocations) {
    const { allocation, error } = await validateAllocationEntry(entry, userId);
    if (error) {
      return { error };
    }
    const key = `${allocation.account.toString()}-${allocation.subAccount || "none"}`;
    const existing = merged.get(key);
    if (existing) {
      existing.amount += allocation.amount;
    } else {
      merged.set(key, { ...allocation });
    }
  }
  return { allocations: Array.from(merged.values()) };
};

const getAllocationKey = (allocation) =>
  `${allocation.account?.toString?.() || allocation.account}-${allocation.subAccount?.toString?.() || allocation.subAccount || "none"}`;

const resolveHistoryOperationAmount = (entry) => {
  let amount = entry?.operationAmount;
  if (!amount || amount === 0) {
    if (entry?.operationPrice && entry?.quantity) {
      amount = entry.operationPrice * entry.quantity;
    } else if (entry?.operation === "creation" && entry?.totalValue) {
      amount = entry.totalValue;
    }
  }
  return amount || 0;
};

const buildAllocationsFromHistory = async (investment, userId) => {
  const historyEntries = await InvestmentHistory.find({
    investment: investment._id,
    user: userId,
    operation: { $in: ["creation", "add", "withdraw"] },
    account: { $exists: true, $ne: null },
  }).sort({ date: 1 });

  if (!historyEntries.length) {
    return null;
  }

  const totals = new Map();
  for (const entry of historyEntries) {
    const amount = resolveHistoryOperationAmount(entry);
    if (!amount) continue;
    const key = getAllocationKey(entry);
    const signed = entry.operation === "withdraw" ? -Math.abs(amount) : amount;
    totals.set(key, (totals.get(key) || 0) + signed);
  }

  const allocations = [];
  for (const [key, amount] of totals.entries()) {
    if (amount <= 0) continue;
    const [accountId, subAccountId] = key.split("-");
    allocations.push({
      account: accountId,
      subAccount: subAccountId === "none" ? null : subAccountId,
      amount,
    });
  }

  return allocations.length ? allocations : null;
};

const ensureInvestmentAllocations = (investment) => {
  if (Array.isArray(investment.allocations) && investment.allocations.length) {
    return;
  }
  const accountId = investment.account?._id || investment.account;
  if (!accountId) return;
  const amount = investment.isAutomatedPortfolio
    ? investment.quantity || 0
    : (investment.quantity || 0) *
      (investment.averagePurchasePrice || investment.purchasePrice || 0);
  investment.allocations = [
    {
      account: accountId,
      subAccount: investment.subAccount?._id || investment.subAccount || null,
      amount: Number(amount) || 0,
    },
  ];
};

const getHistoryAllocation = (investment, allocationOverride) => {
  if (allocationOverride?.account) {
    return {
      account: allocationOverride.account,
      subAccount: allocationOverride.subAccount || null,
    };
  }
  if (Array.isArray(investment.allocations) && investment.allocations.length) {
    const primary = investment.allocations[0];
    return {
      account: primary.account?._id || primary.account || null,
      subAccount: primary.subAccount?._id || primary.subAccount || null,
    };
  }
  return {
    account: investment.account?._id || investment.account || null,
    subAccount: investment.subAccount?._id || investment.subAccount || null,
  };
};

const getCashSubAccountForAccount = async (accountId, userId) => {
  if (!accountId) return null;
  let cashSubAccount = await SubAccount.findOne({
    account: accountId,
    user: userId,
    type: "cash",
    name: "Efectivo",
  });

  if (!cashSubAccount) {
    const fallbackCashSubAccount = await SubAccount.findOne({
      account: accountId,
      user: userId,
      type: "cash",
    }).sort({ createdAt: 1 });

    if (fallbackCashSubAccount) {
      fallbackCashSubAccount.name = "Efectivo";
      await fallbackCashSubAccount.save();
      return fallbackCashSubAccount;
    }

    const account = await Account.findOne({ _id: accountId, user: userId });
    cashSubAccount = new SubAccount({
      user: userId,
      account: accountId,
      name: "Efectivo",
      type: "cash",
      balance: 0,
      currency: account?.currency || "EUR",
      description: "Efectivo creado automáticamente para devoluciones",
    });
    await cashSubAccount.save();
  }

  return cashSubAccount;
};

const getInvestmentCashTargets = (investment) => {
  const allocations = Array.isArray(investment.allocations)
    ? investment.allocations
    : [];
  if (allocations.length > 0) {
    return allocations
      .map((allocation) => ({
        accountId: allocation.account?._id || allocation.account,
        weight: Number(allocation.amount) || 0,
      }))
      .filter((target) => target.accountId);
  }

  const accountId = investment.account?._id || investment.account;
  if (!accountId) return [];
  return [{ accountId, weight: 1 }];
};

const applyCashDeltaForInvestment = async (investment, userId, amount) => {
  const targets = getInvestmentCashTargets(investment);
  if (targets.length === 0) return null;

  const totalWeight = targets.reduce((sum, t) => sum + t.weight, 0);
  const fallbackAmount = amount / targets.length;
  const updatedSubAccounts = [];

  for (const target of targets) {
    const cashSubAccount = await getCashSubAccountForAccount(
      target.accountId,
      userId,
    );
    if (!cashSubAccount) return null;
    const delta =
      totalWeight > 0 ? (amount * target.weight) / totalWeight : fallbackAmount;
    cashSubAccount.balance += delta;
    await cashSubAccount.save();
    updatedSubAccounts.push(cashSubAccount);
  }

  return updatedSubAccounts;
};

// GET todas las inversiones
router.get("/", async (req, res) => {
  try {
    const { subAccountId, accountId } = req.query;
    const query = { user: req.userId };

    if (subAccountId) {
      query.$or = [
        { subAccount: subAccountId },
        { "allocations.subAccount": subAccountId },
      ];
    } else if (accountId) {
      // Si se busca por accountId, buscar inversiones directamente asociadas a la cuenta
      // o a través de subcuentas de inversión de esa cuenta
      const subAccounts = await SubAccount.find({
        account: accountId,
        type: "investment",
        user: req.userId,
      });
      const subAccountIds = subAccounts.map((sa) => sa._id);
      query.$or = [
        { account: accountId },
        { subAccount: { $in: subAccountIds } },
        { "allocations.account": accountId },
        { "allocations.subAccount": { $in: subAccountIds } },
      ];
    }

    const investments = await Investment.find(query)
      .populate({
        path: "allocations.subAccount",
        select: "name type balance currency",
        match: { user: req.userId },
        populate: {
          path: "account",
          select: "name bankName",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "allocations.account",
        select: "name bankName",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        select: "name type balance currency",
        match: { user: req.userId },
        populate: {
          path: "account",
          select: "name bankName",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "account",
        select: "name bankName",
        match: { user: req.userId },
      })
      .sort({ createdAt: -1 });
    const normalizedInvestments = await Promise.all(
      investments.map(async (investment) => {
        const allocationTotal = Array.isArray(investment.allocations)
          ? investment.allocations.reduce(
              (sum, allocation) => sum + (Number(allocation.amount) || 0),
              0,
            )
          : 0;
        if (!investment.allocations?.length || allocationTotal <= 0) {
          const rebuilt = await buildAllocationsFromHistory(
            investment,
            req.userId,
          );
          if (rebuilt) {
            investment.allocations = rebuilt;
            if (rebuilt.length > 0) {
              investment.account = rebuilt[0].account;
              investment.subAccount = rebuilt[0].subAccount || undefined;
            }
            await investment.save();
            await Investment.populate(investment, [
              {
                path: "allocations.subAccount",
                select: "name type balance currency",
                match: { user: req.userId },
                populate: {
                  path: "account",
                  select: "name bankName",
                  match: { user: req.userId },
                },
              },
              {
                path: "allocations.account",
                select: "name bankName",
                match: { user: req.userId },
              },
            ]);
          }
        }
        return investment;
      }),
    );
    res.json(normalizedInvestments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET inversión por ID
router.get("/:id", async (req, res) => {
  try {
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    })
      .populate({
        path: "allocations.subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "allocations.account",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });
    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }
    res.json(investment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva inversión
router.post("/", async (req, res) => {
  try {
    const hasAllocations =
      Array.isArray(req.body.allocations) && req.body.allocations.length > 0;

    // Validar que hay cuenta o asignaciones
    if (!hasAllocations && !req.body.account) {
      return res.status(400).json({
        message: "Debe especificar una cuenta o al menos una asignación",
      });
    }

    normalizeInvestmentClassification(req.body);

    let allocations = [];

    if (hasAllocations) {
      const normalized = await normalizeAllocations(
        req.body.allocations,
        req.userId,
      );
      if (normalized.error) {
        return res.status(400).json({ message: normalized.error });
      }
      allocations = normalized.allocations;
    } else {
      const investmentAmount = getInvestmentAmountFromPayload(req.body);
      const validation = await validateAllocationEntry(
        {
          account: req.body.account,
          subAccount: req.body.subAccount,
          amount: investmentAmount,
        },
        req.userId,
      );
      if (validation.error) {
        return res.status(400).json({ message: validation.error });
      }
      allocations = [
        {
          account: req.body.account,
          subAccount: req.body.subAccount || null,
          amount: investmentAmount,
        },
      ];
    }

    // Calcular el monto total de la inversión
    const investmentAmount = getInvestmentAmountFromPayload(req.body);

    const totalAllocationAmount = allocations.reduce(
      (sum, allocation) => sum + (Number(allocation.amount) || 0),
      0,
    );
    if (
      investmentAmount > 0 &&
      totalAllocationAmount > 0 &&
      Math.abs(totalAllocationAmount - investmentAmount) > 0.01
    ) {
      return res.status(400).json({
        message:
          "La suma de las asignaciones debe coincidir con el monto total invertido",
      });
    }

    req.body.allocations = allocations;
    if (allocations.length > 0) {
      req.body.account = allocations[0].account;
      req.body.subAccount = allocations[0].subAccount || undefined;
    }

    if (!req.body.isAutomatedPortfolio && req.body.purchasePrice > 0) {
      req.body.allocations = allocations.map((allocation) => ({
        ...allocation,
        quantity: allocation.amount / req.body.purchasePrice,
        averagePurchasePrice: req.body.purchasePrice,
      }));
    }

    // Crear la inversión
    const investment = new Investment({
      ...req.body,
      user: req.userId,
    });
    const savedInvestment = await investment.save();

    // Populate según lo que tenga la inversión
    const populatePaths = [];
    populatePaths.push(
      {
        path: "allocations.subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      },
      {
        path: "allocations.account",
        match: { user: req.userId },
      },
    );
    if (savedInvestment.subAccount) {
      populatePaths.push({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      });
    }
    if (savedInvestment.account) {
      populatePaths.push({
        path: "account",
        match: { user: req.userId },
      });
    }

    let populatedInvestment = await Investment.findById(savedInvestment._id);
    for (const populatePath of populatePaths) {
      populatedInvestment = await Investment.populate(
        populatedInvestment,
        populatePath,
      );
    }

    // Crear entrada inicial en el historial
    try {
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const historyDate = req.body.purchaseDate
        ? new Date(req.body.purchaseDate)
        : req.body.date
          ? new Date(req.body.date)
          : new Date();
      const currentPrice =
        savedInvestment.currentPrice ||
        savedInvestment.purchasePrice ||
        (savedInvestment.isAutomatedPortfolio ? savedInvestment.quantity : 0);
      const totalValue = savedInvestment.isAutomatedPortfolio
        ? savedInvestment.currentPrice || savedInvestment.quantity
        : savedInvestment.quantity *
          (savedInvestment.currentPrice || savedInvestment.purchasePrice || 0);

      // Calcular diferencias respecto al día anterior (será null para la primera entrada)
      const dailyChanges = await calculateDailyChanges(
        savedInvestment._id,
        req.userId,
        totalValue,
        historyDate,
      );

      const initialHistoryEntry = new InvestmentHistory({
        user: req.userId,
        investment: savedInvestment._id,
        date: historyDate,
        ...getHistoryAllocation(savedInvestment),
        currentPrice: currentPrice,
        quantity: savedInvestment.quantity,
        totalValue: totalValue,
        notes: req.body.notes || "Inversión inicial",
        operation: "creation",
        operationAmount: investmentAmount,
        operationPrice: savedInvestment.isAutomatedPortfolio
          ? null
          : savedInvestment.purchasePrice,
        dailyChangeAmount: dailyChanges.dailyChangeAmount,
        dailyChangePercent: dailyChanges.dailyChangePercent,
      });
      await initialHistoryEntry.save();
    } catch (historyError) {
      // No fallar la creación de la inversión si falla el historial
    }

    // Calcular variaciones históricas desde la fecha de compra hasta hoy (en segundo plano)
    // Solo si tiene símbolo y no es cartera automatizada
    if (savedInvestment.symbol && !savedInvestment.isAutomatedPortfolio) {
      calculateHistoricalVariations(
        savedInvestment._id,
        req.userId,
        savedInvestment,
      ).catch(() => {
        // Fallar silenciosamente, no es crítico
      });
    }

    res.status(201).json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar inversión
router.put("/:id", async (req, res) => {
  try {
    normalizeInvestmentClassification(req.body);
    // Obtener la inversión actual antes de actualizarla para comparar cambios críticos
    const oldInvestment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!oldInvestment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    if (Object.prototype.hasOwnProperty.call(req.body, "allocations")) {
      if (!Array.isArray(req.body.allocations)) {
        return res.status(400).json({
          message: "Las asignaciones deben ser un listado válido",
        });
      }
      if (req.body.allocations.length === 0 && !req.body.account) {
        return res.status(400).json({
          message: "Debe especificar una cuenta o al menos una asignación",
        });
      }
      if (req.body.allocations.length > 0) {
        const normalized = await normalizeAllocations(
          req.body.allocations,
          req.userId,
        );
        if (normalized.error) {
          return res.status(400).json({ message: normalized.error });
        }
        req.body.allocations = normalized.allocations;
        if (normalized.allocations.length > 0) {
          req.body.account = normalized.allocations[0].account;
          req.body.subAccount =
            normalized.allocations[0].subAccount || undefined;
        }

        const amountPayload = {
          isAutomatedPortfolio:
            req.body.isAutomatedPortfolio ?? oldInvestment.isAutomatedPortfolio,
          quantity: req.body.quantity ?? oldInvestment.quantity,
          purchasePrice: req.body.purchasePrice ?? oldInvestment.purchasePrice,
        };
        const investmentAmount = getInvestmentAmountFromPayload(amountPayload);
        const totalAllocationAmount = req.body.allocations.reduce(
          (sum, allocation) => sum + (Number(allocation.amount) || 0),
          0,
        );
        if (
          investmentAmount > 0 &&
          totalAllocationAmount > 0 &&
          Math.abs(totalAllocationAmount - investmentAmount) > 0.01
        ) {
          return res.status(400).json({
            message:
              "La suma de las asignaciones debe coincidir con el monto total invertido",
          });
        }
      }
    }

    // Detectar si se están editando valores críticos que invalidarían el historial
    const criticalFieldsChanged =
      (req.body.purchaseDate &&
        new Date(req.body.purchaseDate).getTime() !==
          new Date(oldInvestment.purchaseDate).getTime()) ||
      (req.body.purchasePrice &&
        req.body.purchasePrice !== oldInvestment.purchasePrice) ||
      (req.body.quantity &&
        req.body.quantity !== oldInvestment.quantity &&
        oldInvestment.quantity > 0) ||
      (req.body.name && req.body.name !== oldInvestment.name);

    // Si se cambian valores críticos, eliminar el historial anterior
    // porque los datos históricos ya no serían correctos
    if (criticalFieldsChanged) {
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const DailyVariation = (await import("../models/DailyVariation.js"))
        .default;

      const deletedHistory = await InvestmentHistory.deleteMany({
        user: req.userId,
        investment: oldInvestment._id,
      });

      const deletedVariations = await DailyVariation.deleteMany({
        user: req.userId,
        investment: oldInvestment._id,
      });
    }

    const investment = await Investment.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      },
    );

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    // Populate según lo que tenga la inversión
    const populatePaths = [];
    populatePaths.push(
      {
        path: "allocations.subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      },
      {
        path: "allocations.account",
        match: { user: req.userId },
      },
    );
    if (investment.subAccount) {
      populatePaths.push({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      });
    }
    if (investment.account) {
      populatePaths.push({
        path: "account",
        match: { user: req.userId },
      });
    }

    let populatedInvestment = investment;
    for (const populatePath of populatePaths) {
      populatedInvestment = await Investment.populate(
        populatedInvestment,
        populatePath,
      );
    }

    res.json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST añadir a una inversión (calcular nuevo precio medio)
router.post("/:id/add", async (req, res) => {
  try {
    const { quantity, price, date, notes } = req.body;
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate({
      path: "subAccount",
      match: { user: req.userId },
    });

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    // Calcular el monto adicional a invertir
    let additionalAmount = 0;
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas, quantity es el monto adicional
      additionalAmount = quantity || 0;
    } else {
      // Para inversiones tradicionales, quantity * price
      additionalAmount = (quantity || 0) * (price || 0);
    }

    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas: simplemente sumar el monto nuevo
      const newTotalAmount = investment.quantity + quantity;
      investment.quantity = newTotalAmount;
      // El currentPrice se actualiza por separado cuando se actualiza el valor
    } else {
      // Para inversiones tradicionales: calcular nuevo precio medio
      const currentQuantity = investment.quantity;
      const currentAvgPrice =
        investment.averagePurchasePrice || investment.purchasePrice;
      const newQuantity = currentQuantity + quantity;

      // Calcular nuevo precio medio: (cantidad_actual * precio_medio_actual + cantidad_nueva * precio_nuevo) / cantidad_total
      const newAveragePrice =
        (currentQuantity * currentAvgPrice + quantity * price) / newQuantity;

      investment.quantity = newQuantity;
      investment.averagePurchasePrice = newAveragePrice;

      // Si se proporciona un precio actual, actualizarlo también
      if (req.body.currentPrice) {
        investment.currentPrice = req.body.currentPrice;
      }
    }

    ensureInvestmentAllocations(investment);

    if (
      Array.isArray(investment.allocations) &&
      investment.allocations.length
    ) {
      let targetAllocation = null;
      if (req.body.allocation?.account) {
        const validation = await validateAllocationEntry(
          {
            account: req.body.allocation.account,
            subAccount: req.body.allocation.subAccount || null,
            amount: 0,
          },
          req.userId,
        );
        if (validation.error) {
          return res.status(400).json({ message: validation.error });
        }
        targetAllocation = validation.allocation;
      }

      if (targetAllocation) {
        const targetKey = getAllocationKey(targetAllocation);
        const existing = investment.allocations.find(
          (allocation) => getAllocationKey(allocation) === targetKey,
        );
        if (existing) {
          existing.amount = (Number(existing.amount) || 0) + additionalAmount;
          if (!investment.isAutomatedPortfolio && price) {
            const additionalUnits = quantity || 0;
            const currentUnits = Number(existing.quantity) || 0;
            const currentAvg =
              Number(existing.averagePurchasePrice) ||
              investment.averagePurchasePrice ||
              investment.purchasePrice ||
              price;
            const newUnits = currentUnits + additionalUnits;
            existing.quantity = newUnits;
            existing.averagePurchasePrice =
              newUnits > 0
                ? (currentUnits * currentAvg + additionalUnits * price) /
                  newUnits
                : currentAvg;
            existing.amount = newUnits * existing.averagePurchasePrice;
          }
        } else {
          investment.allocations.push({
            account: targetAllocation.account,
            subAccount: targetAllocation.subAccount || null,
            amount: additionalAmount,
            quantity: !investment.isAutomatedPortfolio ? quantity || 0 : 0,
            averagePurchasePrice: !investment.isAutomatedPortfolio ? price : 0,
          });
        }
      } else {
        const totalAllocated = investment.allocations.reduce(
          (sum, allocation) => sum + (Number(allocation.amount) || 0),
          0,
        );
        if (totalAllocated > 0) {
          investment.allocations.forEach((allocation) => {
            const weight = (Number(allocation.amount) || 0) / totalAllocated;
            allocation.amount =
              (Number(allocation.amount) || 0) + additionalAmount * weight;
            if (!investment.isAutomatedPortfolio && price) {
              const additionalUnits = (quantity || 0) * weight;
              const currentUnits = Number(allocation.quantity) || 0;
              const currentAvg =
                Number(allocation.averagePurchasePrice) ||
                investment.averagePurchasePrice ||
                investment.purchasePrice ||
                price;
              const newUnits = currentUnits + additionalUnits;
              allocation.quantity = newUnits;
              allocation.averagePurchasePrice =
                newUnits > 0
                  ? (currentUnits * currentAvg + additionalUnits * price) /
                    newUnits
                  : currentAvg;
              allocation.amount = newUnits * allocation.averagePurchasePrice;
            }
          });
        } else {
          const perAllocation =
            additionalAmount / investment.allocations.length;
          investment.allocations.forEach((allocation) => {
            allocation.amount =
              (Number(allocation.amount) || 0) + perAllocation;
            if (!investment.isAutomatedPortfolio && price) {
              const additionalUnits =
                (quantity || 0) / investment.allocations.length;
              const currentUnits = Number(allocation.quantity) || 0;
              const currentAvg =
                Number(allocation.averagePurchasePrice) ||
                investment.averagePurchasePrice ||
                investment.purchasePrice ||
                price;
              const newUnits = currentUnits + additionalUnits;
              allocation.quantity = newUnits;
              allocation.averagePurchasePrice =
                newUnits > 0
                  ? (currentUnits * currentAvg + additionalUnits * price) /
                    newUnits
                  : currentAvg;
              allocation.amount = newUnits * allocation.averagePurchasePrice;
            }
          });
        }
      }
    }

    await investment.save();

    // Crear entrada en el historial si se proporciona fecha
    if (date) {
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const totalValue = investment.isAutomatedPortfolio
        ? investment.currentPrice
        : investment.quantity * investment.currentPrice;

      // Calcular diferencias respecto al día anterior
      const dailyChanges = await calculateDailyChanges(
        investment._id,
        req.userId,
        totalValue,
        date || new Date(),
      );

      const historyEntry = new InvestmentHistory({
        user: req.userId,
        investment: investment._id,
        date: date || new Date(),
        ...getHistoryAllocation(investment, req.body.allocation),
        currentPrice: investment.currentPrice,
        quantity: investment.quantity,
        totalValue: totalValue,
        notes:
          notes ||
          `Añadido: ${quantity} ${investment.isAutomatedPortfolio ? "€" : "unidades"}${!investment.isAutomatedPortfolio ? ` a ${price}€` : ""}`,
        operation: "add",
        operationAmount: additionalAmount,
        operationPrice: investment.isAutomatedPortfolio ? null : price,
        dailyChangeAmount: dailyChanges.dailyChangeAmount,
        dailyChangePercent: dailyChanges.dailyChangePercent,
      });
      await historyEntry.save();
      await recalculateDailyVariationsForInvestmentFromDate(
        investment._id,
        req.userId,
        date || new Date(),
      );
    }

    const populatedInvestment = await Investment.findById(investment._id)
      .populate({
        path: "allocations.subAccount",
        populate: {
          path: "account",
        },
      })
      .populate({
        path: "allocations.account",
      })
      .populate({
        path: "subAccount",
        populate: {
          path: "account",
        },
      });

    res.json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST retirar parte o toda una inversión
router.post("/:id/sell", async (req, res) => {
  try {
    const {
      quantity,
      price,
      date,
      notes,
      returnToSubAccount = true,
    } = req.body;
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    // Validar cantidad a retirar
    if (!quantity || quantity <= 0) {
      return res
        .status(400)
        .json({ message: "La cantidad a retirar debe ser mayor que 0" });
    }

    if (quantity > investment.quantity) {
      return res.status(400).json({
        message: `No puedes retirar más de lo que tienes. Cantidad disponible: ${investment.quantity}`,
      });
    }

    // Calcular el monto del retiro
    let saleAmount = 0;
    if (investment.isAutomatedPortfolio) {
      // Para carteras automatizadas, quantity es el monto a retirar
      saleAmount = quantity;
    } else {
      // Para inversiones tradicionales, quantity * price
      if (!price || price <= 0) {
        return res
          .status(400)
          .json({ message: "El precio de venta es requerido" });
      }
      saleAmount = quantity * price;
    }

    // Reducir la cantidad
    const remainingQuantity = investment.quantity - quantity;

    ensureInvestmentAllocations(investment);

    // Si se retira todo, eliminar la inversión
    if (remainingQuantity <= 0) {
      let allocationTarget = null;
      if (req.body.allocation?.account) {
        ensureInvestmentAllocations(investment);
        const validation = await validateAllocationEntry(
          {
            account: req.body.allocation.account,
            subAccount: req.body.allocation.subAccount || null,
            amount: 0,
          },
          req.userId,
        );
        if (validation.error) {
          return res.status(400).json({ message: validation.error });
        }
        const targetKey = getAllocationKey(validation.allocation);
        const target = investment.allocations?.find(
          (allocation) => getAllocationKey(allocation) === targetKey,
        );
        if (!target) {
          return res.status(400).json({
            message: "La asignación seleccionada no existe en esta inversión",
          });
        }
        allocationTarget = validation.allocation;
      }
      // Devolver el dinero al efectivo si se solicita
      let returnedToSubAccount = false;
      if (returnToSubAccount) {
        if (allocationTarget) {
          const cashSubAccount = await getCashSubAccountForAccount(
            allocationTarget.account,
            req.userId,
          );
          if (!cashSubAccount) {
            return res.status(400).json({
              message:
                "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
            });
          }
          cashSubAccount.balance += saleAmount;
          await cashSubAccount.save();
        } else {
          const cashSubAccounts = await applyCashDeltaForInvestment(
            investment,
            req.userId,
            saleAmount,
          );
          if (!cashSubAccounts || cashSubAccounts.length === 0) {
            return res.status(400).json({
              message:
                "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
            });
          }
        }
        returnedToSubAccount = true;
      }

      // Crear entrada en el historial antes de eliminar
      if (date) {
        const InvestmentHistory = (
          await import("../models/InvestmentHistory.js")
        ).default;
        const totalValue = 0; // Se vendió todo

        // Calcular diferencias respecto al día anterior
        const dailyChanges = await calculateDailyChanges(
          investment._id,
          req.userId,
          totalValue,
          date || new Date(),
        );

        const historyEntry = new InvestmentHistory({
          user: req.userId,
          investment: investment._id,
          date: date || new Date(),
          ...getHistoryAllocation(investment, req.body.allocation),
          currentPrice: investment.isAutomatedPortfolio ? saleAmount : price,
          quantity: 0, // Se vendió todo
          totalValue: totalValue,
          notes:
            notes ||
            `Retiro completo: ${quantity} ${investment.isAutomatedPortfolio ? "€" : "unidades"} a ${investment.isAutomatedPortfolio ? "" : price + "€"}`,
          operation: "withdraw",
          operationAmount: saleAmount,
          operationPrice: investment.isAutomatedPortfolio ? null : price,
          dailyChangeAmount: dailyChanges.dailyChangeAmount,
          dailyChangePercent: dailyChanges.dailyChangePercent,
        });
        await historyEntry.save();
      }

      const investmentId = investment._id;

      // IMPORTANTE: Eliminar TODOS los registros históricos de esta inversión
      // Si se elimina una inversión, debe desaparecer completamente del historial
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const DailyVariation = (await import("../models/DailyVariation.js"))
        .default;

      const deletedHistory = await InvestmentHistory.deleteMany({
        user: req.userId,
        investment: investmentId,
      });

      const deletedVariations = await DailyVariation.deleteMany({
        user: req.userId,
        investment: investmentId,
      });

      // Eliminar la inversión
      await Investment.findByIdAndDelete(investment._id);

      return res.json({
        message: "Inversión retirada completamente y eliminada",
        saleAmount,
        returnedToSubAccount,
      });
    }

    // Si queda cantidad, actualizar la inversión
    investment.quantity = remainingQuantity;

    if (
      Array.isArray(investment.allocations) &&
      investment.allocations.length
    ) {
      const totalAllocated = investment.allocations.reduce(
        (sum, allocation) => sum + (Number(allocation.amount) || 0),
        0,
      );
      if (req.body.allocation?.account) {
        const validation = await validateAllocationEntry(
          {
            account: req.body.allocation.account,
            subAccount: req.body.allocation.subAccount || null,
            amount: 0,
          },
          req.userId,
        );
        if (validation.error) {
          return res.status(400).json({ message: validation.error });
        }
        const targetKey = getAllocationKey(validation.allocation);
        const target = investment.allocations.find(
          (allocation) => getAllocationKey(allocation) === targetKey,
        );
        if (!target) {
          return res.status(400).json({
            message: "La asignación seleccionada no existe en esta inversión",
          });
        }
        if (totalAllocated <= 0) {
          return res.status(400).json({
            message: "No se puede calcular la asignación a retirar",
          });
        }
        if (!investment.isAutomatedPortfolio && target.quantity) {
          const currentUnits = Number(target.quantity) || 0;
          if (quantity > currentUnits + 0.000001) {
            return res.status(400).json({
              message:
                "La asignación seleccionada no tiene suficientes unidades para retirar",
            });
          }
          target.quantity = Math.max(0, currentUnits - quantity);
          const avgPrice =
            Number(target.averagePurchasePrice) ||
            investment.averagePurchasePrice ||
            investment.purchasePrice ||
            price ||
            0;
          target.averagePurchasePrice = avgPrice;
          target.amount = target.quantity * avgPrice;
        } else {
          const withdrawalRatio =
            investment.quantity + quantity > 0
              ? quantity / (investment.quantity + quantity)
              : 0;
          const investedReduction = totalAllocated * withdrawalRatio;
          const currentAmount = Number(target.amount) || 0;
          if (investedReduction > currentAmount + 0.01) {
            return res.status(400).json({
              message:
                "La asignación seleccionada no tiene suficiente capital para retirar",
            });
          }
          target.amount = Math.max(0, currentAmount - investedReduction);
        }
      } else {
        const withdrawalRatio =
          investment.quantity + quantity > 0
            ? quantity / (investment.quantity + quantity)
            : 0;
        investment.allocations.forEach((allocation) => {
          const currentAmount = Number(allocation.amount) || 0;
          allocation.amount = Math.max(
            0,
            currentAmount * (1 - withdrawalRatio),
          );
          if (!investment.isAutomatedPortfolio && allocation.quantity) {
            const currentUnits = Number(allocation.quantity) || 0;
            allocation.quantity = Math.max(
              0,
              currentUnits * (1 - withdrawalRatio),
            );
            const avgPrice =
              Number(allocation.averagePurchasePrice) ||
              investment.averagePurchasePrice ||
              investment.purchasePrice ||
              price ||
              0;
            allocation.averagePurchasePrice = avgPrice;
            allocation.amount = allocation.quantity * avgPrice;
          }
        });
      }
    }

    // Para inversiones tradicionales, actualizar el precio actual si se proporciona
    if (!investment.isAutomatedPortfolio && price) {
      investment.currentPrice = price;
    }

    await investment.save();

    // Devolver el dinero al efectivo si se solicita
    let returnedToSubAccount = false;
    if (returnToSubAccount) {
      if (req.body.allocation?.account) {
        const validation = await validateAllocationEntry(
          {
            account: req.body.allocation.account,
            subAccount: req.body.allocation.subAccount || null,
            amount: 0,
          },
          req.userId,
        );
        if (validation.error) {
          return res.status(400).json({ message: validation.error });
        }
        const cashSubAccount = await getCashSubAccountForAccount(
          validation.allocation.account,
          req.userId,
        );
        if (!cashSubAccount) {
          return res.status(400).json({
            message:
              "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
          });
        }
        cashSubAccount.balance += saleAmount;
        await cashSubAccount.save();
      } else {
        const cashSubAccounts = await applyCashDeltaForInvestment(
          investment,
          req.userId,
          saleAmount,
        );
        if (!cashSubAccounts || cashSubAccounts.length === 0) {
          return res.status(400).json({
            message:
              "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
          });
        }
      }
      returnedToSubAccount = true;
    }

    // Crear entrada en el historial
    if (date) {
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const totalValue = investment.isAutomatedPortfolio
        ? investment.currentPrice
        : remainingQuantity * price;

      // Calcular diferencias respecto al día anterior
      const dailyChanges = await calculateDailyChanges(
        investment._id,
        req.userId,
        totalValue,
        date || new Date(),
      );

      const historyEntry = new InvestmentHistory({
        user: req.userId,
        investment: investment._id,
        date: date || new Date(),
        ...getHistoryAllocation(investment, req.body.allocation),
        currentPrice: investment.isAutomatedPortfolio
          ? investment.currentPrice
          : price,
        quantity: remainingQuantity,
        totalValue: totalValue,
        notes:
          notes ||
          `Retiro parcial: ${quantity} ${investment.isAutomatedPortfolio ? "€" : "unidades"}${!investment.isAutomatedPortfolio ? ` a ${price}€` : ""}. Restante: ${remainingQuantity}`,
        operation: "withdraw",
        operationAmount: saleAmount,
        operationPrice: investment.isAutomatedPortfolio ? null : price,
        dailyChangeAmount: dailyChanges.dailyChangeAmount,
        dailyChangePercent: dailyChanges.dailyChangePercent,
      });
      await historyEntry.save();
      await recalculateDailyVariationsForInvestmentFromDate(
        investment._id,
        req.userId,
        date || new Date(),
      );
    }

    const populatedInvestment = await Investment.findById(investment._id)
      .populate({
        path: "allocations.subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "allocations.account",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });

    res.json({
      investment: populatedInvestment,
      saleAmount,
      remainingQuantity,
      returnedToSubAccount,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST actualizar precios de todas las inversiones con símbolo
router.post("/update-prices", async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario que tengan símbolo y autoUpdate activado
    // autoUpdate puede ser true o no existir (por defecto true para inversiones antiguas)
    const investments = await Investment.find({
      user: req.userId,
      $and: [
        {
          $or: [
            { symbol: { $exists: true, $ne: null, $ne: "" } },
            { isin: { $exists: true, $ne: null, $ne: "" } },
          ],
        },
        {
          $or: [
            { account: { $exists: true, $ne: null } },
            { "allocations.0": { $exists: true } },
          ],
        },
        {
          $or: [
            { autoUpdate: true },
            { autoUpdate: { $exists: false } }, // Inversiones antiguas sin el campo (por defecto true)
          ],
        },
      ],
    });

    if (investments.length === 0) {
      return res.json({
        message: "No hay inversiones con símbolo para actualizar",
        updated: 0,
        failed: 0,
        results: [],
      });
    }

    // Actualizar precios usando el servicio de cotizaciones
    const quoteResults = await updateMultipleQuotes(investments);

    // Actualizar las inversiones en la base de datos y registrar en historial
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const updatePromises = quoteResults.map(async (result) => {
      if (result.success) {
        // Buscar la inversión por ID de forma más robusta
        const investment = investments.find((inv) => {
          const invId = inv._id?.toString() || inv.id?.toString();
          const resultId = result.investmentId?.toString();
          return invId === resultId;
        });

        if (investment) {
          investment.currentPrice = result.price;
          if (result.currency) {
            investment.currency = result.currency;
          }
          await investment.save();

          // Registrar o actualizar historial diario
          try {
            const existingHistory = await InvestmentHistory.findOne({
              investment: investment._id,
              user: req.userId,
              date: { $gte: today, $lt: tomorrow },
            });

            const totalValue = investment.isAutomatedPortfolio
              ? investment.currentPrice
              : investment.quantity * investment.currentPrice;

            // Calcular diferencias respecto al día anterior
            const dailyChanges = await calculateDailyChanges(
              investment._id,
              req.userId,
              totalValue,
              today,
            );

            if (existingHistory) {
              // Actualizar registro existente con los valores más recientes
              existingHistory.currentPrice = investment.currentPrice;
              existingHistory.quantity = investment.quantity;
              existingHistory.totalValue = totalValue;
              existingHistory.date = new Date(); // Actualizar hora también
              existingHistory.dailyChangeAmount =
                dailyChanges.dailyChangeAmount;
              existingHistory.dailyChangePercent =
                dailyChanges.dailyChangePercent;
              // Mantener las notas originales si no son de actualización automática
              if (
                !existingHistory.notes ||
                existingHistory.notes === "Actualización automática diaria"
              ) {
                existingHistory.notes = "Actualización automática diaria";
              }
              await existingHistory.save();
            } else {
              // Crear nuevo registro si no existe
              const historyEntry = new InvestmentHistory({
                user: req.userId,
                investment: investment._id,
                date: new Date(),
                currentPrice: investment.currentPrice,
                quantity: investment.quantity,
                totalValue: totalValue,
                notes: "Actualización automática diaria",
                operation: "update",
                dailyChangeAmount: dailyChanges.dailyChangeAmount,
                dailyChangePercent: dailyChanges.dailyChangePercent,
              });
              await historyEntry.save();
            }
          } catch (historyError) {
            // No fallar la actualización si falla el historial
          }
        }
      }
      return result;
    });

    await Promise.all(updatePromises);

    const updated = quoteResults.filter((r) => r.success).length;
    const failed = quoteResults.filter((r) => !r.success).length;

    res.json({
      message: `Precios actualizados: ${updated} exitosos, ${failed} fallidos`,
      updated,
      failed,
      results: quoteResults,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST actualizar precio de una inversión específica
router.post("/:id/update-price", async (req, res) => {
  try {
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    if (!investment.symbol) {
      return res
        .status(400)
        .json({ message: "La inversión no tiene símbolo definido" });
    }

    // Obtener cotización actualizada
    const quote = await getQuote(
      investment.symbol,
      investment.type,
      investment.currency,
      investment.isin,
      investment.name,
    );

    // Actualizar el precio
    investment.currentPrice = quote.price;
    if (quote.currency) {
      investment.currency = quote.currency;
    }
    await investment.save();

    // Registrar o actualizar historial diario
    try {
      const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
        .default;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existingHistory = await InvestmentHistory.findOne({
        investment: investment._id,
        user: req.userId,
        date: { $gte: today, $lt: tomorrow },
      });

      const totalValue = investment.isAutomatedPortfolio
        ? investment.currentPrice
        : investment.quantity * investment.currentPrice;

      // Guardar variación diaria en la colección ligera
      await saveDailyVariation(investment._id, req.userId, totalValue);
    } catch (historyError) {
      // No fallar la actualización si falla el historial
    }

    // Populate para devolver la inversión completa
    const populatedInvestment = await Investment.findById(investment._id)
      .populate({
        path: "allocations.subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "allocations.account",
        match: { user: req.userId },
      })
      .populate({
        path: "subAccount",
        match: { user: req.userId },
        populate: {
          path: "account",
          match: { user: req.userId },
        },
      })
      .populate({
        path: "account",
        match: { user: req.userId },
      });

    res.json({
      investment: populatedInvestment,
      quote: {
        price: quote.price,
        currency: quote.currency,
        change: quote.change,
        changePercent: quote.changePercent,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH actualizar solo el campo autoUpdate
router.patch("/:id/auto-update", async (req, res) => {
  try {
    const { autoUpdate } = req.body;
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    });

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    investment.autoUpdate = autoUpdate !== undefined ? autoUpdate : true;
    await investment.save();

    res.json({
      message: `Actualización automática ${autoUpdate ? "activada" : "desactivada"}`,
      investment,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE eliminar inversión
router.delete("/:id", async (req, res) => {
  try {
    const { returnMoney } = req.query;
    const investment = await Investment.findOne({
      _id: req.params.id,
      user: req.userId,
    }).populate({
      path: "subAccount",
      match: { user: req.userId },
    });

    if (!investment) {
      return res.status(404).json({ message: "Inversión no encontrada" });
    }

    // Si se solicita devolver el dinero, calcular el monto original invertido
    if (returnMoney === "true") {
      let originalAmount = 0;

      if (investment.isAutomatedPortfolio) {
        // Para carteras automatizadas, quantity es el monto total invertido
        originalAmount = investment.quantity;
      } else {
        // Para inversiones tradicionales, usar averagePurchasePrice o purchasePrice
        const avgPrice =
          investment.averagePurchasePrice || investment.purchasePrice;
        originalAmount = investment.quantity * avgPrice;
      }

      // Devolver el dinero al efectivo de la cuenta principal
      const cashSubAccount = await applyCashDeltaForInvestment(
        investment,
        req.userId,
        originalAmount,
      );
      if (!cashSubAccount || cashSubAccount.length === 0) {
        return res.status(400).json({
          message:
            "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
        });
      }
    }

    const investmentId = investment._id;

    // IMPORTANTE: Eliminar TODOS los registros históricos de esta inversión
    // Si se elimina una inversión, debe desaparecer completamente del historial
    const InvestmentHistory = (await import("../models/InvestmentHistory.js"))
      .default;
    const DailyVariation = (await import("../models/DailyVariation.js"))
      .default;

    const deletedHistory = await InvestmentHistory.deleteMany({
      user: req.userId,
      investment: investmentId,
    });

    const deletedVariations = await DailyVariation.deleteMany({
      user: req.userId,
      investment: investmentId,
    });

    // Eliminar la inversión
    await Investment.findByIdAndDelete(req.params.id);

    const message =
      returnMoney === "true"
        ? "Inversión eliminada y dinero devuelto a Efectivo"
        : "Inversión eliminada";

    res.json({ message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST ejecutar compras DCA automáticas
router.post("/execute-dca", async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Buscar todas las inversiones con DCA habilitado y próxima fecha <= hoy
    const investments = await Investment.find({
      user: req.userId,
      dcaEnabled: true,
      dcaNextDate: { $lte: today },
      $or: [
        { dcaEndDate: { $exists: false } },
        { dcaEndDate: null },
        { dcaEndDate: { $gte: today } },
      ],
    });

    const results = [];

    for (const investment of investments) {
      try {
        // Verificar que la inversión tenga los datos necesarios
        if (!investment.dcaAmount || investment.dcaAmount <= 0) {
          continue;
        }

        // Obtener precio actual
        let currentPrice = investment.currentPrice;
        if (investment.symbol && investment.autoUpdate !== false) {
          try {
            const quote = await getQuote(investment.symbol, investment.isin);
            if (quote && quote.price) {
              currentPrice = quote.price;
              investment.currentPrice = currentPrice;
            }
          } catch (error) {
            // Si falla la obtención de cotización, usar el precio actual
            console.error(
              `Error obteniendo cotización para ${investment.symbol}:`,
              error,
            );
          }
        }

        if (!currentPrice || currentPrice <= 0) {
          results.push({
            investmentId: investment._id,
            name: investment.name,
            success: false,
            message: "No se pudo obtener el precio actual",
          });
          continue;
        }

        // Calcular cantidad a comprar
        let quantity = 0;
        let price = 0;

        if (investment.isAutomatedPortfolio) {
          // Para carteras automatizadas, la cantidad es el monto
          quantity = investment.dcaAmount;
          price = null;
        } else {
          // Para inversiones tradicionales, calcular cantidad basada en el precio
          quantity = investment.dcaAmount / currentPrice;
          price = currentPrice;
        }

        // Ejecutar la compra usando la lógica del endpoint /:id/add
        const additionalAmount = investment.dcaAmount;

        if (investment.isAutomatedPortfolio) {
          investment.quantity += quantity;
        } else {
          const currentQuantity = investment.quantity;
          const currentAvgPrice =
            investment.averagePurchasePrice || investment.purchasePrice;
          const newQuantity = currentQuantity + quantity;
          const newAveragePrice =
            (currentQuantity * currentAvgPrice + quantity * price) /
            newQuantity;

          investment.quantity = newQuantity;
          investment.averagePurchasePrice = newAveragePrice;
        }

        // Actualizar precio actual si se obtuvo uno nuevo
        if (currentPrice !== investment.currentPrice) {
          investment.currentPrice = currentPrice;
        }

        // Calcular próxima fecha de DCA
        const daysToAdd = {
          daily: 1,
          weekly: 7,
          biweekly: 14,
          monthly: 30,
          quarterly: 90,
        };

        let nextDate = new Date(today);
        nextDate.setDate(
          nextDate.getDate() + daysToAdd[investment.dcaFrequency],
        );

        // Verificar si hay fecha de fin
        if (investment.dcaEndDate) {
          const endDate = new Date(investment.dcaEndDate);
          if (nextDate > endDate) {
            investment.dcaNextDate = null;
            investment.dcaEnabled = false;
          } else {
            investment.dcaNextDate = nextDate;
          }
        } else {
          investment.dcaNextDate = nextDate;
        }

        await investment.save();

        // Crear entrada en el historial
        const InvestmentHistory = (
          await import("../models/InvestmentHistory.js")
        ).default;
        const totalValue = investment.isAutomatedPortfolio
          ? investment.currentPrice
          : investment.quantity * investment.currentPrice;

        const dailyChanges = await calculateDailyChanges(
          investment._id,
          req.userId,
          totalValue,
          today,
        );

        const historyEntry = new InvestmentHistory({
          user: req.userId,
          investment: investment._id,
          date: today,
          ...getHistoryAllocation(investment),
          currentPrice: investment.currentPrice,
          quantity: investment.quantity,
          totalValue: totalValue,
          notes: `Compra DCA automática: ${investment.dcaAmount}${investment.isAutomatedPortfolio ? "€" : ` (${quantity.toFixed(4)} unidades a ${price.toFixed(4)}€)`}`,
          operation: "add",
          operationAmount: additionalAmount,
          operationPrice: investment.isAutomatedPortfolio ? null : price,
          dailyChangeAmount: dailyChanges.dailyChangeAmount,
          dailyChangePercent: dailyChanges.dailyChangePercent,
        });
        await historyEntry.save();

        results.push({
          investmentId: investment._id,
          name: investment.name,
          success: true,
          amount: investment.dcaAmount,
          nextDate: investment.dcaNextDate,
        });
      } catch (error) {
        results.push({
          investmentId: investment._id,
          name: investment.name,
          success: false,
          message: error.message,
        });
      }
    }

    res.json({
      executed: results.filter((r) => r.success).length,
      total: investments.length,
      results: results,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
