import yahooFinance from 'yahoo-finance2';
import fetch from 'node-fetch';

/**
 * Obtiene la cotización en tiempo real de una inversión
 * @param {string} symbol - Símbolo de la inversión (ej: "AAPL", "BTC-USD")
 * @param {string} type - Tipo de inversión: 'stock', 'etf', 'bond', 'crypto', 'fund', 'other'
 * @param {string} currency - Moneda de la inversión
 * @returns {Promise<{price: number, currency: string, change: number, changePercent: number}>}
 */
export async function getQuote(symbol, type, currency = 'EUR') {
  if (!symbol) {
    throw new Error('El símbolo es requerido para obtener la cotización');
  }

  try {
    // Para criptomonedas, usar CoinGecko o Yahoo Finance
    if (type === 'crypto') {
      return await getCryptoQuote(symbol, currency);
    }

    // Para acciones, ETFs, bonos, usar Yahoo Finance
    if (['stock', 'etf', 'bond', 'fund'].includes(type)) {
      return await getYahooQuote(symbol, currency);
    }

    // Para otros tipos, intentar con Yahoo Finance de todas formas
    return await getYahooQuote(symbol, currency);
  } catch (error) {
    console.error(`Error obteniendo cotización para ${symbol}:`, error.message);
    throw new Error(`No se pudo obtener la cotización para ${symbol}: ${error.message}`);
  }
}

/**
 * Obtiene cotización de Yahoo Finance
 */
async function getYahooQuote(symbol, currency) {
  try {
    // Yahoo Finance usa diferentes formatos según el mercado
    // Para acciones europeas, puede ser necesario el sufijo del mercado (ej: "SAN.MC" para Santander en Madrid)
    const quote = await yahooFinance.quote(symbol);
    
    if (!quote || !quote.regularMarketPrice) {
      throw new Error(`No se encontró cotización para ${symbol}`);
    }

    const price = quote.regularMarketPrice;
    const previousClose = quote.regularMarketPreviousClose || price;
    const change = price - previousClose;
    const changePercent = previousClose ? ((change / previousClose) * 100) : 0;

    return {
      price,
      currency: quote.currency || currency,
      change,
      changePercent,
      marketTime: quote.regularMarketTime,
    };
  } catch (error) {
    // Si falla, intentar con CoinGecko para crypto (por si acaso)
    if (symbol.includes('-') || symbol.includes('USD') || symbol.includes('EUR')) {
      throw error;
    }
    throw new Error(`Error obteniendo cotización de Yahoo Finance: ${error.message}`);
  }
}

/**
 * Obtiene cotización de criptomonedas usando CoinGecko
 */
async function getCryptoQuote(symbol, currency = 'EUR') {
  try {
    // Mapear símbolos comunes a IDs de CoinGecko
    const cryptoMap = {
      'BTC': 'bitcoin',
      'ETH': 'ethereum',
      'BNB': 'binancecoin',
      'SOL': 'solana',
      'ADA': 'cardano',
      'XRP': 'ripple',
      'DOT': 'polkadot',
      'DOGE': 'dogecoin',
      'MATIC': 'matic-network',
      'LTC': 'litecoin',
    };

    // Limpiar el símbolo (puede venir como "BTC-USD" o "BTC")
    const cleanSymbol = symbol.split('-')[0].toUpperCase();
    const coinId = cryptoMap[cleanSymbol] || cleanSymbol.toLowerCase();

    // Mapear monedas
    const currencyMap = {
      'EUR': 'eur',
      'USD': 'usd',
      'GBP': 'gbp',
    };
    const vsCurrency = currencyMap[currency] || 'eur';

    // Intentar obtener el precio
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}&include_24hr_change=true`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data[coinId]) {
      // Si no se encuentra por ID, intentar buscar por símbolo
      const searchResponse = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${cleanSymbol.toLowerCase()}&vs_currencies=${vsCurrency}&include_24hr_change=true`
      );
      
      if (!searchResponse.ok) {
        throw new Error(`Criptomoneda ${symbol} no encontrada`);
      }
      
      const searchData = await searchResponse.json();
      const coinData = searchData[cleanSymbol.toLowerCase()];
      
      if (!coinData) {
        throw new Error(`Criptomoneda ${symbol} no encontrada`);
      }

      return {
        price: coinData[vsCurrency],
        currency: currency.toUpperCase(),
        change: coinData[`${vsCurrency}_24h_change`] ? (coinData[vsCurrency] * coinData[`${vsCurrency}_24h_change`] / 100) : 0,
        changePercent: coinData[`${vsCurrency}_24h_change`] || 0,
      };
    }

    const coinData = data[coinId];

    return {
      price: coinData[vsCurrency],
      currency: currency.toUpperCase(),
      change: coinData[`${vsCurrency}_24h_change`] ? (coinData[vsCurrency] * coinData[`${vsCurrency}_24h_change`] / 100) : 0,
      changePercent: coinData[`${vsCurrency}_24h_change`] || 0,
    };
  } catch (error) {
    // Si CoinGecko falla, intentar con Yahoo Finance
    try {
      // Yahoo Finance usa formato como "BTC-EUR" o "BTC-USD"
      const yahooSymbol = symbol.includes('-') ? symbol : `${symbol}-${currency}`;
      return await getYahooQuote(yahooSymbol, currency);
    } catch (yahooError) {
      throw new Error(`Error obteniendo cotización de criptomoneda: ${error.message}`);
    }
  }
}

/**
 * Actualiza los precios de múltiples inversiones
 * @param {Array} investments - Array de inversiones con symbol y type
 * @returns {Promise<Array>} Array de resultados con price actualizado
 */
export async function updateMultipleQuotes(investments) {
  const results = [];
  
  // Procesar en lotes para evitar rate limiting
  const batchSize = 5;
  for (let i = 0; i < investments.length; i += batchSize) {
    const batch = investments.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (investment) => {
      try {
        if (!investment.symbol) {
          return {
            investmentId: investment._id || investment.id,
            success: false,
            error: 'No tiene símbolo definido',
          };
        }

        const quote = await getQuote(
          investment.symbol,
          investment.type,
          investment.currency
        );

        return {
          investmentId: investment._id || investment.id,
          success: true,
          price: quote.price,
          currency: quote.currency,
          change: quote.change,
          changePercent: quote.changePercent,
        };
      } catch (error) {
        return {
          investmentId: investment._id || investment.id,
          success: false,
          error: error.message,
        };
      }
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Esperar un poco entre lotes para evitar rate limiting
    if (i + batchSize < investments.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  return results;
}

