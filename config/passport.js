import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { sql, getPool } from './database.js';
import bcrypt from 'bcrypt';

// Function to check if user profile is complete
async function checkProfileComplete(userId) {
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query(`
        SELECT CPF, Phone, Gender, BirthDate, City, Address
        FROM Users
        WHERE Id = @userId
      `);

    if (result.recordset.length === 0) return false;

    const user = result.recordset[0];
    // Check if all required fields are filled and not temporary values
    return !!(user.CPF && user.CPF !== 'TEMP_CPF' &&
              user.Phone && user.Phone !== 'TEMP_PHONE' &&
              user.Gender &&
              user.BirthDate && user.BirthDate.toISOString().split('T')[0] !== '1900-01-01' &&
              user.City && user.City !== 'TEMP_CITY' &&
              user.Address && user.Address !== 'TEMP_ADDRESS');
  } catch (error) {
    console.error('Error checking profile completion:', error);
    return false; 
  }
}

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3002/auth/google/callback'
},
async (accessToken, refreshToken, profile, done) => {
  try {
    const pool = await getPool();

    // Check if user exists
    const existingUser = await pool.request()
      .input('email', sql.NVarChar, profile.emails[0].value)
      .query(`
        SELECT u.Id, u.Name, u.Email, u.CPF, u.Phone, CONVERT(varchar(10), u.BirthDate, 103) AS BirthDate, 
               u.Age, u.Gender, u.City, u.Address, u.Role, u.isDeveloper, u.AuthProvider, 
               ISNULL(c.Name, u.City) AS CityName
        FROM Users u 
        LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id 
        WHERE u.Email = @email
      `);

    if (existingUser.recordset.length > 0) {
      // User exists, check if it's a Google OAuth user and profile is complete
      const user = existingUser.recordset[0];
      
      // Only show modal for Google OAuth users with incomplete profile
      const needsModal = user.AuthProvider === 'google' && !(await checkProfileComplete(user.Id));
      
      return done(null, {
        id: user.Id,
        name: user.Name,
        email: user.Email,
        cpf: user.CPF,
        phone: user.Phone,
        birthDate: user.BirthDate,
        age: user.Age,
        gender: user.Gender,
        city: user.CityName, // Use cityName for consistency with normal login
        cityId: user.City,   // Add cityId for consistency
        address: user.Address,
        role: user.Role,
        isDeveloper: user.isDeveloper,
        needsProfileCompletion: needsModal
      });
    } else {
      // Create new user with temporary values that will be replaced by modal
      const name = profile.displayName;
      const email = profile.emails[0].value;
      const defaultPassword = await bcrypt.hash('GoogleAuth123!', 10); // Default password

      // Insert new user with temporary values for required fields
      // These will be immediately replaced by the profile completion modal
      const insertResult = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('email', sql.NVarChar, email)
        .input('cpf', sql.NVarChar, 'TEMP_CPF') // Temporary CPF - will be replaced
        .input('phone', sql.NVarChar, 'TEMP_PHONE') // Temporary phone - will be replaced
        .input('birthDate', sql.Date, new Date('1900-01-01')) // Temporary birth date - will be replaced
        .input('age', sql.Int, 0) // Temporary age - will be replaced
        .input('gender', sql.NVarChar, 'outro') // Default gender - can stay or be changed
        .input('city', sql.NVarChar, 'TEMP_CITY') // Temporary city - will be replaced
        .input('address', sql.NVarChar, 'TEMP_ADDRESS') // Temporary address - will be replaced
        .input('passwordHash', sql.NVarChar, defaultPassword)
        .input('role', sql.NVarChar, 'patient')
        .input('authProvider', sql.NVarChar, 'google')
        .query(`
          INSERT INTO Users (Name, Email, CPF, Phone, BirthDate, Age, Gender, City, Address, PasswordHash, Role, AuthProvider, CreatedAt, UpdatedAt)
          VALUES (@name, @email, @cpf, @phone, @birthDate, @age, @gender, @city, @address, @passwordHash, @role, @authProvider, GETDATE(), GETDATE())
          SELECT u.Id, u.Name, u.Email, u.CPF, u.Phone, CONVERT(varchar(10), u.BirthDate, 103) AS BirthDate, 
                 u.Age, u.Gender, u.City, u.Address, u.Role, u.isDeveloper
          FROM Users u 
          WHERE u.Email = @email
        `);

      const newUser = insertResult.recordset[0];
      return done(null, {
        id: newUser.Id,
        name: newUser.Name,
        email: newUser.Email,
        cpf: newUser.CPF,
        phone: newUser.Phone,
        birthDate: newUser.BirthDate,
        age: newUser.Age,
        gender: newUser.Gender,
        city: 'Cidade não informada', // Temporary city name for new users
        cityId: newUser.City,         // This will be TEMP_CITY initially
        address: newUser.Address,
        role: newUser.Role,
        isDeveloper: newUser.isDeveloper,
        needsProfileCompletion: true // Always true for new Google users
      });
    }
  } catch (error) {
    console.error('Error in Google OAuth strategy:', error);
    return done(error, null);
  }
}));

// Serialize user for session
passport.serializeUser((user, done) => {
  try {
    // Store only user ID in session - we'll fetch fresh data on deserialize
    const sessionUser = {
      id: user.id
    };
    done(null, sessionUser);
  } catch (error) {
    console.error('Error serializing user:', error);
    done(error, null);
  }
});

// Deserialize user from session
passport.deserializeUser(async (sessionUser, done) => {
  try {

    // Fetch fresh user data from database
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.UniqueIdentifier, sessionUser.id)
      .query(`
        SELECT u.Id, u.Name, u.Email, u.CPF, u.Phone, CONVERT(varchar(10), u.BirthDate, 103) AS BirthDate, 
               u.Age, u.Gender, u.City, u.Address, u.Role, u.isDeveloper, u.AuthProvider,
               ISNULL(c.Name, u.City) AS CityName
        FROM Users u 
        LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id 
        WHERE u.Id = @userId
      `);

    if (result.recordset.length === 0) {
      return done(null, null);
    }

    const freshUser = result.recordset[0];
    
    // Check if profile is complete
    const needsModal = freshUser.AuthProvider === 'google' && !(await checkProfileComplete(freshUser.Id));
    
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
    
    const age = calcularIdadeBR(freshUser.BirthDate);
    const formattedBirthDate = formatarDataBR(freshUser.BirthDate);

    // Return fresh user data with updated profile completion status
    const updatedUser = {
      id: freshUser.Id,
      name: freshUser.Name,
      email: freshUser.Email,
      cpf: freshUser.CPF,
      phone: freshUser.Phone,
      birthDate: formattedBirthDate,
      age: age,
      gender: freshUser.Gender,
      city: freshUser.CityName,
      cityId: freshUser.City,
      address: freshUser.Address,
      role: freshUser.Role,
      isDeveloper: freshUser.isDeveloper,
      authProvider: freshUser.AuthProvider,
      needsProfileCompletion: needsModal
    };

    
    done(null, updatedUser);
  } catch (error) {
    console.error('❌ Erro ao desserializar usuário:', error);
    done(error, null);
  }
});

export default passport;
