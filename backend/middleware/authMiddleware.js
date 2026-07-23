import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// El secreto se lee de forma diferida (en tiempo de request), no en el
// top-level: los imports de rutas se ejecutan antes de dotenv.config() en
// server.js, por lo que leerlo aquí arriba daría siempre undefined.
const getSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET no está definido en las variables de entorno');
  }
  return secret;
};

// Middleware para verificar el token JWT
export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  jwt.verify(token, getSecret(), { algorithms: ['HS256'] }, async (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado' });
    }

    req.userId = decoded.userId;

    // Impersonación (MCP/admin): actuar como otro perfil. Solo con role=admin;
    // el lookup a BD ocurre únicamente cuando llega la cabecera.
    const actAs = req.headers['x-act-as-user'];
    if (actAs && actAs !== decoded.userId) {
      try {
        const me = await User.findOne({ id: decoded.userId }).select('role');
        if (me?.role !== 'admin') {
          return res.status(403).json({ message: 'Solo un admin puede actuar como otro usuario' });
        }
        req.userId = actAs;
      } catch {
        return res.status(500).json({ message: 'Error al verificar permisos' });
      }
    }

    next();
  });
};

// Función para generar token JWT
export const generateToken = (userId) => {
  return jwt.sign({ userId }, getSecret(), { expiresIn: '7d' });
};
