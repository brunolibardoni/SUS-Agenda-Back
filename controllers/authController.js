import { getCurrentUser } from '../controllers/sessionController.js';
import { generateToken, verifyToken } from '../server.js';
import { sql, getPool } from '../config/database.js';

// Helper function to validate GUID format
function isValidGUID(str) {
  const guidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return guidRegex.test(str);
}

// Get current user session or JWT token
export const getCurrentUserAuth = async (req, res) => {
  try {
    console.log('🔍 /auth/me Debug:');
    console.log('  - JWT Token in req:', req.jwtToken ? 'Present' : 'Not present');
    console.log('  - Authorization header:', req.headers.authorization ? 'Present' : 'Not present');
    console.log('  - Cookies:', Object.keys(req.cookies || {}));
    console.log('  - Session:', req.session ? 'Present' : 'Not present');

    // First try to get user from session (existing method)
    let user = await getCurrentUser(req);

    // If no session user, try JWT token from cookie
    if (!user && req.jwtToken) {
      console.log('🔍 Trying JWT token from cookie...');
      const decoded = verifyToken(req.jwtToken);
      if (decoded) {
        console.log('✅ JWT token from cookie decoded successfully:', decoded.id);

        // Validate userId before database query
        if (!decoded.id || !isValidGUID(decoded.id)) {
          console.log('❌ Invalid userId from JWT cookie:', decoded.id);
          return res.status(401).json({ error: 'Token inválido ou ausente' });
        }

        // Fetch complete user data from database
        const pool = await getPool();
        const result = await pool.request()
          .input('userId', sql.NVarChar, decoded.id) // Changed to NVarChar to avoid conversion issues
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
              u.isDeveloper,
              u.NeedsProfileCompletion
            FROM Users u
            LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id
            WHERE u.Id = TRY_CAST(@userId AS uniqueidentifier) -- Use TRY_CAST to safely convert
          `);

        if (result.recordset.length > 0) {
          user = result.recordset[0];
          console.log('✅ User found from JWT cookie:', user.Id);
          console.log('🎯 Raw NeedsProfileCompletion from DB:', user.NeedsProfileCompletion, typeof user.NeedsProfileCompletion);
        } else {
          console.log('❌ User not found in database for JWT cookie - userId:', decoded.id);
        }
      } else {
        console.log('❌ JWT token from cookie is invalid');
      }
    }

    // If no user from session or cookie, try Authorization header
    if (!user && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      console.log('🔍 Trying JWT token from Authorization header...');
      const token = req.headers.authorization.substring(7);
      const decoded = verifyToken(token);
      if (decoded) {
        console.log('✅ JWT token from header decoded successfully:', decoded.id);

        // Validate userId before database query
        if (!decoded.id || !isValidGUID(decoded.id)) {
          console.log('❌ Invalid userId from JWT header:', decoded.id);
          return res.status(401).json({ error: 'Token inválido ou ausente' });
        }

        // Fetch complete user data from database
        const pool = await getPool();
        const result = await pool.request()
          .input('userId', sql.NVarChar, decoded.id) // Changed to NVarChar to avoid conversion issues
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
              u.isDeveloper,
              u.NeedsProfileCompletion
            FROM Users u
            LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id
            WHERE u.Id = TRY_CAST(@userId AS uniqueidentifier) -- Use TRY_CAST to safely convert
          `);

        if (result.recordset.length > 0) {
          user = result.recordset[0];
          console.log('✅ User found from JWT header:', user.Id);
          console.log('🎯 Raw NeedsProfileCompletion from DB:', user.NeedsProfileCompletion, typeof user.NeedsProfileCompletion);
        } else {
          console.log('❌ User not found in database for JWT header - userId:', decoded.id);
        }
      } else {
        console.log('❌ JWT token from header is invalid');
      }
    }

    if (user) {
      console.log('✅ Authentication successful for user:', user.Id);
      console.log('🎯 NeedsProfileCompletion from DB:', user.NeedsProfileCompletion);
      
      // Ensure NeedsProfileCompletion is a boolean
      user.needsProfileCompletion = Boolean(user.NeedsProfileCompletion);
      console.log('🎯 Converted needsProfileCompletion:', user.needsProfileCompletion, typeof user.needsProfileCompletion);
      
      console.log('🎯 Full user object being returned:', user);
      res.json({ user });
    } else {
      console.log('❌ No user found - authentication failed');
      res.status(401).json({ error: 'Not authenticated' });
    }
  } catch (error) {
    console.error('❌ Error in getCurrentUserAuth:', error);
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
      secure: true, // Always HTTPS in production
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'none' // Required for cross-site requests
    });

    res.json({ token: newToken });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};