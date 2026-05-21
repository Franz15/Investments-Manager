import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
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

dotenv.config();
// .env.local overrides .env — used for local dev (e.g. bypass mongodb+srv DNS)
dotenv.config({ path: '.env.local', override: true });

const app = express();
const PORT = process.env.PORT || 5000;

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
    exposedHeaders: ['x-user-id'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id'],
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Investments Manager API',
    version: '0.0.3',
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
    console.log(`MongoDB URI: ${MONGODB_URI.substring(0, 60)}...`);
    app.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('Error conectando a MongoDB:', error);
    process.exit(1);
  });

export default app;
