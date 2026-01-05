import express from 'express';
import User from '../models/User.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';

const router = express.Router();

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET obtener información del usuario actual
router.get('/me', async (req, res) => {
  try {
    const user = await User.findOne({ id: req.userId });
    
    if (!user) {
      // Si no existe, crear usuario por defecto
      const defaultUser = new User({
        id: req.userId,
        name: req.userId.charAt(0).toUpperCase() + req.userId.slice(1),
        avatar: '👤',
        color: '#3b82f6',
      });
      await defaultUser.save();
      return res.json(defaultUser);
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// PATCH actualizar color del usuario
router.patch('/me/color', async (req, res) => {
  try {
    const { color } = req.body;
    
    if (!color || !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      return res.status(400).json({ message: 'Color inválido. Debe ser un código hexadecimal válido (ej: #3b82f6)' });
    }
    
    const user = await User.findOneAndUpdate(
      { id: req.userId },
      { color },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
