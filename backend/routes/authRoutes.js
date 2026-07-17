import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { generateToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// POST /api/auth/login - Iniciar sesión
router.post('/login', async (req, res) => {
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
