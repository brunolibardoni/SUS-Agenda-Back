import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sql, getPool } from '../config/database.js';
import { generateToken } from '../server.js';

// Helper function to validate GUID format
function isValidGUID(str) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(str);
}

// Sessões em memória (pode ser trocado por Redis ou banco)
export const sessions = new Map();

// Proteção contra brute force: tentativas por email e IP usando SQL Server
const MAX_ATTEMPTS = 5;
const BLOCK_TIME_MINUTES = 5;

export async function login(req, res) {
  const { email, password } = req.body;
  let ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection.remoteAddress || '';
  if (ip === '::1') ip = '127.0.0.1';
  const now = new Date();
  try {
    const pool = await getPool();
    // Verifica se o email está bloqueado
    const blockResult = await pool.request()
      .input('email', sql.NVarChar, email)
      .input('ip', sql.NVarChar, ip)
      .query(`SELECT AttemptCount, BlockedUntil FROM LoginAttempts WHERE Email = @email AND IP = @ip`);
    if (blockResult.recordset.length > 0) {
      const { AttemptCount, BlockedUntil } = blockResult.recordset[0];
      if (BlockedUntil && new Date(BlockedUntil) > now) {
        return res.status(429).json({ error: 'Muitas tentativas. Tente novamente em alguns minutos.' });
      }
    }

    const result = await pool.request()
      .input('email', sql.NVarChar, email)
      .query('SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.Role, u.isDeveloper, ISNULL(c.Name, u.City) AS City, ISNULL(c.Id, u.City) AS CityId, u.CPF, u.Gender, u.Age, u.Phone, u.Address, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate FROM Users u LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id WHERE Email = @email');

    if (result.recordset.length === 0) {
      // Falha: incrementa tentativas
      await updateLoginAttemptsDb(pool, email, ip, now);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    const user = result.recordset[0];
    const passwordMatch = await bcrypt.compare(password, user.PasswordHash);
    if (!passwordMatch) {
      await updateLoginAttemptsDb(pool, email, ip, now);
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }
    // Sucesso: zera tentativas
    await pool.request()
      .input('email', sql.NVarChar, email)
      .input('ip', sql.NVarChar, ip)
      .query('DELETE FROM LoginAttempts WHERE Email = @email AND IP = @ip');

    // Gera ID de sessão seguro
    const sessionId = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionId, { userId: user.Id, createdAt: Date.now() });

    // Seta cookie seguro para sessão
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 // 1 dia
    });

    // Gera e define token JWT
    const jwtToken = generateToken({
      id: user.Id,
      email: user.Email,
      role: user.Role
    });

    res.cookie('jwtToken', jwtToken, {
      httpOnly: false, // Permite acesso pelo frontend
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 horas
    });

    // Calcular Idade e formatar data
    function calcularIdadeBR(dataBR) {
      if (!dataBR) return '-';
      
      let nascimento;
      
      // Verifica se a data está no formato YYYY-MM-DD ou DD/MM/YYYY
      if (dataBR.includes('-')) {
        // Formato YYYY-MM-DD
        const [ano, mes, dia] = dataBR.split('-');
        nascimento = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      } else {
        // Formato DD/MM/YYYY
        const [dia, mes, ano] = dataBR.split('/');
        nascimento = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
      }
      
      const hoje = new Date();
      let idade = hoje.getFullYear() - nascimento.getFullYear();
      const aniversarioPassou =
        hoje.getMonth() > nascimento.getMonth() ||
        (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
      if (!aniversarioPassou) idade--;
      return isNaN(idade) ? '-' : idade;
    }
    
    function formatarDataBR(data) {
      if (!data) return '';
      
      let dateObj;
      
      // Verifica se já é um objeto Date
      if (data instanceof Date) {
        dateObj = data;
      } else if (typeof data === 'string') {
        // Verifica se a data está no formato YYYY-MM-DD
        if (data.includes('-') && data.split('-').length === 3) {
          const [ano, mes, dia] = data.split('-');
          dateObj = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        } else {
          // Assume formato DD/MM/YYYY
          const [dia, mes, ano] = data.split('/');
          dateObj = new Date(parseInt(ano), parseInt(mes) - 1, parseInt(dia));
        }
      } else {
        return '';
      }
      
      // Formatar como DD/MM/YYYY
      const dia = dateObj.getDate().toString().padStart(2, '0');
      const mes = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const ano = dateObj.getFullYear();
      
      return `${dia}/${mes}/${ano}`;
    }
    
    const age = calcularIdadeBR(user.BirthDate);
    const formattedBirthDate = formatarDataBR(user.BirthDate);

    res.json({
      user: {
        id: user.Id,
        name: user.Name,
        email: user.Email,
        role: user.Role,
        isDeveloper: user.isDeveloper,
        city: user.City,
        cityId: user.CityId,
        cpf: user.CPF,
        gender: user.Gender,
        age: age,
        phone: user.Phone,
        address: user.Address,
        birthDate: formattedBirthDate
      },
      token: jwtToken // Inclui o token JWT na resposta
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  }
}


async function updateLoginAttemptsDb(pool, email, ip, now) {
  // Busca registro existente
  const result = await pool.request()
    .input('email', sql.NVarChar, email)
    .input('ip', sql.NVarChar, ip)
    .query('SELECT Id, AttemptCount FROM LoginAttempts WHERE Email = @email AND IP = @ip');
  if (result.recordset.length === 0) {
    // Cria novo registro
    await pool.request()
      .input('email', sql.NVarChar, email)
      .input('ip', sql.NVarChar, ip)
      .input('attemptCount', sql.Int, 1)
      .input('blockedUntil', sql.DateTime2, null)
      .input('lastAttempt', sql.DateTime2, now)
      .query(`INSERT INTO LoginAttempts (Email, IP, AttemptCount, BlockedUntil, LastAttempt)
              VALUES (@email, @ip, @attemptCount, @blockedUntil, @lastAttempt)`);
    return;
  }
  // Atualiza registro
  const { Id, AttemptCount } = result.recordset[0];
  const newCount = AttemptCount + 1;
  let blockedUntil = null;
  if (newCount >= MAX_ATTEMPTS) {
    blockedUntil = new Date(now.getTime() + BLOCK_TIME_MINUTES * 60000);
  }
  await pool.request()
    .input('id', sql.Int, Id)
    .input('attemptCount', sql.Int, newCount)
    .input('blockedUntil', sql.DateTime2, blockedUntil)
    .input('lastAttempt', sql.DateTime2, now)
    .query(`UPDATE LoginAttempts SET AttemptCount = @attemptCount, BlockedUntil = @blockedUntil, LastAttempt = @lastAttempt WHERE Id = @id`);
}


export async function getCurrentUser(req) {
  // First check Passport authentication (for OAuth users)
  if (req.isAuthenticated && req.isAuthenticated()) {
    return req.user;
  }

  // Then check custom session (for regular login users)
  const sessionId = req.cookies?.sessionId;
  if (!sessionId) {
    return null;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  // Get user data from database
  try {
    // Validate session userId before database query
    if (!session.userId || !isValidGUID(session.userId)) {
      return null;
    }

    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, session.userId) // Changed to NVarChar to avoid conversion issues
      .query(`
        SELECT u.Id, u.Name, u.Email, u.CPF, u.Phone, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate,
               u.Age, u.Gender, u.City, u.Address, u.Role, u.isDeveloper, u.AuthProvider,
               ISNULL(c.Name, u.City) AS CityName
        FROM Users u
        LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id
        WHERE u.Id = TRY_CAST(@userId AS uniqueidentifier) -- Use TRY_CAST to safely convert
      `);

    if (result.recordset.length === 0) {
      return null;
    }

    const user = result.recordset[0];

    // Format user data consistently
    return {
      id: user.Id,
      name: user.Name,
      email: user.Email,
      cpf: user.CPF,
      phone: user.Phone,
      birthDate: user.BirthDate,
      age: user.Age,
      gender: user.Gender,
      city: user.CityName || user.City,
      cityId: user.City,
      address: user.Address,
      role: user.Role,
      isDeveloper: user.isDeveloper,
      authProvider: user.AuthProvider || 'local'
    };
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export function logout(req, res) {
  try {
    // Clear traditional session
    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
      sessions.delete(sessionId);
      res.clearCookie('sessionId');
    }

    // Clear JWT token cookie with same options as when set
    res.clearCookie('jwtToken', {
      httpOnly: false,
      secure: true,
      sameSite: 'none',
      path: '/'
    });

    // Clear Passport session and destroy Express session
    req.logout((err) => {
      if (err) {
        console.error('Error during Passport logout:', err);
      }

      // Destroy the Express session completely if it exists
      if (req.session) {
        req.session.destroy((sessionErr) => {
          if (sessionErr) {
            console.error('Error destroying session:', sessionErr);
          }

          // Clear all session-related cookies with proper options
          res.clearCookie('connect.sid', {
            path: '/',
            secure: true,
            sameSite: 'none'
          });
          res.clearCookie('sessionId', {
            path: '/',
            secure: true,
            sameSite: 'none'
          });

          res.json({ message: 'Logout realizado com sucesso.' });
        });
      } else {
        // Clear all session-related cookies with proper options
        res.clearCookie('connect.sid', {
          path: '/',
          secure: true,
          sameSite: 'none'
        });
        res.clearCookie('sessionId', {
          path: '/',
          secure: true,
          sameSite: 'none'
        });

        res.json({ message: 'Logout realizado com sucesso.' });
      }
    });
  } catch (error) {
    console.error('Error during logout:', error);
    res.status(500).json({ error: 'Erro interno do servidor durante logout.' });
  }
}
