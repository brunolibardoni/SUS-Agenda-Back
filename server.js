import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from './config/passport.js';
import session from 'express-session';
import cookieParser from 'cookie-parser';
dotenv.config();
import apiRoutes from './routes/api.js';

const app = express();
const PORT = process.env.PORT|| 3002;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:5173', 'http://localhost:3000', 'https://nice-moss-0eff7d51e.1.azurestaticapps.net'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(cookieParser()); // Parse cookies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS em produção
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
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
