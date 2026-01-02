import express from 'express';
import Account from '../models/Account.js';
import SubAccount from '../models/SubAccount.js';
import Transaction from '../models/Transaction.js';
import Investment from '../models/Investment.js';
import Debt from '../models/Debt.js';
import InvestmentHistory from '../models/InvestmentHistory.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';
import { getQuote } from '../services/quoteService.js';
import YahooFinance from 'yahoo-finance2';

const router = express.Router();

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET estadísticas del dashboard
router.get('/stats', async (req, res) => {
  try {
    // Total de cuentas del usuario
    const totalAccounts = await Account.countDocuments({ user: req.userId });
    
    // Balance total de todas las subcuentas (efectivo + ahorro) del usuario
    const cashSavingsSubAccounts = await SubAccount.find({ 
      user: req.userId,
      type: { $in: ['cash', 'savings'] }
    });
    const totalCashSavings = cashSavingsSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);
    
    // Balance de subcuentas de inversión (dinero disponible para invertir)
    const investmentSubAccounts = await SubAccount.find({ 
      user: req.userId,
      type: 'investment'
    });
    const totalInvestmentSubAccountBalance = investmentSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);
    
    // Total de inversiones del usuario (valor actual de las inversiones)
    // Solo obtener inversiones que tienen account (requerido)
    const investments = await Investment.find({ 
      user: req.userId,
      account: { $exists: true, $ne: null }
    })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
        populate: { path: 'account', match: { user: req.userId } },
      })
      .populate({
        path: 'account',
        match: { user: req.userId },
      });
    const totalInvestments = investments.reduce((sum, inv) => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      return sum + value;
    }, 0);
    
    // Balance total = Cash + Savings + Balance en subcuentas de inversión + Valor de inversiones
    const totalBalance = totalCashSavings + totalInvestmentSubAccountBalance + totalInvestments;
    
    // Ganancias/pérdidas totales de inversiones
    const totalProfitLoss = investments.reduce((sum, inv) => {
      if (inv.isAutomatedPortfolio) {
        return sum + (inv.currentPrice - inv.quantity);
      } else {
        const avgPrice = inv.averagePurchasePrice || inv.purchasePrice;
        return sum + ((inv.currentPrice - avgPrice) * inv.quantity);
      }
    }, 0);
    
    // Transacciones del mes actual del usuario
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    const monthlyTransactions = await Transaction.find({
      user: req.userId,
      date: { $gte: startOfMonth, $lte: endOfMonth },
    });
    
    const monthlyIncome = monthlyTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const monthlyExpenses = monthlyTransactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Total de deudas activas del usuario
    const activeDebts = await Debt.find({ user: req.userId, status: 'active' });
    const totalDebts = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
    const totalMonthlyDebtPayments = activeDebts.reduce((sum, debt) => sum + debt.monthlyPayment, 0);
    
    // Patrimonio neto = Balance total - Deudas
    const netWorth = totalBalance - totalDebts;
    
    res.json({
      totalAccounts,
      totalBalance: netWorth, // Mostrar patrimonio neto como balance total
      totalInvestments,
      totalProfitLoss,
      totalDebts,
      totalMonthlyDebtPayments,
      monthlyIncome,
      monthlyExpenses,
      monthlyBalance: monthlyIncome - monthlyExpenses,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET gráfica de balance total por mes
router.get('/balance-chart', async (req, res) => {
  try {
    const { months = 6 } = req.query;
    const data = [];
    const now = new Date();
    
    // Obtener balance actual de cash (no tenemos historial, así que usamos el actual)
    const cashSubAccounts = await SubAccount.find({ 
      user: req.userId,
      type: { $in: ['cash', 'savings'] }
    });
    const currentCashBalance = cashSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);
    
    // Obtener balance de subcuentas de inversión (dinero disponible para invertir)
    const investmentSubAccounts = await SubAccount.find({ 
      user: req.userId,
      type: 'investment'
    });
    const currentInvestmentSubAccountBalance = investmentSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);
    
    // Obtener deudas actuales
    const activeDebts = await Debt.find({ user: req.userId, status: 'active' });
    const currentTotalDebts = activeDebts.reduce((sum, debt) => sum + debt.remainingAmount, 0);
    
    // Obtener historial de inversiones
    for (let i = parseInt(months) - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      
      // Buscar el historial más reciente de inversiones hasta el fin de mes
      const historyEntries = await InvestmentHistory.find({
        user: req.userId,
        date: { $lte: endDate }
      })
        .populate({
          path: 'investment',
          select: '_id',
          match: { user: req.userId },
        })
        .sort({ date: -1 });
      
      // Agrupar por inversión y tomar el valor más reciente de cada una
      const investmentsByInv = {};
      historyEntries.forEach(entry => {
        if (entry.investment && entry.investment._id) {
          const invId = entry.investment._id.toString();
          if (!investmentsByInv[invId] || new Date(entry.date) > new Date(investmentsByInv[invId].date)) {
            investmentsByInv[invId] = entry;
          }
        }
      });
      
      // Calcular valor total de inversiones
      let investmentsValue = 0;
      if (Object.keys(investmentsByInv).length > 0) {
        investmentsValue = Object.values(investmentsByInv).reduce((sum, entry) => sum + (entry.totalValue || 0), 0);
      } else {
        // Si no hay historial para este mes, usar el valor actual de las inversiones
        const investments = await Investment.find({ 
          user: req.userId,
          account: { $exists: true, $ne: null }
        })
          .populate({
            path: 'subAccount',
            select: '_id',
            match: { user: req.userId },
          })
          .populate({
            path: 'account',
            select: '_id',
            match: { user: req.userId },
          });
        investmentsValue = investments.reduce((sum, inv) => {
          const value = inv.isAutomatedPortfolio 
            ? inv.currentPrice 
            : inv.quantity * inv.currentPrice;
          return sum + value;
        }, 0);
      }
      
      // Balance total = Cash (actual) + Balance en subcuentas de inversión + Inversiones (del mes) - Deudas (actuales)
      // Nota: Como no tenemos historial de cash, usamos el valor actual
      const totalBalance = currentCashBalance + currentInvestmentSubAccountBalance + investmentsValue - currentTotalDebts;
      
      data.push({
        month: date.toLocaleString('es-ES', { month: 'short', year: 'numeric' }),
        balance: totalBalance,
      });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Error en /dashboard/balance-chart:', error);
    res.status(500).json({ 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// GET distribución de inversiones por tipo
router.get('/investments-by-type', async (req, res) => {
  try {
    const investments = await Investment.find({ 
      user: req.userId,
      account: { $exists: true, $ne: null }
    })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
        populate: { path: 'account', match: { user: req.userId } },
      });
    const byType = {};
    
    investments.forEach(inv => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      if (!byType[inv.type]) {
        byType[inv.type] = 0;
      }
      byType[inv.type] += value;
    });
    
    const data = Object.entries(byType).map(([type, value]) => ({
      type,
      value,
    }));
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución por clase de activo (Renta Fija, Renta Variable, Cash)
router.get('/distribution-by-asset-class', async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({ 
      user: req.userId,
      account: { $exists: true, $ne: null }
    })
      .populate({
        path: 'subAccount',
        match: { user: req.userId },
        populate: { path: 'account', match: { user: req.userId } },
      })
      .populate({
        path: 'account',
        match: { user: req.userId },
      });
    
    let totalFixedIncome = 0;
    let totalVariableIncome = 0;
    
    investments.forEach(inv => {
      const totalValue = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      
      if (inv.assetClass === 'fixed_income') {
        totalFixedIncome += totalValue;
      } else if (inv.assetClass === 'variable_income') {
        totalVariableIncome += totalValue;
      } else if (inv.assetClass === 'mixed') {
        // Para inversiones mixtas, distribuir según los porcentajes
        const fixedPercent = inv.fixedIncomePercentage || 0;
        const variablePercent = inv.variableIncomePercentage || 0;
        totalFixedIncome += (totalValue * fixedPercent) / 100;
        totalVariableIncome += (totalValue * variablePercent) / 100;
      }
    });
    
    // Obtener total de cash (efectivo + ahorro) del usuario
    const cashSubAccounts = await SubAccount.find({ 
      user: req.userId,
      type: { $in: ['cash', 'savings'] }
    });
    const totalCash = cashSubAccounts.reduce((sum, subAcc) => sum + subAcc.balance, 0);
    
    const data = [
      { name: 'Renta Fija', value: totalFixedIncome },
      { name: 'Renta Variable', value: totalVariableIncome },
      { name: 'Efectivo', value: totalCash },
    ].filter(item => item.value > 0); // Solo incluir categorías con valor > 0
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución detallada por inversión individual
router.get('/investments-detailed', async (req, res) => {
  try {
    const investments = await Investment.find({ user: req.userId })
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
      .sort({ createdAt: -1 });
    
    const data = investments.map(inv => {
      const totalValue = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      
      return {
        name: inv.name,
        value: totalValue,
        currency: inv.currency,
      };
    }).filter(item => item.value > 0); // Solo incluir inversiones con valor > 0
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET distribución por banco y subcuentas
router.get('/distribution-by-bank', async (req, res) => {
  try {
    // Obtener todas las cuentas del usuario con sus subcuentas
    const accounts = await Account.find({ user: req.userId })
      .populate({
        path: 'subAccounts',
        select: 'name type balance currency',
        match: { user: req.userId },
      })
      .sort({ bankName: 1 });
    
    // Obtener todas las inversiones del usuario para calcular valores de subcuentas de inversión
    const investments = await Investment.find({ 
      user: req.userId,
      account: { $exists: true, $ne: null }
    })
      .populate({
        path: 'subAccount',
        select: '_id',
        match: { user: req.userId },
      })
      .populate({
        path: 'account',
        select: '_id name bankName',
        match: { user: req.userId },
      });
    
    // Crear un mapa de inversiones por subcuenta
    const investmentsBySubAccount = {};
    // Crear un mapa de inversiones directas por cuenta
    const investmentsByAccount = {};
    
    investments.forEach(inv => {
      const value = inv.isAutomatedPortfolio 
        ? inv.currentPrice 
        : inv.quantity * inv.currentPrice;
      
      if (inv.subAccount && inv.subAccount._id) {
        // Inversión asociada a subcuenta
        const subAccountId = inv.subAccount._id.toString();
        if (!investmentsBySubAccount[subAccountId]) {
          investmentsBySubAccount[subAccountId] = 0;
        }
        investmentsBySubAccount[subAccountId] += value;
      } else if (inv.account && inv.account._id) {
        // Inversión directa asociada a cuenta
        const accountId = inv.account._id.toString();
        if (!investmentsByAccount[accountId]) {
          investmentsByAccount[accountId] = 0;
        }
        investmentsByAccount[accountId] += value;
      }
    });
    
    // Agrupar por banco
    const banksData = {};
    
    accounts.forEach(account => {
      const bankName = account.bankName || account.name;
      
      if (!banksData[bankName]) {
        banksData[bankName] = {
          bankName,
          color: account.color || null,
          total: 0,
          subAccounts: [],
        };
      }
      
      // Procesar cada subcuenta
      account.subAccounts.forEach(subAccount => {
        let subAccountValue = subAccount.balance;
        
        // Si es subcuenta de inversión, usar el valor de las inversiones
        if (subAccount.type === 'investment') {
          const subAccountId = subAccount._id.toString();
          subAccountValue = investmentsBySubAccount[subAccountId] || 0;
        }
        
        banksData[bankName].subAccounts.push({
          name: subAccount.name,
          type: subAccount.type,
          value: subAccountValue,
          currency: subAccount.currency,
        });
        
        banksData[bankName].total += subAccountValue;
      });
      
      // Agregar inversiones directas de la cuenta (sin subcuenta)
      const accountId = account._id.toString();
      const directInvestmentsValue = investmentsByAccount[accountId] || 0;
      if (directInvestmentsValue > 0) {
        banksData[bankName].subAccounts.push({
          name: 'Inversiones Directas',
          value: directInvestmentsValue,
          type: 'direct_investment',
          currency: account.currency || 'EUR',
        });
        banksData[bankName].total += directInvestmentsValue;
      }
    });
    
    // Convertir a array y ordenar por total descendente
    const data = Object.values(banksData)
      .filter(bank => bank.total > 0)
      .sort((a, b) => b.total - a.total);
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET rendimiento anualizado (CAGR) y comparación con S&P 500
router.get('/performance', async (req, res) => {
  try {
    // Obtener todas las inversiones del usuario
    const investments = await Investment.find({ 
      user: req.userId,
      account: { $exists: true, $ne: null }
    });

    if (investments.length === 0) {
      return res.json({
        annualizedReturn: null,
        totalReturn: null,
        sp500Comparison: null,
        period: null,
        message: 'No hay inversiones para calcular el rendimiento'
      });
    }

    // Obtener el primer registro de historial (valor inicial)
    const firstHistoryEntries = await InvestmentHistory.find({
      user: req.userId,
      investment: { $in: investments.map(inv => inv._id) },
      operation: 'creation'
    })
      .sort({ date: 1 })
      .limit(1);

    // Si no hay registro de creación, usar el registro más antiguo
    let firstHistoryEntry = firstHistoryEntries[0];
    if (!firstHistoryEntry) {
      const oldestEntries = await InvestmentHistory.find({
        user: req.userId,
        investment: { $in: investments.map(inv => inv._id) }
      })
        .sort({ date: 1 })
        .limit(1);
      firstHistoryEntry = oldestEntries[0];
    }

    // Si aún no hay historial, calcular basándose en purchaseDate
    let initialValue = 0;
    let startDate = new Date();
    
    if (firstHistoryEntry) {
      initialValue = firstHistoryEntry.totalValue || 0;
      startDate = new Date(firstHistoryEntry.date);
    } else {
      // Calcular valor inicial basado en purchaseDate y purchasePrice
      investments.forEach(inv => {
        if (inv.isAutomatedPortfolio) {
          initialValue += inv.quantity || 0; // Para carteras, quantity es el capital inicial
        } else {
          const avgPrice = inv.averagePurchasePrice || inv.purchasePrice || 0;
          initialValue += (inv.quantity || 0) * avgPrice;
        }
        const purchaseDate = new Date(inv.purchaseDate);
        if (purchaseDate < startDate) {
          startDate = purchaseDate;
        }
      });
    }

    // Calcular valor actual
    let currentValue = 0;
    investments.forEach(inv => {
      if (inv.isAutomatedPortfolio) {
        currentValue += inv.currentPrice || 0;
      } else {
        currentValue += (inv.quantity || 0) * (inv.currentPrice || 0);
      }
    });

    // Calcular rendimiento total
    const totalReturn = currentValue - initialValue;
    const totalReturnPercent = initialValue > 0 ? ((currentValue / initialValue) - 1) * 100 : 0;

    // Calcular tiempo transcurrido en años
    const endDate = new Date();
    const timeDiff = endDate - startDate;
    const years = timeDiff / (1000 * 60 * 60 * 24 * 365.25); // Años con decimales

    // Calcular CAGR (Compound Annual Growth Rate)
    // CAGR = (Valor Final / Valor Inicial)^(1/Años) - 1
    let annualizedReturn = null;
    if (initialValue > 0 && years > 0) {
      const cagr = (Math.pow(currentValue / initialValue, 1 / years) - 1) * 100;
      annualizedReturn = parseFloat(cagr.toFixed(2));
    }

    // Obtener datos del S&P 500 para comparación
    // Usamos el rendimiento histórico promedio del S&P 500 (~10% anual)
    // ya que obtener datos históricos precisos requeriría una API especializada
    const sp500HistoricalReturn = 10; // % anual promedio histórico (últimos ~100 años)
    
    // Calcular qué habría sido el rendimiento del S&P 500 en el mismo período
    const sp500ProjectedReturn = years > 0 
      ? (Math.pow(1 + sp500HistoricalReturn / 100, years) - 1) * 100
      : 0;

    let sp500Comparison = {
      historicalAnnualReturn: sp500HistoricalReturn,
      projectedReturn: parseFloat(sp500ProjectedReturn.toFixed(2)),
      outperformance: annualizedReturn !== null 
        ? parseFloat((annualizedReturn - sp500HistoricalReturn).toFixed(2))
        : null,
      outperformancePercent: annualizedReturn !== null && sp500HistoricalReturn !== 0
        ? parseFloat(((annualizedReturn / sp500HistoricalReturn - 1) * 100).toFixed(2))
        : null
    };

    // Intentar obtener precio actual del S&P 500 (opcional, no crítico para la comparación)
    try {
      const yahooFinance = new YahooFinance();
      
      // Intentar primero con ^GSPC (índice directo)
      try {
        const sp500Quote = await yahooFinance.quote('^GSPC');
        if (sp500Quote && sp500Quote.regularMarketPrice) {
          sp500Comparison.currentPrice = sp500Quote.regularMarketPrice;
        }
      } catch (gspcError) {
        // Si ^GSPC falla, intentar con SPY (ETF que replica el S&P 500)
        try {
          const spyQuote = await yahooFinance.quote('SPY');
          if (spyQuote && spyQuote.regularMarketPrice) {
            sp500Comparison.currentPrice = spyQuote.regularMarketPrice;
          }
        } catch (spyError) {
          // Si ambos fallan, continuar sin precio actual (no es crítico)
        }
      }
    } catch (sp500Error) {
      // No es crítico, continuamos sin el precio actual
      // La comparación de rendimiento funciona perfectamente sin el precio actual
    }

    res.json({
      annualizedReturn,
      totalReturn,
      totalReturnPercent: parseFloat(totalReturnPercent.toFixed(2)),
      initialValue,
      currentValue,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      years: parseFloat(years.toFixed(2)),
      sp500Comparison,
    });
  } catch (error) {
    console.error('Error calculando rendimiento:', error);
    res.status(500).json({ message: error.message });
  }
});

export default router;

