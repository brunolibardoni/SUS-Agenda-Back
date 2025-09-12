import { sql, getPool } from '../config/database.js';

const externalController = {
  // Criar agendamento (portal externo)
  async createBooking(req, res) {
      try {
        const { patientUserId, cityId, healthPostId, serviceId, date, time, patientCount } = req.body;

        // Função utilitária para validar e formatar hora
        function formatTimeToSql(timeStr) {
          if (typeof timeStr !== 'string') return null;
          // Aceita HH:mm ou HH:mm:ss
          const matchHm = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeStr);
          const matchHms = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(timeStr);
          if (matchHm) return timeStr + ':00';
          if (matchHms) return timeStr;
          return null;
        }

        const timeFormatted = formatTimeToSql(time);

        if (!timeFormatted) {
          return res.status(400).json({ error: 'Formato de hora inválido. Use HH:mm ou HH:mm:ss (ex: 05:00 ou 05:00:00).' });
        }

        if (!patientUserId || !cityId || !healthPostId || !serviceId || !date || !timeFormatted || !patientCount) {
          return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }

        const bookingId = `BK${Date.now()}`;
        const qrCode = `QR${Date.now()}`;

      const pool = await getPool();
      // Buscar cidade do posto de saúde
      const healthPostResult = await pool.request()
        .input('healthPostId', sql.UniqueIdentifier, healthPostId)
        .query('SELECT CityId FROM HealthPosts WHERE Id = @healthPostId');

      if (healthPostResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Posto de saúde não encontrado' });
      }

      const cityIdFromDb = healthPostResult.recordset[0].CityId;
      if (cityIdFromDb !== cityId) {
        return res.status(400).json({ error: 'Cidade do posto de saúde não confere com a cidade enviada.' });
      }

      // Impede agendamento para outro paciente
      if (req.session?.user?.id && req.session.user.id !== patientUserId) {
        return res.status(403).json({ error: 'Você não pode agendar para outro usuário.' });
      }



     const slotsAvailable = await pool.request()
        .input('date', sql.Date, date)
        .input('time', sql.VarChar, time)
        .input('healthPostId', sql.VarChar, healthPostId)
        .input('serviceId', sql.VarChar, serviceId)
        .query(`
            SELECT 
                st.Id,
                CONVERT(VARCHAR(5), st.TimeSlot, 108) AS TimeSlot,  -- horário do template (HH:mm)
                st.SlotsPerTime,
                s.Requirements AS ServiceDescription,
                ISNULL(b.TotalPatients, 0) AS TotalPatients,        
                st.SlotsPerTime - ISNULL(b.TotalPatients, 0) AS SlotsAvailable
            FROM ScheduleTemplates st
            INNER JOIN Services s 
                ON st.ServiceId = s.Id
            LEFT JOIN (
                SELECT 
                    CAST(b.Time AS TIME(0)) AS TimeSlotKey,         -- chave de comparação
                    SUM(b.PatientCount) AS TotalPatients
                FROM Bookings b
                WHERE b.HealthPostId = @healthPostId
                  AND b.ServiceId = @serviceId
                  AND b.Date = @date
                  AND b.Status = 'confirmed'
                GROUP BY CAST(b.Time AS TIME(0))
            ) b 
                ON CAST(st.TimeSlot AS TIME(0)) = b.TimeSlotKey
            WHERE st.HealthPostId = @healthPostId
              AND st.ServiceId = @serviceId
              AND @date BETWEEN st.StartDate AND st.EndDate
              AND CAST(st.TimeSlot AS TIME(0)) = @time   -- filtro por horário
            ORDER BY TimeSlot;
        `);

        const availableSlots = slotsAvailable.recordset.map(row => ({
          slotsAvailable: row.SlotsAvailable,
        }));
        
        if (availableSlots.length === 0 || availableSlots[0].slotsAvailable < patientCount) {
          return res.status(400).json({ error: 'Não há quantidade disponível para o horário selecionado ou a quantidade de pacientes é maior que a quantidade de horário disponível.' });
        }

      const result = await pool.request()
        .input('id', sql.NVarChar, bookingId)
        .input('patientUserId', sql.UniqueIdentifier, patientUserId)
        .input('healthPostId', sql.UniqueIdentifier, healthPostId)
        .input('serviceId', sql.UniqueIdentifier, serviceId)
        .input('date', sql.Date, date)
        .input('time', sql.VarChar, timeFormatted)
        .input('patientCount', sql.Int, patientCount)
        .input('qrCode', sql.NVarChar, qrCode)
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          INSERT INTO Bookings (Id, PatientUserId, HealthPostId, ServiceId, Date, Time, PatientCount, QRCode, CityId) 
          OUTPUT INSERTED.Id, INSERTED.QRCode, INSERTED.CreatedAt
          VALUES (@id, @patientUserId, @healthPostId, @serviceId, @date, @time, @patientCount, @qrCode, @cityId)
        `);

        res.status(201).json({
        id: result.recordset[0].Id,
        qrCode: result.recordset[0].QRCode,
        createdAt: result.recordset[0].CreatedAt
      });
    } catch (error) {
      console.error('Erro ao criar agendamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar agendamentos do usuário
  async getUserBookings(req, res) {
    try {
      const { userId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('userId', sql.UniqueIdentifier, userId)
        .query(`
          SELECT 
            b.Id, b.Date, CONVERT(VARCHAR(5), b.Time, 108) AS Time, b.PatientCount, b.QRCode, b.Status, b.CreatedAt,
            hp.Name as HealthPostName, hp.Address as HealthPostAddress, hp.Id as HealthPostId,
            s.Name as ServiceName, s.Duration as ServiceDuration, 
            s.Requirements as ServiceRequirements, s.Id as ServiceId
          FROM Bookings b
          INNER JOIN HealthPosts hp ON b.HealthPostId = hp.Id
          INNER JOIN Services s ON b.ServiceId = s.Id
          WHERE b.PatientUserId = @userId 
          ORDER BY b.CreatedAt DESC
        `);
      
      const bookings = result.recordset.map(row => ({
        id: row.Id,
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
        patientCount: row.PatientCount,
        qrCode: row.QRCode,
        userId: userId,
        status: row.Status,
        createdAt: row.CreatedAt,
        timeSlot: {
          id: `slot-${row.Time}`,
          time: row.Time,
          available: false
        }
      }));
      
      res.json(bookings);
    } catch (error) {
      console.error('Erro ao buscar agendamentos do usuário:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Cancelar agendamento
  async cancelBooking(req, res) {
    try {
      const { bookingId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('bookingId', sql.NVarChar, bookingId)
        .query(`
          UPDATE Bookings 
          SET Status = 'cancelled', UpdatedAt = GETDATE()
          WHERE Id = @bookingId AND Status = 'confirmed'
        `);
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Agendamento não encontrado ou já cancelado' });
      }
      
      res.json({ message: 'Agendamento cancelado com sucesso' });
    } catch (error) {
      console.error('Erro ao cancelar agendamento:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default externalController;
