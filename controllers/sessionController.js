import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { sql, getPool } from '../config/database.js';

// Sessões em memória (pode ser trocado por Redis ou banco)
const sessions = new Map();

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
      .query('SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.Role, u.isDeveloper, c.Name AS City, c.Id AS CityId, u.CPF, u.Gender, u.Age, u.Phone, u.Address, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate FROM Users u INNER JOIN Cities c ON u.City = c.Id WHERE Email = @email');

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
    // Seta cookie seguro
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24 // 1 dia
    });

    // Calcular Idade
    function calcularIdadeBR(dataBR) {
      if (!dataBR) return '-';
      const [dia, mes, ano] = dataBR.split('/');
      const nascimento = new Date(ano, mes - 1, dia);
      const hoje = new Date();
      let idade = hoje.getFullYear() - nascimento.getFullYear();
      const aniversarioPassou =
        hoje.getMonth() > nascimento.getMonth() ||
        (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() >= nascimento.getDate());
      if (!aniversarioPassou) idade--;
      return isNaN(idade) ? '-' : idade;
    }
    const age = calcularIdadeBR(user.BirthDate);

    res.json({ user: { id: user.Id, name: user.Name, email: user.Email, 
      role: user.Role, isDeveloper: user.isDeveloper, city: user.City, 
      cityId: user.CityId, cpf: user.CPF, gender: user.Gender, age: age, phone: user.Phone, 
      address: user.Address, birthDate: user.BirthDate 
    } });
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


export function sessionMiddleware(req, res, next) {
  const sessionId = req.cookies.sessionId;
  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
  }
  req.userId = sessions.get(sessionId).userId;
  next();
}

export function logout(req, res) {
  const sessionId = req.cookies.sessionId;
  if (sessionId) {
    sessions.delete(sessionId);
    res.clearCookie('sessionId');
  }
  res.json({ message: 'Logout realizado com sucesso.' });
}
