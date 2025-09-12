import { sql, getPool } from '../config/database.js';

const notificationController = {
  // Cria uma nova notificação
  async createNotification(req, res) {
    try {
      const { userId, title, message, type = 'info', isRead = 0 } = req.body;
      if (!userId || !title || !message) {
        return res.status(400).json({ error: 'userId, title e message são obrigatórios.' });
      }
      const pool = await getPool();
      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .input('title', sql.NVarChar, title)
        .input('message', sql.NVarChar, message)
        .input('type', sql.NVarChar, type)
        .input('isRead', sql.Bit, isRead)
        .query(`INSERT INTO Notifications (UserId, Title, Message, Type, IsRead, CreatedAt)
                OUTPUT INSERTED.*
                VALUES (@userId, @title, @message, @type, @isRead, GETDATE())`);
      return res.status(201).json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao criar notificação:', error);
      return res.status(500).json({ error: 'Erro ao criar notificação.' });
    }
  }
};

export default notificationController;
