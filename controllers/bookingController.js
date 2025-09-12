import { sql, getPool } from '../config/database.js';

const bookingController = {
  // Listar agendamentos por cidade
  async getBookingsByCity(req, res) {
    try {
      const { cityId } = req.params;
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;

      const pool = await getPool();
      // Total de registros
      const totalResult = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query('SELECT COUNT(*) as total FROM Bookings WHERE CityId = @cityId');
      const totalRecords = totalResult.recordset[0].total;
      const totalPages = Math.ceil(totalRecords / pageSize);

      // Registros paginados
      const result = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .input('offset', sql.Int, (page - 1) * pageSize)
        .input('fetch', sql.Int, pageSize)
        .query(`
          SELECT 
            b.Id, CONVERT(varchar(10),b.Date,103) AS Date, CONVERT(varchar(5),b.Time,108) as Time, b.PatientCount, b.QRCode, b.Status, b.AdminComment, b.CreatedAt,
            u.Name as PatientName, u.Email as PatientEmail, u.Phone as PatientPhone, u.Id as PatientUserId,
            hp.Name as HealthPostName, hp.Address as HealthPostAddress, hp.Id as HealthPostId,
            s.Name as ServiceName, s.Duration as ServiceDuration, s.Requirements as ServiceRequirements, s.Id as ServiceId
          FROM Bookings b
          INNER JOIN Users u ON b.PatientUserId = u.Id
          INNER JOIN HealthPosts hp ON b.HealthPostId = hp.Id
          INNER JOIN Services s ON b.ServiceId = s.Id
          WHERE b.CityId = @cityId 
          ORDER BY b.CreatedAt DESC
          OFFSET @offset ROWS FETCH NEXT @fetch ROWS ONLY
        `);

      const bookings = result.recordset.map(row => ({
        id: row.Id,
        patientName: row.PatientName,
        patientEmail: row.PatientEmail,
        patientPhone: row.PatientPhone,
        patientUserId: row.PatientUserId,
        healthPost: {
          id: row.HealthPostId,
          name: row.HealthPostName,
          address: row.HealthPostAddress
        },
        service: {
          id: row.ServiceId,
          name: row.ServiceName,
          duration: row.ServiceDuration,
          requirements: row.ServiceRequirements
        },
        date: row.Date,
        time: row.Time,
        status: row.Status,
        adminComment: row.AdminComment,
        createdAt: row.CreatedAt
      }));

      res.json({ bookings, totalPages, totalRecords, page });
    } catch (error) {
      console.error('Erro ao buscar agendamentos:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar status do agendamento
  async updateBookingStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, adminComment } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.NVarChar, id)
        .input('status', sql.NVarChar, status)
        .input('adminComment', sql.NVarChar, adminComment)
        .query(`
          UPDATE Bookings 
          SET Status = @status,
              AdminComment = @adminComment,
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.Status, INSERTED.AdminComment, INSERTED.PatientUserId
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }
      
      // Criar notificação para o paciente
      const booking = result.recordset[0];
      await createNotificationForStatusChange(booking.PatientUserId, id, status, adminComment);
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar agendamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Adicionar comentário ao agendamento
  async updateBookingComment(req, res) {
    try {
      const { id } = req.params;
      const { comment } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.NVarChar, id)
        .input('comment', sql.NVarChar, comment)
        .query(`
          UPDATE Bookings 
          SET AdminComment = @comment,
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.AdminComment, INSERTED.PatientUserId
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Agendamento não encontrado' });
      }
      
      // Criar notificação para o paciente
      const booking = result.recordset[0];
      await createNotificationForComment(booking.PatientUserId, id, comment);
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar comentário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

// Função auxiliar para criar notificação de mudança de status
async function createNotificationForStatusChange(userId, bookingId, status, adminComment) {
  try {
    const pool = await getPool();
    
    let type, title, message;
    switch (status) {
      case 'confirmed':
        type = 'booking_confirmed';
        title = 'Agendamento Confirmado';
        message = 'Seu agendamento foi confirmado.';
        break;
      case 'cancelled':
        type = 'booking_cancelled';
        title = 'Agendamento Cancelado';
        message = 'Seu agendamento foi cancelado.';
        break;
      case 'completed':
        type = 'booking_completed';
        title = 'Atendimento Concluído';
        message = 'Seu atendimento foi concluído com sucesso.';
        break;
    }
    
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('bookingId', sql.NVarChar, bookingId)
      .input('type', sql.NVarChar, type)
      .input('title', sql.NVarChar, title)
      .input('message', sql.NVarChar, message)
      .input('adminComment', sql.NVarChar, adminComment)
      .query(`
        INSERT INTO Notifications (UserId, BookingId, Type, Title, Message, AdminComment)
        VALUES (@userId, @bookingId, @type, @title, @message, @adminComment)
      `);
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
  }
}

// Função auxiliar para criar notificação de comentário
async function createNotificationForComment(userId, bookingId, comment) {
  try {
    const pool = await getPool();
    
    await pool.request()
      .input('userId', sql.UniqueIdentifier, userId)
      .input('bookingId', sql.NVarChar, bookingId)
      .input('type', sql.NVarChar, 'admin_message')
      .input('title', sql.NVarChar, 'Mensagem da Equipe')
      .input('message', sql.NVarChar, 'Nova mensagem sobre seu agendamento.')
      .input('adminComment', sql.NVarChar, comment)
      .query(`
        INSERT INTO Notifications (UserId, BookingId, Type, Title, Message, AdminComment)
        VALUES (@userId, @bookingId, @type, @title, @message, @adminComment)
      `);
  } catch (error) {
    console.error('Erro ao criar notificação:', error);
  }
}

export default bookingController;
