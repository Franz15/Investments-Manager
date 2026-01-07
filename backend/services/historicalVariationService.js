import DailyVariation from "../models/DailyVariation.js";
import InvestmentHistory from "../models/InvestmentHistory.js";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

/**
 * Obtiene datos históricos de precios de Yahoo Finance
 */
export async function getHistoricalPrices(symbol, startDate, endDate) {
  try {
    // Intentar diferentes variantes del símbolo
    const symbolVariants = [
      symbol,
      symbol.includes(".") ? symbol : `${symbol}.MC`,
      symbol.includes(".") ? symbol : `${symbol}.AS`,
    ];

    for (const symbolToTry of symbolVariants) {
      try {
        // Usar chart() en lugar de historical() (que está deprecado)
        const chartData = await yahooFinance.chart(symbolToTry, {
          period1: Math.floor(startDate.getTime() / 1000),
          period2: Math.floor(endDate.getTime() / 1000),
          interval: "1d",
        });

        if (chartData && chartData.quotes && chartData.quotes.length > 0) {
          return chartData.quotes.map((day) => ({
            date: day.date instanceof Date ? day.date : new Date(day.date),
            close: day.close,
            open: day.open,
            high: day.high,
            low: day.low,
            volume: day.volume,
          }));
        }
      } catch (error) {
        // Continuar con la siguiente variante
        continue;
      }
    }

    return [];
  } catch (error) {
    return [];
  }
}

/**
 * Calcula y guarda variaciones históricas desde la fecha de compra hasta hoy
 * Tiene en cuenta las compras adicionales (add) para calcular el valor total correcto
 */
export async function calculateHistoricalVariations(
  investmentId,
  userId,
  investment,
) {
  try {
    // No calcular para carteras automatizadas
    if (investment.isAutomatedPortfolio) {
      return {
        calculated: 0,
        message: "Cartera automatizada, no se calculan variaciones históricas",
      };
    }

    // Verificar que tiene símbolo
    if (!investment.symbol) {
      return { calculated: 0, message: "No tiene símbolo definido" };
    }

    const purchaseDate = new Date(investment.purchaseDate);
    purchaseDate.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Obtener TODOS los registros de historial (incluyendo 'update' para tener valores reales)
    const historyEntries = await InvestmentHistory.find({
      investment: investmentId,
      user: userId,
    }).sort({ date: 1 });

    // Obtener datos históricos de precios
    const historicalPrices = await getHistoricalPrices(
      investment.symbol,
      purchaseDate,
      today,
    );

    if (historicalPrices.length === 0) {
      return {
        calculated: 0,
        message: "No se pudieron obtener datos históricos",
      };
    }

    // Crear un mapa de precios por fecha
    const priceMap = new Map();
    historicalPrices.forEach((day) => {
      const date = new Date(day.date);
      date.setHours(0, 0, 0, 0);
      priceMap.set(date.getTime(), day.close);
    });

    // Calcular variaciones día por día
    let calculated = 0;
    let currentQuantity = investment.quantity || 0;
    let previousTotalValue = null;
    let previousQuantity = 0;

    // Iterar día por día desde la fecha de compra hasta hoy
    const currentDate = new Date(purchaseDate);

    while (currentDate <= today) {
      const dateKey = currentDate.getTime();

      // Verificar si hay operaciones (add/sell) en este día
      const dayOperations = historyEntries.filter((h) => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === dateKey;
      });

      // Calcular el capital añadido/retirado en este día
      let capitalChange = 0;
      for (const op of dayOperations) {
        if (op.operation === "creation" || op.operation === "add") {
          currentQuantity += op.quantity || 0;
          // El capital añadido es el operationAmount o quantity * operationPrice
          capitalChange +=
            op.operationAmount || op.quantity * (op.operationPrice || 0);
        } else if (op.operation === "sell" || op.operation === "withdraw") {
          currentQuantity -= op.quantity || 0;
          // El capital retirado es negativo
          capitalChange -=
            op.operationAmount || op.quantity * (op.operationPrice || 0);
        }
      }

      // Obtener precio del día (si no hay, usar el más cercano anterior)
      let dayPrice = priceMap.get(dateKey);
      if (!dayPrice) {
        // Buscar el precio más cercano anterior (para días festivos/fines de semana)
        const sortedDates = Array.from(priceMap.keys()).sort((a, b) => b - a);
        const closestDate = sortedDates.find((d) => d <= dateKey);
        if (closestDate) {
          dayPrice = priceMap.get(closestDate);
        }
      }

      // Si aún no hay precio, usar el último precio conocido de días anteriores
      if (!dayPrice && previousTotalValue !== null && currentQuantity > 0) {
        // Calcular el precio unitario del día anterior
        dayPrice = previousTotalValue / currentQuantity;
      }

      // Verificar si hay un registro en InvestmentHistory para este día con valores reales
      // Si existe, usar esos valores en lugar de calcular desde Yahoo Finance
      const dayHistoryEntry = historyEntries.find((h) => {
        const hDate = new Date(h.date);
        hDate.setHours(0, 0, 0, 0);
        return hDate.getTime() === dateKey && h.totalValue;
      });

      let totalValue;
      if (dayHistoryEntry && dayHistoryEntry.totalValue) {
        // Usar el valor real del historial si existe
        totalValue = dayHistoryEntry.totalValue;
        // Actualizar la cantidad si hay una operación
        if (
          dayHistoryEntry.operation === "creation" ||
          dayHistoryEntry.operation === "add"
        ) {
          currentQuantity = dayHistoryEntry.quantity || currentQuantity;
        } else if (
          dayHistoryEntry.operation === "sell" ||
          dayHistoryEntry.operation === "withdraw"
        ) {
          currentQuantity = dayHistoryEntry.quantity || currentQuantity;
        }
      } else if (dayPrice && currentQuantity >= 0) {
        // Si no hay historial, calcular desde Yahoo Finance
        totalValue = currentQuantity * dayPrice;
      } else {
        // Si no hay precio ni historial, saltar este día
        currentDate.setDate(currentDate.getDate() + 1);
        continue;
      }

      // Calcular variación respecto al día anterior
      // La variación es el cambio de valor menos el capital añadido/retirado
      let changeAmount = 0;
      let changePercent = 0;

      if (previousTotalValue !== null && previousTotalValue > 0) {
        // Variación = (Valor total hoy - Capital añadido) - Valor total ayer
        // Esto da la variación pura del precio, sin contar el capital añadido
        const valueChange = totalValue - previousTotalValue;
        changeAmount = valueChange - capitalChange;

        // Para el porcentaje, comparar con el valor anterior (sin capital añadido)
        changePercent =
          previousTotalValue > 0
            ? (changeAmount / previousTotalValue) * 100
            : 0;
      } else if (previousTotalValue === null && currentQuantity > 0) {
        // Primer día: no hay variación
        changeAmount = 0;
        changePercent = 0;
      }

      // Guardar variación diaria
      await DailyVariation.findOneAndUpdate(
        {
          investment: investmentId,
          user: userId,
          date: {
            $gte: currentDate,
            $lt: new Date(currentDate.getTime() + 24 * 60 * 60 * 1000),
          },
        },
        {
          investment: investmentId,
          user: userId,
          date: new Date(currentDate),
          totalValue: totalValue,
          changeAmount: parseFloat(changeAmount.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
        },
        {
          upsert: true,
          new: true,
        },
      );

      previousTotalValue = totalValue;
      previousQuantity = currentQuantity;
      calculated++;

      // Avanzar al siguiente día
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      calculated,
      message: `Variaciones calculadas: ${calculated} días`,
    };
  } catch (error) {
    return { calculated: 0, message: `Error: ${error.message}` };
  }
}

