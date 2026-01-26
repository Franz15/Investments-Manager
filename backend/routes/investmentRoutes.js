import express from "express";
import Investment from "../models/Investment.js";
import SubAccount from "../models/SubAccount.js";
import Account from "../models/Account.js";
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

const getCashSubAccountForInvestment = async (investment, userId) => {
  const subAccountId = investment.subAccount?._id || investment.subAccount;
  const sourceSubAccount = subAccountId
    ? await SubAccount.findOne({ _id: subAccountId, user: userId })
    : null;
  const accountId =
    sourceSubAccount?.account || investment.account?._id || investment.account;
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
      currency: account?.currency || sourceSubAccount?.currency || "EUR",
      description: "Efectivo creado automáticamente para devoluciones",
    });
    await cashSubAccount.save();
  }

  return cashSubAccount;
};

const applyCashDeltaForInvestment = async (investment, userId, amount) => {
  const cashSubAccount = await getCashSubAccountForInvestment(
    investment,
    userId,
  );
  if (!cashSubAccount) return null;
  cashSubAccount.balance += amount;
  await cashSubAccount.save();
  return cashSubAccount;
};

// GET todas las inversiones
router.get("/", async (req, res) => {
  try {
    const { subAccountId, accountId } = req.query;
    const query = { user: req.userId };

    if (subAccountId) {
      query.subAccount = subAccountId;
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
      ];
    }

    const investments = await Investment.find(query)
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
    res.json(investments);
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
    // Validar que account esté presente (siempre obligatorio)
    if (!req.body.account) {
      return res.status(400).json({ message: "Debe especificar una cuenta" });
    }

    normalizeInvestmentClassification(req.body);

    let subAccount = null;
    let account = null;

    // Validar que la cuenta existe
    account = await Account.findOne({
      _id: req.body.account,
      user: req.userId,
    });
    if (!account) {
      return res.status(404).json({ message: "Cuenta no encontrada" });
    }

    // Si se especifica subcuenta, validar que existe, es de tipo investment y pertenece a la cuenta
    if (req.body.subAccount) {
      subAccount = await SubAccount.findOne({
        _id: req.body.subAccount,
        user: req.userId,
      });
      if (!subAccount) {
        return res.status(404).json({ message: "Subcuenta no encontrada" });
      }
      if (subAccount.type !== "investment") {
        return res
          .status(400)
          .json({ message: "La subcuenta debe ser de tipo inversión" });
      }
      // Validar que la subcuenta pertenece a la cuenta seleccionada
      const subAccountAccountId =
        subAccount.account?._id?.toString() || subAccount.account?.toString();
      if (subAccountAccountId !== req.body.account.toString()) {
        return res.status(400).json({
          message: "La subcuenta no pertenece a la cuenta seleccionada",
        });
      }
    }

    // Calcular el monto total de la inversión
    let investmentAmount = 0;
    if (req.body.isAutomatedPortfolio) {
      // Para carteras automatizadas, quantity es el monto total invertido
      investmentAmount = req.body.quantity || 0;
    } else {
      // Para inversiones tradicionales, quantity * purchasePrice
      investmentAmount =
        (req.body.quantity || 0) * (req.body.purchasePrice || 0);
    }

    // Crear la inversión
    const investment = new Investment({
      ...req.body,
      user: req.userId,
    });
    const savedInvestment = await investment.save();

    // Populate según lo que tenga la inversión
    const populatePaths = [];
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

    const populatedInvestment = await Investment.findById(
      investment._id,
    ).populate({
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

    // Si se retira todo, eliminar la inversión
    if (remainingQuantity <= 0) {
      // Devolver el dinero al efectivo si se solicita
      let returnedToSubAccount = false;
      if (returnToSubAccount) {
        const cashSubAccount = await applyCashDeltaForInvestment(
          investment,
          req.userId,
          saleAmount,
        );
        if (!cashSubAccount) {
          return res.status(400).json({
            message:
              "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
          });
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

    // Para inversiones tradicionales, actualizar el precio actual si se proporciona
    if (!investment.isAutomatedPortfolio && price) {
      investment.currentPrice = price;
    }

    await investment.save();

    // Devolver el dinero al efectivo si se solicita
    let returnedToSubAccount = false;
    if (returnToSubAccount) {
      const cashSubAccount = await applyCashDeltaForInvestment(
        investment,
        req.userId,
        saleAmount,
      );
      if (!cashSubAccount) {
        return res.status(400).json({
          message:
            "No se pudo encontrar la subcuenta Efectivo para devolver el dinero",
        });
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
          account: { $exists: true, $ne: null },
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
      account: { $exists: true, $ne: null },
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
      if (!cashSubAccount) {
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
