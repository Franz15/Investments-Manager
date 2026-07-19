import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import accountRoutes from './routes/accountRoutes.js';
import subAccountRoutes from './routes/subAccountRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import investmentRoutes from './routes/investmentRoutes.js';
import investmentHistoryRoutes from './routes/investmentHistoryRoutes.js';
import debtRoutes from './routes/debtRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import userRoutes from './routes/userRoutes.js';
import authRoutes from './routes/authRoutes.js';
import portfolioFundRoutes from './routes/portfolioFundRoutes.js';
import portfolioBuilderRoutes from './routes/portfolioBuilderRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import forecastRoutes from './routes/forecastRoutes.js';
import businessRoutes from './routes/businessRoutes.js';
import recurringTransactionRoutes from './routes/recurringTransactionRoutes.js';
import manualAssetRoutes from './routes/manualAssetRoutes.js';
import bankConnectionRoutes from './routes/bankConnectionRoutes.js';
import { startScheduler } from './scheduler/recurringScheduler.js';
import { authenticateToken } from './middleware/authMiddleware.js';

dotenv.config();
// .env.local overrides .env — used for local dev (e.g. bypass mongodb+srv DNS)
dotenv.config({ path: '.env.local', override: true });

// Fail-fast: sin secreto JWT no se puede firmar/verificar de forma segura
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET no está definido. Configúralo en el entorno.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;

// Detrás del proxy de Railway: sin esto req.ip sería la IP del proxy para todos
// (rompería el rate-limit por IP y los headers PSU de Enable Banking)
app.set('trust proxy', 1);

// Middleware CORS
const allowedOrigins = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((url) => url.trim())
  : true; // En desarrollo permite todos los orígenes

app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir requests sin origin (Postman, curl, etc.)
      if (!origin) return callback(null, true);

      // Si FRONTEND_URL es "*" o true, permitir todos
      if (allowedOrigins === true || allowedOrigins.includes('*')) {
        return callback(null, true);
      }

      // Si el origin está en la lista permitida
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Por defecto, permitir en desarrollo
      if (process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }

      // En producción, rechazar si no está en la lista
      callback(new Error('No permitido por CORS'));
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Recibos y facturas: privados, solo con token (FEAT-28).
// sendFile con `root` resuelve la ruta y bloquea path traversal (../).
app.get('/uploads/*', authenticateToken, (req, res) => {
  let relative;
  try {
    relative = decodeURIComponent(req.path.replace(/^\/uploads\//, ''));
  } catch {
    return res.status(400).json({ message: 'Ruta inválida' });
  }
  res.sendFile(relative, { root: path.join(__dirname, 'uploads') }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ message: 'Archivo no encontrado' });
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/subaccounts', subAccountRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/investments', investmentRoutes);
app.use('/api/investment-history', investmentHistoryRoutes);
app.use('/api/debts', debtRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/portfolio-funds', portfolioFundRoutes);
app.use('/api/portfolio-builder', portfolioBuilderRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/forecasts', forecastRoutes);
app.use('/api/businesses', businessRoutes);
app.use('/api/recurring-transactions', recurringTransactionRoutes);
app.use('/api/manual-assets', manualAssetRoutes);
app.use('/api/bank-connections', bankConnectionRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Investments Manager API',
    version: '0.3',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      accounts: '/api/accounts',
      investments: '/api/investments',
      dashboard: '/api/dashboard',
    },
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/investments-manager';

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    const dbName = mongoose.connection.db?.databaseName || 'unknown';
    console.log('MongoDB conectado correctamente');
    console.log(`Base de datos: ${dbName}`);
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      startScheduler();
    });
  })
  .catch((error) => {
    console.error('Error conectando a MongoDB:', error);
    process.exit(1);
  });

export default app;
