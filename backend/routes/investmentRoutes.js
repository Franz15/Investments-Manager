import express from 'express';
import Investment from '../models/Investment.js';
import SubAccount from '../models/SubAccount.js';
import Account from '../models/Account.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';
import { updateMultipleQuotes, getQuote } from '../services/quoteService.js';

const router = express.Router();

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET todas las inversiones
router.get('/', async (req, res) => {
  try {
    const { subAccountId, accountId } = req.query;
    const query = { user: req.userId };
    
    if (subAccountId) {
      query.subAccount = subAccountId;
    } else if (accountId) {
      // Si se busca por accountId, buscar inversiones directamente asociadas a la cuenta
      // o a través de subcuentas de inversión de esa cuenta
      const subAccounts = await SubAccount.find({ account: accountId, type: 'investment', user: req.userId });
      const subAccountIds = subAccounts.map(sa => sa._id);
      query.$or = [
        { account: accountId },
        { subAccount: { $in: subAccountIds } }
      ];
    }
    
    const investments = await Investment.find(query)
      .populate({
        path: 'subAccount',
        select: 'name type balance currency',
        match: { user: req.userId },
        populate: {
          path: 'account',
          select: 'name bankName',
          match: { user: req.userId },
        },
      })
      .populate({
        path: 'account',
        select: 'name bankName',
        match: { user: req.userId },
      })
      .sort({ createdAt: -1 });
    res.json(investments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET inversión por ID
router.get('/:id', async (req, res) => {
  try {
    const investment = await Investment.findOne({ _id: req.params.id, user: req.userId })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
        populate: {
          path: 'account',
          match: { user: req.userId },
        },
      })
      .populate({
        path: 'account',
        match: { user: req.userId },
      });
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    res.json(investment);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST crear nueva inversión
router.post('/', async (req, res) => {
  try {
    // Validar que account esté presente (siempre obligatorio)
    if (!req.body.account) {
      return res.status(400).json({ message: 'Debe especificar una cuenta' });
    }
    
    let subAccount = null;
    let account = null;
    
    // Validar que la cuenta existe
    account = await Account.findOne({ _id: req.body.account, user: req.userId });
    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada' });
    }
    
    // Si se especifica subcuenta, validar que existe, es de tipo investment y pertenece a la cuenta
    if (req.body.subAccount) {
      subAccount = await SubAccount.findOne({ _id: req.body.subAccount, user: req.userId });
      if (!subAccount) {
        return res.status(404).json({ message: 'Subcuenta no encontrada' });
      }
      if (subAccount.type !== 'investment') {
        return res.status(400).json({ message: 'La subcuenta debe ser de tipo inversión' });
      }
      // Validar que la subcuenta pertenece a la cuenta seleccionada
      const subAccountAccountId = subAccount.account?._id?.toString() || subAccount.account?.toString();
      if (subAccountAccountId !== req.body.account.toString()) {
        return res.status(400).json({ message: 'La subcuenta no pertenece a la cuenta seleccionada' });
      }
    }
    
    // Calcular el monto total de la inversión
    let investmentAmount = 0;
    if (req.body.isAutomatedPortfolio) {
      // Para carteras automatizadas, quantity es el monto total invertido
      investmentAmount = req.body.quantity || 0;
    } else {
      // Para inversiones tradicionales, quantity * purchasePrice
      investmentAmount = (req.body.quantity || 0) * (req.body.purchasePrice || 0);
    }
    
    // Crear la inversión
    const investment = new Investment({
      ...req.body,
      user: req.userId,
    });
    const savedInvestment = await investment.save();
    
    // Si hay subcuenta, SUMAR el monto invertido al balance (no restar)
    // Esto permite crear inversiones sin estar limitado al dinero existente
    if (subAccount) {
      subAccount.balance += investmentAmount;
      await subAccount.save();
    }
    
    // Populate según lo que tenga la inversión
    const populatePaths = [];
    if (savedInvestment.subAccount) {
      populatePaths.push({
        path: 'subAccount',
        match: { user: req.userId },
        populate: {
          path: 'account',
          match: { user: req.userId },
        },
      });
    }
    if (savedInvestment.account) {
      populatePaths.push({
        path: 'account',
        match: { user: req.userId },
      });
    }
    
    let populatedInvestment = await Investment.findById(savedInvestment._id);
    for (const populatePath of populatePaths) {
      populatedInvestment = await Investment.populate(populatedInvestment, populatePath);
    }
    
    res.status(201).json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT actualizar inversión
router.put('/:id', async (req, res) => {
  try {
    const investment = await Investment.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      req.body,
      {
        new: true,
        runValidators: true,
      }
    );
    
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    // Populate según lo que tenga la inversión
    const populatePaths = [];
    if (investment.subAccount) {
      populatePaths.push({
        path: 'subAccount',
        match: { user: req.userId },
        populate: {
          path: 'account',
          match: { user: req.userId },
        },
      });
    }
    if (investment.account) {
      populatePaths.push({
        path: 'account',
        match: { user: req.userId },
      });
    }
    
    let populatedInvestment = investment;
    for (const populatePath of populatePaths) {
      populatedInvestment = await Investment.populate(populatedInvestment, populatePath);
    }
    
    res.json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST añadir a una inversión (calcular nuevo precio medio)
router.post('/:id/add', async (req, res) => {
  try {
    const { quantity, price, date, notes } = req.body;
    const investment = await Investment.findOne({ _id: req.params.id, user: req.userId })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
      });
    
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
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
      const currentAvgPrice = investment.averagePurchasePrice || investment.purchasePrice;
      const newQuantity = currentQuantity + quantity;
      
      // Calcular nuevo precio medio: (cantidad_actual * precio_medio_actual + cantidad_nueva * precio_nuevo) / cantidad_total
      const newAveragePrice = ((currentQuantity * currentAvgPrice) + (quantity * price)) / newQuantity;
      
      investment.quantity = newQuantity;
      investment.averagePurchasePrice = newAveragePrice;
      
      // Si se proporciona un precio actual, actualizarlo también
      if (req.body.currentPrice) {
        investment.currentPrice = req.body.currentPrice;
      }
    }
    
    await investment.save();
    
    // Si hay subcuenta, SUMAR el monto adicional al balance (no restar)
    if (investment.subAccount) {
      investment.subAccount.balance += additionalAmount;
      await investment.subAccount.save();
    }
    
    // Crear entrada en el historial si se proporciona fecha
    if (date) {
      const InvestmentHistory = (await import('../models/InvestmentHistory.js')).default;
      const historyEntry = new InvestmentHistory({
        user: req.userId,
        investment: investment._id,
        date: date || new Date(),
        currentPrice: investment.currentPrice,
        quantity: investment.quantity,
        totalValue: investment.isAutomatedPortfolio 
          ? investment.currentPrice 
          : investment.quantity * investment.currentPrice,
        notes: notes || `Añadido: ${quantity} ${investment.isAutomatedPortfolio ? '€' : 'unidades'} a ${price}${investment.isAutomatedPortfolio ? '€' : ''}`,
      });
      await historyEntry.save();
    }
    
    const populatedInvestment = await Investment.findById(investment._id)
      .populate({
        path: 'subAccount',
        populate: {
          path: 'account',
        },
      });
    
    res.json(populatedInvestment);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// POST actualizar precios de todas las inversiones con símbolo
router.post('/update-prices', async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario que tengan símbolo y autoUpdate activado
    // autoUpdate puede ser true o no existir (por defecto true para inversiones antiguas)
    const investments = await Investment.find({ 
      user: req.userId,
      $and: [
        {
          $or: [
            { symbol: { $exists: true, $ne: null, $ne: '' } },
            { isin: { $exists: true, $ne: null, $ne: '' } }
          ]
        },
        {
          account: { $exists: true, $ne: null }
        },
        {
          $or: [
            { autoUpdate: true },
            { autoUpdate: { $exists: false } } // Inversiones antiguas sin el campo (por defecto true)
          ]
        }
      ]
    });

    if (investments.length === 0) {
      return res.json({ 
        message: 'No hay inversiones con símbolo para actualizar',
        updated: 0,
        failed: 0,
        results: [],
      });
    }

    // Actualizar precios usando el servicio de cotizaciones
    const quoteResults = await updateMultipleQuotes(investments);

    // Actualizar las inversiones en la base de datos
    const updatePromises = quoteResults.map(async (result) => {
      if (result.success) {
        // Buscar la inversión por ID de forma más robusta
        const investment = investments.find(inv => {
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
        }
      }
      return result;
    });

    await Promise.all(updatePromises);

    const updated = quoteResults.filter(r => r.success).length;
    const failed = quoteResults.filter(r => !r.success).length;

    res.json({
      message: `Precios actualizados: ${updated} exitosos, ${failed} fallidos`,
      updated,
      failed,
      results: quoteResults,
    });
  } catch (error) {
    console.error('Error actualizando precios:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST actualizar precio de una inversión específica
router.post('/:id/update-price', async (req, res) => {
  try {
    const investment = await Investment.findOne({ 
      _id: req.params.id, 
      user: req.userId,
      account: { $exists: true, $ne: null },
    });

    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }

    if (!investment.symbol) {
      return res.status(400).json({ message: 'La inversión no tiene símbolo definido' });
    }

    // Obtener cotización actualizada
    const quote = await getQuote(
      investment.symbol, 
      investment.type, 
      investment.currency,
      investment.isin,
      investment.name
    );

    // Actualizar el precio
    investment.currentPrice = quote.price;
    if (quote.currency) {
      investment.currency = quote.currency;
    }
    await investment.save();

    // Populate para devolver la inversión completa
    const populatedInvestment = await Investment.findById(investment._id)
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
        populate: {
          path: 'account',
          match: { user: req.userId },
        },
      })
      .populate({
        path: 'account',
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
    console.error('Error actualizando precio:', error);
    res.status(500).json({ message: error.message });
  }
});

// PATCH actualizar solo el campo autoUpdate
router.patch('/:id/auto-update', async (req, res) => {
  try {
    const { autoUpdate } = req.body;
    const investment = await Investment.findOne({ _id: req.params.id, user: req.userId });
    
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    investment.autoUpdate = autoUpdate !== undefined ? autoUpdate : true;
    await investment.save();
    
    res.json({ 
      message: `Actualización automática ${autoUpdate ? 'activada' : 'desactivada'}`,
      investment 
    });
  } catch (error) {
    console.error('Error actualizando autoUpdate:', error);
    res.status(500).json({ message: error.message });
  }
});

// DELETE eliminar inversión
router.delete('/:id', async (req, res) => {
  try {
    const { returnMoney } = req.query;
    const investment = await Investment.findOne({ _id: req.params.id, user: req.userId })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
      });
    
    if (!investment) {
      return res.status(404).json({ message: 'Inversión no encontrada' });
    }
    
    // Si se solicita devolver el dinero, calcular el monto original invertido
    if (returnMoney === 'true' && investment.subAccount) {
      let originalAmount = 0;
      
      if (investment.isAutomatedPortfolio) {
        // Para carteras automatizadas, quantity es el monto total invertido
        originalAmount = investment.quantity;
      } else {
        // Para inversiones tradicionales, usar averagePurchasePrice o purchasePrice
        const avgPrice = investment.averagePurchasePrice || investment.purchasePrice;
        originalAmount = investment.quantity * avgPrice;
      }
      
      // Devolver el dinero a la subcuenta
      investment.subAccount.balance += originalAmount;
      await investment.subAccount.save();
    }
    
    // Eliminar la inversión
    await Investment.findByIdAndDelete(req.params.id);
    
    const message = returnMoney === 'true' 
      ? 'Inversión eliminada y dinero devuelto a la subcuenta'
      : 'Inversión eliminada';
    
    res.json({ message });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

