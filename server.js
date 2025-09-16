import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from './config/passport.js';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';

dotenv.config();
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT || 3002;

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Function to generate JWT token
export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Function to verify JWT token
export function verifyToken(token) {
  try {
    if (!token) {
      return null;
    }

    if (typeof token !== 'string') {
      return null;
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    return decoded;
  } catch (error) {
    console.error('Erro ao verificar token JWT:', error);
    return null;
  }
}

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['https://nice-moss-0eff7d51e.1.azurestaticapps.net'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
// CORS middleware para permitir cookies cross-site
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://nice-moss-0eff7d51e.1.azurestaticapps.net'); // Troque pelo domínio do frontend
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
  } else {
    next();
  }
});
app.use(cookieParser()); // Parse cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set('trust proxy', 1);

// JWT Middleware - Extract token from Authorization header or cookies
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const tokenFromCookie = req.cookies?.jwtToken;

  // Priority: Authorization header > Cookie (header is more reliable for mobile/incognito)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    req.jwtToken = authHeader.substring(7);
  } else if (tokenFromCookie) {
    req.jwtToken = tokenFromCookie;
  } else {
    console.log('❌ No JWT token found in request');
  }

  next();
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true, // Always HTTPS in production
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none' // Required for cross-site requests
  }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'SUS Agenda API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Erro não tratado:', err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📊 Health check: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}/health`);
  console.log(`🔗 API Base URL: ${process.env.API_BASE_URL || `http://localhost:${PORT}`}`);
});

export default app;
