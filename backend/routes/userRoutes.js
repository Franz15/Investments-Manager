import express from 'express';
import User from '../models/User.js';
import { getUserFromRequest } from '../middleware/userMiddleware.js';

const router = express.Router();

// Aplicar middleware a todas las rutas
router.use(getUserFromRequest);

// GET obtener información del usuario actual
router.get('/me', async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    // Verificar que MongoDB esté conectado
    const mongoose = (await import('mongoose')).default;
    if (mongoose.connection.readyState !== 1) {
      console.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
      return res.status(503).json({ message: 'Database not available' });
    }

    // Generar nombre más robusto
    const name = req.userId.includes('-') 
      ? req.userId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : req.userId.charAt(0).toUpperCase() + req.userId.slice(1);

    // Usar findOneAndUpdate con upsert para crear o obtener el usuario
    let user;
    try {
      user = await User.findOneAndUpdate(
        { id: req.userId },
        {
          $setOnInsert: {
            id: req.userId,
            name: name,
            avatar: '👤',
            color: '#3b82f6',
          }
        },
        {
          new: true,
          upsert: true,
          setDefaultsOnInsert: true,
          runValidators: false // Desactivar validadores para evitar problemas con campos opcionales
        }
      );
    } catch (dbError) {
      console.error('Error en findOneAndUpdate:', dbError);
      // Si falla, intentar solo buscar
      user = await User.findOne({ id: req.userId });
      if (!user) {
        // Si no existe, crear uno nuevo sin validadores
        user = new User({
          id: req.userId,
          name: name,
          avatar: '👤',
          color: '#3b82f6',
        });
        await user.save();
      }
    }
    
    res.json(user);
  } catch (error) {
    console.error('Error in /users/me:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    if (error.stack) {
      console.error('Error stack:', error.stack);
    }
    res.status(500).json({ 
      message: error.message || 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
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
