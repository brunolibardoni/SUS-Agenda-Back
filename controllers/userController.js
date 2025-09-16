import { sql, getPool } from '../config/database.js';
import bcrypt from 'bcrypt';

const userController = {
  // Cadastro de novo usuário
  async register(req, res) {
    try {
      const {
        name,
        email,
        cpf,
        phone,
        birthDate,
        gender,
        city,
        address,
        password,
        role = 'patient'
      } = req.body;

      // Validação básica
      if (!name || !email || !cpf || !phone || !birthDate || !gender || !city || !address || !password) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
      }

      const pool = await getPool();

      // Verifica se email ou CPF já existem
      const checkResult = await pool.request()
        .input('email', sql.NVarChar, email)
        .input('cpf', sql.NVarChar, cpf)
        .query('SELECT Id FROM Users WHERE Email = @email OR CPF = @cpf');
      if (checkResult.recordset.length > 0) {
        return res.status(409).json({ error: 'Email ou CPF já cadastrado.' });
      }

      // Hash da senha
      const passwordHash = await bcrypt.hash(password, 10);

      // Calcula idade
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
        age--;
      }

      // Insere usuário
      const insertResult = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('email', sql.NVarChar, email)
        .input('cpf', sql.NVarChar, cpf)
        .input('phone', sql.NVarChar, phone)
        .input('birthDate', sql.Date, birthDate)
        .input('age', sql.Int, age)
        .input('gender', sql.NVarChar, gender)
        .input('city', sql.NVarChar, city)
        .input('address', sql.NVarChar, address)
        .input('passwordHash', sql.NVarChar, passwordHash)
        .input('role', sql.NVarChar, role)
        .input('authProvider', sql.NVarChar, 'local')
        .query(`
          INSERT INTO Users (Name, Email, CPF, Phone, BirthDate, Age, Gender, City, Address, PasswordHash, Role, AuthProvider, CreatedAt, UpdatedAt)
          VALUES (@name, @email, @cpf, @phone, @birthDate, @age, @gender, @city, @address, @passwordHash, @role, @authProvider, GETDATE(), GETDATE())
          SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.Role, u.isDeveloper, ISNULL(c.Name, u.City) AS City, u.CPF, u.Gender, u.Age, u.Phone, u.Address, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate FROM Users u LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id WHERE Email = @email
        `);
          
      const user = insertResult.recordset[0];

      // Formatar data para DD/MM/YYYY
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
      
      const formattedBirthDate = formatarDataBR(user.BirthDate);

      res.status(201).json({
        user: {
          id: user.Id,
          name: user.Name,
          email: user.Email,
          role: user.Role,
          isDeveloper: user.isDeveloper,
          city: user.City,
          cpf: user.CPF,
          gender: user.Gender,
          age: user.Age,
          phone: user.Phone,
          address: user.Address,
          birthDate: formattedBirthDate
        }
      });
    } catch (error) {
      console.error('Erro ao cadastrar usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },
  // Atualizar senha do usuário
  async updatePassword(req, res) {
    try {
      const { userId } = req.params;
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Senha atual e nova senha são obrigatórias' });
      }

      const pool = await getPool();
      
      // Buscar usuário atual
      const userResult = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query('SELECT PasswordHash FROM Users WHERE Id = @userId');
      
      if (userResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      
      // Verificar senha atual corretamente
      const user = userResult.recordset[0];
      const isMatch = await bcrypt.compare(currentPassword, user.PasswordHash);
      if (!isMatch) {
        return res.status(400).json({ error: 'Senha atual incorreta' });
      }

      // Gerar novo hash da senha
      const newPasswordHash = await bcrypt.hash(newPassword, 10);
      await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('newPasswordHash', sql.NVarChar, newPasswordHash)
        .query(`
          UPDATE Users 
          SET PasswordHash = @newPasswordHash, UpdatedAt = GETDATE()
          WHERE Id = @userId
        `);

      res.json({ message: 'Senha atualizada com sucesso' });

   
    } catch (error) {
      console.error('Erro ao atualizar senha:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar notificações do usuário
  async getUserNotifications(req, res) {
    try {
      const { userId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT Id, UserId, BookingId, Type, Title, Message, AdminComment, IsRead, CreatedAt
          FROM Notifications 
          WHERE UserId = @userId 
          ORDER BY CreatedAt DESC
        `);
      
      res.json(result.recordset);
    } catch (error) {
      console.error('Erro ao buscar notificações:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Marcar notificação como lida
  async markNotificationAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      
      const pool = await getPool();
      await pool.request()
        .input('notificationId', sql.UniqueIdentifier, notificationId)
        .query(`
          UPDATE Notifications 
          SET IsRead = 1 
          WHERE Id = @notificationId
        `);
      
      res.json({ message: 'Notificação marcada como lida' });
    } catch (error) {
      console.error('Erro ao marcar notificação:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Marcar todas as notificações como lidas
  async markAllNotificationsAsRead(req, res) {
    try {
      const { userId } = req.params;
      
      const pool = await getPool();
      await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          UPDATE Notifications 
          SET IsRead = 1 
          WHERE UserId = @userId AND IsRead = 0
        `);
      
      res.json({ message: 'Todas as notificações marcadas como lidas' });
    } catch (error) {
      console.error('Erro ao marcar notificações:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Completar perfil do usuário (para usuários do Google OAuth)
  async completeProfile(req, res) {
    try {
      console.log('🎯 completeProfile called');
      console.log('📋 Request body:', req.body);
      console.log('👤 User from req.user:', req.user);

      const userId = req.user.id; // From Passport.js authenticated user
      console.log('🆔 User ID:', userId);
      const {
        cpf,
        phone,
        birthDate,
        gender,
        city,
        address
      } = req.body;

      // Validação básica
      if (!cpf || !phone || !birthDate || !gender || !city || !address) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
      }

      // Validação adicional - garantir que não são valores temporários
      if (cpf === 'TEMP_CPF' || phone === 'TEMP_PHONE' || city === 'TEMP_CITY' || address === 'TEMP_ADDRESS') {
        return res.status(400).json({ error: 'Por favor, preencha todos os campos com informações válidas.' });
      }

      // Validação de formato CPF
      const cpfRegex = /^\d{3}\.\d{3}\.\d{3}-\d{2}$/;
      if (!cpfRegex.test(cpf)) {
        return res.status(400).json({ error: 'CPF deve estar no formato XXX.XXX.XXX-XX.' });
      }

      // Validação de formato telefone
      const phoneRegex = /^\(\d{2}\)\s\d{4,5}-\d{4}$/;
      if (!phoneRegex.test(phone)) {
        return res.status(400).json({ error: 'Telefone deve estar no formato (XX) XXXXX-XXXX.' });
      }

      const pool = await getPool();
      console.log('🔗 Database connection established');

      // Verifica se CPF já existe para outro usuário
      console.log('🔍 Checking if CPF exists for another user...');
      const cpfCheck = await pool.request()
        .input('cpf', sql.NVarChar, cpf)
        .input('userId', sql.UniqueIdentifier, userId)
        .query('SELECT Id FROM Users WHERE CPF = @cpf AND Id != @userId');
      
      if (cpfCheck.recordset.length > 0) {
        console.log('❌ CPF already exists for another user');
        return res.status(409).json({ error: 'CPF já cadastrado por outro usuário.' });
      }
      console.log('✅ CPF check passed');

      // Calcula idade
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) {
        age--;
      }

      // Atualiza perfil do usuário
      console.log('📝 Updating user profile...');
      await pool.request()
        .input('userId', sql.NVarChar, userId)
        .input('cpf', sql.NVarChar, cpf)
        .input('phone', sql.NVarChar, phone)
        .input('birthDate', sql.Date, birthDate)
        .input('age', sql.Int, age)
        .input('gender', sql.NVarChar, gender)
        .input('city', sql.NVarChar, city)
        .input('address', sql.NVarChar, address)
        .query(`
          UPDATE Users 
          SET CPF = @cpf, Phone = @phone, BirthDate = @birthDate, Age = @age, 
              Gender = @gender, City = @city, Address = @address, 
              NeedsProfileCompletion = 0, UpdatedAt = GETDATE()
          WHERE Id = TRY_CAST(@userId AS uniqueidentifier)
        `);
      console.log('✅ Profile updated successfully');

      // Busca usuário atualizado
      console.log('🔍 Fetching updated user data...');
      const updatedUser = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT u.Id, u.Name, u.Email, u.CPF, u.Phone, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate, 
                 u.Age, u.Gender, u.City, u.Address, u.Role, u.isDeveloper, u.NeedsProfileCompletion,
                 ISNULL(c.Name, u.City) AS CityName
          FROM Users u 
          LEFT JOIN Cities c ON TRY_CAST(u.City AS uniqueidentifier) = c.Id 
          WHERE u.Id = TRY_CAST(@userId AS uniqueidentifier)
        `);

      const user = updatedUser.recordset[0];
      console.log('✅ Updated user fetched:', user.Id, 'NeedsProfileCompletion:', user.NeedsProfileCompletion);
      
      // Formatar data para DD/MM/YYYY
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
      
      // Recalcular idade com a data atualizada
      const currentBirthDate = new Date(birthDate);
      const currentDate = new Date();
      let currentAge = currentDate.getFullYear() - currentBirthDate.getFullYear();
      if (currentDate.getMonth() < currentBirthDate.getMonth() || 
          (currentDate.getMonth() === currentBirthDate.getMonth() && currentDate.getDate() < currentBirthDate.getDate())) {
        currentAge--;
      }
      
      const formattedBirthDate = formatarDataBR(birthDate); // Usar a data original do input
      
      console.log('📤 Sending response...');
      res.json({
        user: {
          id: user.Id,
          name: user.Name,
          email: user.Email,
          cpf: user.CPF,
          phone: user.Phone,
          birthDate: formattedBirthDate,
          age: currentAge, // Usar idade recalculada
          gender: user.Gender,
          city: user.CityName || user.City, // Usar nome da cidade, fallback para ID
          cityId: user.City, // Incluir ID da cidade também
          address: user.Address,
          role: user.Role,
          isDeveloper: user.isDeveloper,
          needsProfileCompletion: user.NeedsProfileCompletion === 1 // Converter BIT para boolean
        }
      });
      console.log('✅ Response sent successfully');
    } catch (error) {
      console.error('Erro ao completar perfil:', error);
      res.status(500).json({ error: 'Erro interno do servidor.' });
    }
  },

  // Deletar notificação
  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('notificationId', sql.UniqueIdentifier, notificationId)
        .query('DELETE FROM Notifications WHERE Id = @notificationId');
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Notificação não encontrada' });
      }
      
      res.json({ message: 'Notificação deletada com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar notificação:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default userController;
