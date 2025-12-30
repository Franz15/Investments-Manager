// Middleware para extraer el userId de los headers
export const getUserFromRequest = (req, res, next) => {
  // Obtener userId de header, query o body
  const userId = req.headers['x-user-id'] || req.query.userId || req.body.userId;
  
  if (!userId) {
    return res.status(400).json({ message: 'UserId es requerido' });
  }
  
  req.userId = userId;
  next();
};

