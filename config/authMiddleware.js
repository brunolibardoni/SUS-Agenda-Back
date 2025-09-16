import jwt from 'jsonwebtoken';

/**
 * Middleware de autenticação que aceita tanto sessões Passport quanto JWT tokens
 * Usado para endpoints que precisam de autenticação mas podem receber tokens de diferentes formas
 */
export const authenticateUser = (req, res, next) => {
  console.log('🔐 Checking authentication...');
  console.log('📋 isAuthenticated:', req.isAuthenticated());
  console.log('👤 req.user:', req.user);
  console.log('🔑 req.jwtToken:', req.jwtToken ? 'Present' : 'Not present');

  // Check Passport session authentication
  if (req.isAuthenticated()) {
    console.log('✅ Authentication passed via Passport session');
    return next();
  }

  // Check JWT token authentication
  if (req.jwtToken) {
    const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';

    try {
      const decoded = jwt.verify(req.jwtToken, JWT_SECRET);
      console.log('✅ JWT token verified:', decoded.id);

      // Set user from JWT token
      req.user = {
        id: decoded.id,
        email: decoded.email,
        role: decoded.role
      };

      console.log('✅ Authentication passed via JWT token');
      return next();
    } catch (error) {
      console.log('❌ JWT token verification failed:', error.message);
      return res.status(401).json({ error: 'Token JWT inválido' });
    }
  }

  console.log('❌ Authentication failed - no valid session or JWT token');
  res.status(401).json({ error: 'Não autenticado' });
};