import User from '../models/User.js';

// Middleware: solo administradores (Javier u otros con role=admin)
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const user = await User.findOne({ id: req.userId });
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    // Asegurar que Javier siempre tenga rol admin
    if (user.id === 'javier' && user.role !== 'admin') {
      user.role = 'admin';
      await user.save();
    }

    if (user.role === 'admin' || user.id === 'javier') {
      return next();
    }

    return res.status(403).json({ message: 'No tienes permisos de administrador' });
  } catch (error) {
    console.error('Error en requireAdmin:', error);
    return res.status(500).json({ message: 'Error al verificar permisos' });
  }
};
