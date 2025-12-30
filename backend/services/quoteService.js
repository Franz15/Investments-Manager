import YahooFinance from 'yahoo-finance2';
import fetch from 'node-fetch';

const yahooFinance = new YahooFinance();

/**
 * Obtiene la cotización en tiempo real de una inversión
 * @param {string} symbol - Símbolo de la inversión (ej: "AAPL", "BTC-USD")
 * @param {string} type - Tipo de inversión: 'stock', 'etf', 'bond', 'crypto', 'fund', 'other'
 * @param {string} currency - Moneda de la inversión
 * @returns {Promise<{price: number, currency: string, change: number, changePercent: number}>}
 */
export async function getQuote(symbol, type, currency = 'EUR', isin = null, name = null) {
  // Para fondos de inversión, intentar primero con ISIN o búsqueda por nombre
  if (type === 'fund' && !symbol && (isin || name)) {
    return await getFundQuote(isin, name, currency);
  }

  if (!symbol && !isin) {
    throw new Error('El símbolo o ISIN es requerido para obtener la cotización');
  }

  try {
    // Para criptomonedas, usar CoinGecko
    if (type === 'crypto') {
      return await getCryptoQuote(symbol, currency);
    }

    // Para acciones, ETFs, bonos, fondos, usar Yahoo Finance
    if (['stock', 'etf', 'bond', 'fund'].includes(type)) {
      return await getYahooQuote(symbol || isin, currency);
    }

    // Para otros tipos, intentar con Yahoo Finance de todas formas
    return await getYahooQuote(symbol || isin, currency);
  } catch (error) {
    console.error(`Error obteniendo cotización para ${symbol || isin}:`, error.message);
    throw new Error(`No se pudo obtener la cotización para ${symbol || isin}: ${error.message}`);
  }
}

/**
 * Obtiene cotización de Yahoo Finance
 */
async function getYahooQuote(symbol, currency) {
  // Si el símbolo ya incluye un sufijo de mercado, intentar solo con ese primero
  if (symbol.includes('.')) {
    try {
      const quote = await yahooFinance.quote(symbol);
      if (quote && quote.regularMarketPrice) {
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
      }
    } catch (error) {
      // Si falla con el sufijo, continuar con búsqueda alternativa
    }
  }

  // Intentar búsqueda por nombre si el símbolo directo no funciona
  // Esto es útil para acciones que pueden tener diferentes formatos
  try {
    const searchResults = await yahooFinance.search(symbol);
    if (searchResults && searchResults.quotes && searchResults.quotes.length > 0) {
      // Buscar el resultado más relevante
      const bestMatch = searchResults.quotes.find(q => 
        q.symbol && (q.symbol.includes(symbol) || q.shortname?.toLowerCase().includes(symbol.toLowerCase()))
      ) || searchResults.quotes[0];
      
      if (bestMatch && bestMatch.symbol) {
        const quote = await yahooFinance.quote(bestMatch.symbol);
        if (quote && quote.regularMarketPrice) {
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
        }
      }
    }
  } catch (searchError) {
    // Continuar con las variantes si la búsqueda falla
  }

  // Lista de variantes a probar para acciones españolas/europeas
  const symbolVariants = [
    symbol, // Intentar primero con el símbolo tal cual
    `${symbol}.MC`, // Madrid (Mercado Continuo)
    `${symbol}.MA`, // Madrid Alternativo
    `${symbol}.BC`, // Barcelona
    `${symbol}.AS`, // Amsterdam
    `${symbol}.L`, // London
    `${symbol}.PA`, // Paris
    `${symbol}.DE`, // Frankfurt
    `${symbol}.XETR`, // XETRA
  ];

  const errors = [];

  for (const variant of symbolVariants) {
    try {
      const quote = await yahooFinance.quote(variant);
      
      if (quote && quote.regularMarketPrice) {
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
      }
    } catch (error) {
      errors.push(`${variant}: ${error.message}`);
      // Continuar con el siguiente variant
      continue;
    }
  }

  // Si ninguna variante funcionó, lanzar error con detalles
  throw new Error(`No se encontró cotización para ${symbol}. La acción puede no estar disponible en Yahoo Finance o requiere actualización manual.`);
}

/**
 * Obtiene cotización de fondos de inversión usando ISIN o búsqueda por nombre
 */
async function getFundQuote(isin, name, currency) {
  // Intentar primero con ISIN si está disponible
  if (isin) {
    try {
      // Yahoo Finance puede buscar por ISIN en algunos casos
      // Formato: ISIN puede funcionar directamente o con prefijos
      const isinVariants = [
        isin,
        `${isin}.F`, // Fondo
        `${isin}.L`, // London
        `${isin}.PA`, // Paris
        `${isin}.DE`, // Frankfurt
      ];

      for (const variant of isinVariants) {
        try {
          const quote = await yahooFinance.quote(variant);
          if (quote && quote.regularMarketPrice) {
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
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      // Continuar con búsqueda por nombre si ISIN falla
    }
  }

  // Si no funciona con ISIN, intentar búsqueda por nombre
  if (name) {
    try {
      const searchResults = await yahooFinance.search(name);
      if (searchResults && searchResults.quotes && searchResults.quotes.length > 0) {
        // Buscar el resultado más relevante (que sea un fondo)
        const fundMatch = searchResults.quotes.find(q => 
          q.quoteType === 'MUTUALFUND' || 
          q.quoteType === 'FUND' ||
          (q.shortname && q.shortname.toLowerCase().includes(name.toLowerCase()))
        ) || searchResults.quotes[0];
        
        if (fundMatch && fundMatch.symbol) {
          const quote = await yahooFinance.quote(fundMatch.symbol);
          if (quote && quote.regularMarketPrice) {
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
          }
        }
      }
    } catch (error) {
      // Búsqueda por nombre falló
    }
  }

  throw new Error(`No se encontró cotización para el fondo. Intenta agregar un ISIN o símbolo específico.`);
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
  
  // Yahoo Finance permite ~33 llamadas/minuto (2,000/hora)
  // Usamos 2 segundos entre llamadas para ser conservadores (30 llamadas/minuto)
  const delayBetweenCalls = 2000; // 2 segundos
  
  // Procesar una por una para respetar el rate limit estrictamente
  for (let i = 0; i < investments.length; i++) {
    const investment = investments[i];
    
    try {
      // Filtrar inversiones sin símbolo o que sean carteras automatizadas
      if (!investment.symbol || investment.isAutomatedPortfolio) {
        results.push({
          investmentId: investment._id?.toString() || investment.id?.toString(),
          symbol: investment.symbol || 'N/A',
          success: false,
          error: investment.isAutomatedPortfolio ? 'Cartera automatizada (actualización manual)' : 'No tiene símbolo definido',
        });
        continue; // No hacer delay para estas
      }

      const quote = await getQuote(
        investment.symbol,
        investment.type,
        investment.currency,
        investment.isin,
        investment.name
      );

      results.push({
        investmentId: investment._id?.toString() || investment.id?.toString(),
        symbol: investment.symbol,
        success: true,
        price: quote.price,
        currency: quote.currency,
        change: quote.change,
        changePercent: quote.changePercent,
      });
    } catch (error) {
      results.push({
        investmentId: investment._id?.toString() || investment.id?.toString(),
        symbol: investment.symbol || 'N/A',
        success: false,
        error: error.message,
      });
    }

    // Esperar entre llamadas para respetar el rate limit (excepto en la última)
    if (i < investments.length - 1) {
      await new Promise(resolve => setTimeout(resolve, delayBetweenCalls));
    }
  }

  return results;
}

