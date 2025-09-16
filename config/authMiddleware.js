import jwt from 'jsonwebtoken';

/**
 * Middleware de autenticação que aceita tanto sessões Passport quanto JWT tokens
 * Usado para endpoints que precisam de autenticação mas podem receber tokens de diferentes formas
 */
export const authenticateUser = (req, res, next) => {

  // Check Passport session authentication
  if (req.isAuthenticated()) {
    return next();
  }

  // Check JWT token authentication
  if (req.jwtToken) {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

    try {
      const decoded = jwt.verify(req.jwtToken, JWT_SECRET);

      // Set user from JWT token
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role
      };

      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Token JWT inválido' });
    }
  }

  res.status(401).json({ error: 'Não autenticado' });
};