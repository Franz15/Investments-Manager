import jwt from 'jsonwebtoken';

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

  jwt.verify(token, getSecret(), { algorithms: ['HS256'] }, (err, decoded) => {
    if (err) {
      return res.status(403).json({ message: 'Token inválido o expirado' });
    }

    req.userId = decoded.userId;
    next();
  });
};

// Función para generar token JWT
export const generateToken = (userId) => {
  return jwt.sign({ userId }, getSecret(), { expiresIn: '7d' });
};
