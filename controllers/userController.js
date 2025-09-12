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
        .query(`
          INSERT INTO Users (Name, Email, CPF, Phone, BirthDate, Age, Gender, City, Address, PasswordHash, Role, CreatedAt, UpdatedAt)
          VALUES (@name, @email, @cpf, @phone, @birthDate, @age, @gender, @city, @address, @passwordHash, @role, GETDATE(), GETDATE())
          SELECT u.Id, u.Name, u.Email, u.PasswordHash, u.Role, u.isDeveloper, c.Name AS City, u.CPF, u.Gender, u.Age, u.Phone, u.Address, CONVERT(varchar(10),u.BirthDate, 103) AS BirthDate FROM Users u INNER JOIN Cities c ON u.City = c.Id WHERE Email = @email
        `);
          
      const user = insertResult.recordset[0];

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
          birthDate: user.BirthDate
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
