import { getCurrentUser } from '../controllers/sessionController.js';
import { generateToken, verifyToken } from '../server.js';
import { sql, getPool } from '../config/database.js';

// Get current user session or JWT token
export const getCurrentUserAuth = async (req, res) => {
  try {
    // First try to get user from session (existing method)
    let user = await getCurrentUser(req);

    // If no session user, try JWT token
    if (!user && req.jwtToken) {
      const decoded = verifyToken(req.jwtToken);
      if (decoded) {
        // Fetch complete user data from database
        const pool = await getPool();
        const result = await pool.request()
          .input('userId', sql.UniqueIdentifier, decoded.id)
          .query(`
            SELECT
              u.Id,
              u.Name,
              u.Email,
              u.CPF,
              u.Phone,
              CONVERT(varchar(10), u.BirthDate, 103) AS BirthDate,
              u.Age,
              u.Gender,
              ISNULL(c.Name, u.City) AS City,
              ISNULL(c.Id, u.City) AS CityId,
              u.Address,
              u.Role,
              u.AuthProvider,
              u.isDeveloper
            FROM Users u
            LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id
            WHERE u.Id = @userId
          `);

        if (result.recordset.length > 0) {
          user = result.recordset[0];
        } 
      } 
    }

    if (user) {
      res.json({ user });
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Refresh JWT token
export const refreshToken = async (req, res) => {
  try {
    // Get token from body, header, or cookie
    const token = req.body.token || req.jwtToken;

    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Generate new token with fresh expiration
    const newToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      role: decoded.role
    });

    // Set new token in cookie
    res.cookie('jwtToken', newToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    });

    res.json({ token: newToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};