/**
 * Migra datos de variación diaria de InvestmentHistory a DailyVariation
 */
export async function migrateExistingDailyVariations(userId = null) {
  try {
    const query = {
      dailyChangeAmount: { $exists: true, $ne: null },
      dailyChangePercent: { $exists: true, $ne: null },
    };

    if (userId) {
      query.user = userId;
    }

    // Obtener todos los registros de historial que tienen variación diaria
    const historyEntries = await InvestmentHistory.find(query).sort({
      date: 1,
    });

    let migrated = 0;
    let skipped = 0;

    for (const entry of historyEntries) {
      try {
        // Verificar si ya existe en DailyVariation
        const date = new Date(entry.date);
        date.setHours(0, 0, 0, 0);
        const tomorrow = new Date(date);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const existing = await DailyVariation.findOne({
          investment: entry.investment,
          user: entry.user,
          date: { $gte: date, $lt: tomorrow },
        });

        if (!existing) {
          // Crear nueva entrada en DailyVariation
          await DailyVariation.create({
            investment: entry.investment,
            user: entry.user,
            date: date,
            totalValue: entry.totalValue,
            changeAmount: entry.dailyChangeAmount,
            changePercent: entry.dailyChangePercent,
          });
          migrated++;
        } else {
          skipped++;
        }
      } catch (error) {
        skipped++;
      }
    }

    return {
      migrated,
      skipped,
      total: historyEntries.length,
      message: `Migradas ${migrated} variaciones, ${skipped} ya existían o tuvieron errores`,
    };
  } catch (error) {
    return {
      migrated: 0,
      skipped: 0,
      total: 0,
      message: `Error en migración: ${error.message}`,
    };
  }
}
