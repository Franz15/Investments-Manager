import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Rate-limit de login: 10 intentos por IP cada 15 min (FEAT-29).
// ponytail: en memoria y por instancia; si algún día hay varias instancias, mover a Redis/express-rate-limit
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // ip → { count, resetAt }

const loginRateLimit = (req, res, next) => {
  const now = Date.now();
  // Purga perezosa para que el Map no crezca sin límite
  if (loginAttempts.size > 1000) {
    for (const [ip, e] of loginAttempts) if (now > e.resetAt) loginAttempts.delete(ip);
  }
  const entry = loginAttempts.get(req.ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(req.ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return next();
  }
  entry.count++;
  if (entry.count > LOGIN_MAX_ATTEMPTS) {
    return res
      .status(429)
      .json({ message: 'Demasiados intentos. Prueba de nuevo en unos minutos.' });
  }
  next();
};

// POST /api/auth/login - Iniciar sesión
router.post('/login', loginRateLimit, async (req, res) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password || typeof userId !== 'string') {
      return res.status(400).json({ message: 'Usuario y contraseña son requeridos' });
    }

    // Buscar usuario con el campo password incluido
    const user = await User.findOne({ id: userId }).select('+password');

    // Respuesta genérica para no revelar si el usuario existe (anti-enumeración)
    if (!user || !user.password) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }

    // Verificar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
    }

    // Actualizar última conexión
    user.lastLogin = new Date();
    await user.save();

    // Generar token JWT
    const token = generateToken(user.id);

    // Devolver usuario (sin password) y token
    const userResponse = user.toObject();
    delete userResponse.password;

    res.json({ user: userResponse, token });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
});

export default router;
