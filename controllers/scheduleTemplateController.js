// Função para garantir formato 'HH:MM:SS' para SQL Server
function toSqlTimeFormat(timeSlot) {
  if (!timeSlot) return '00:00:00';
  const parts = timeSlot.split(':');
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
  }
  if (parts.length === 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
  }
  return '00:00:00';
}
import { sql, getPool } from '../config/database.js';

const scheduleTemplateController = {
  // Listar modelos por cidade
  async getTemplatesByCity(req, res) {
    try {
      const { cityId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          SELECT 
            st.Id, st.Name, st.DaysOfWeek, st.TimeSlot, st.SlotsPerTime, 
            st.StartDate, st.EndDate, st.IsActive, st.CityId, st.CreatedAt,
            hp.Name as HealthPostName, hp.Id as HealthPostId,
            s.Name as ServiceName, s.Id as ServiceId
          FROM ScheduleTemplates st
          INNER JOIN HealthPosts hp ON st.HealthPostId = hp.Id
          INNER JOIN Services s ON st.ServiceId = s.Id
          WHERE st.CityId = @cityId 
          ORDER BY st.Name
        `);
      
      const templates = result.recordset.map(row => ({
        id: row.Id,
        name: row.Name,
        healthPostId: row.HealthPostId,
        serviceId: row.ServiceId,
        daysOfWeek: JSON.parse(row.DaysOfWeek),
        timeSlot: row.TimeSlot instanceof Date
          ? row.TimeSlot.toISOString().substr(11, 8)
          : typeof row.TimeSlot === 'string'
            ? row.TimeSlot
            : '00:00:00',
        slotsPerTime: row.SlotsPerTime,
        startDate: row.StartDate,
        endDate: row.EndDate,
        isActive: row.IsActive,
        cityId: row.CityId,
        healthPostName: row.HealthPostName,
        serviceName: row.ServiceName
      }));
      
      res.json(templates);
    } catch (error) {
      console.error('Erro ao buscar modelos:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar novo modelo
  async createTemplate(req, res) {
    try {
  const { name, healthPostId, serviceId, daysOfWeek, timeSlot, slotsPerTime, startDate, endDate, cityId } = req.body;
  const timeSlotConverted = toSqlTimeFormat(timeSlot);
      
      if (!name || !healthPostId || !serviceId || !daysOfWeek || !timeSlot || !slotsPerTime || !startDate || !cityId) {
        return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('healthPostId', sql.UniqueIdentifier, healthPostId)
        .input('serviceId', sql.UniqueIdentifier, serviceId)
        .input('daysOfWeek', sql.NVarChar, JSON.stringify(daysOfWeek))
        .input('timeSlot', sql.VarChar, timeSlotConverted)
        .input('slotsPerTime', sql.Int, slotsPerTime)
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate || null)
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          INSERT INTO ScheduleTemplates (Name, HealthPostId, ServiceId, DaysOfWeek, TimeSlot, SlotsPerTime, StartDate, EndDate, CityId) 
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.DaysOfWeek, INSERTED.TimeSlot, INSERTED.SlotsPerTime, 
                 INSERTED.StartDate, INSERTED.EndDate, INSERTED.IsActive, INSERTED.CityId, INSERTED.CreatedAt
          VALUES (@name, @healthPostId, @serviceId, @daysOfWeek, @timeSlot, @slotsPerTime, @startDate, @endDate, @cityId)
        `);
      
        const row = result.recordset[0];
        const templateId = row.Id;

        // Buscar o registro completo com JOIN
        const fullResult = await pool.request()
          .input('id', sql.UniqueIdentifier, templateId)
          .query(`
            SELECT 
              st.Id, st.Name, st.DaysOfWeek, st.TimeSlot, st.SlotsPerTime, 
              st.StartDate, st.EndDate, st.IsActive, st.CityId, st.CreatedAt,
              hp.Name as HealthPostName, hp.Id as HealthPostId,
              s.Name as ServiceName, s.Id as ServiceId
            FROM ScheduleTemplates st
            INNER JOIN HealthPosts hp ON st.HealthPostId = hp.Id
            INNER JOIN Services s ON st.ServiceId = s.Id
            WHERE st.Id = @id
          `);

        const fullRow = fullResult.recordset[0];
        const template = {
          id: fullRow.Id,
          name: fullRow.Name,
          healthPostId: fullRow.HealthPostId,
          serviceId: fullRow.ServiceId,
          daysOfWeek: JSON.parse(fullRow.DaysOfWeek),
          timeSlot: fullRow.TimeSlot instanceof Date
            ? fullRow.TimeSlot.toISOString().substr(11, 8)
            : typeof fullRow.TimeSlot === 'string'
              ? fullRow.TimeSlot
              : '00:00:00',
          slotsPerTime: fullRow.SlotsPerTime,
          startDate: fullRow.StartDate,
          endDate: fullRow.EndDate,
          isActive: fullRow.IsActive,
          cityId: fullRow.CityId,
          healthPostName: fullRow.HealthPostName,
          serviceName: fullRow.ServiceName,
          createdAt: fullRow.CreatedAt
        };
                  
        res.status(201).json(template);
      
    } catch (error) {
      console.error('Erro ao criar modelo:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar modelo
  async updateTemplate(req, res) {
    try {
      const { id } = req.params;
      const { name, healthPostId, serviceId, daysOfWeek, timeSlot, slotsPerTime, startDate, endDate, isActive } = req.body;
      const timeSlotConverted = toSqlTimeFormat(timeSlot);

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar, name)
        .input('healthPostId', sql.UniqueIdentifier, healthPostId)
        .input('serviceId', sql.UniqueIdentifier, serviceId)
        .input('daysOfWeek', sql.NVarChar, daysOfWeek ? JSON.stringify(daysOfWeek) : null)
        //.input('timeSlot', sql.VarChar, timeSlotConverted)
        .input('timeSlot', sql.VarChar, typeof timeSlot !== 'undefined' ? toSqlTimeFormat(timeSlot) : null)
        .input('slotsPerTime', sql.Int, slotsPerTime)
        .input('startDate', sql.Date, startDate)
        .input('endDate', sql.Date, endDate)
        .input('isActive', sql.Bit, isActive)
        .query(`
          UPDATE ScheduleTemplates 
          SET Name = COALESCE(@name, Name),
              HealthPostId = COALESCE(@healthPostId, HealthPostId),
              ServiceId = COALESCE(@serviceId, ServiceId),
              DaysOfWeek = COALESCE(@daysOfWeek, DaysOfWeek),
              TimeSlot = COALESCE(@timeSlot, TimeSlot),
              SlotsPerTime = COALESCE(@slotsPerTime, SlotsPerTime),
              StartDate = COALESCE(@startDate, StartDate),
              EndDate = COALESCE(@endDate, EndDate),
              IsActive = COALESCE(@isActive, IsActive),
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.DaysOfWeek, INSERTED.TimeSlot, INSERTED.SlotsPerTime,
                 INSERTED.StartDate, INSERTED.EndDate, INSERTED.IsActive, INSERTED.CityId, INSERTED.CreatedAt
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Modelo não encontrado' });
      }
      
      const updatedId = result.recordset[0].Id;
      // Buscar o objeto completo com JOINs
      const fullResult = await pool.request()
        .input('id', sql.UniqueIdentifier, updatedId)
        .query(`
          SELECT 
            st.Id, st.Name, st.DaysOfWeek, st.TimeSlot, st.SlotsPerTime, 
            st.StartDate, st.EndDate, st.IsActive, st.CityId, st.CreatedAt,
            hp.Name as HealthPostName, hp.Id as HealthPostId,
            s.Name as ServiceName, s.Id as ServiceId
          FROM ScheduleTemplates st
          INNER JOIN HealthPosts hp ON st.HealthPostId = hp.Id
          INNER JOIN Services s ON st.ServiceId = s.Id
          WHERE st.Id = @id
        `);

      if (fullResult.recordset.length === 0) {
        return res.status(404).json({ error: 'Modelo atualizado não encontrado' });
      }
      const row = fullResult.recordset[0];
      const response = {
        id: row.Id,
        name: row.Name,
        healthPostId: row.HealthPostId,
        serviceId: row.ServiceId,
        daysOfWeek: JSON.parse(row.DaysOfWeek),
        timeSlot: row.TimeSlot instanceof Date
          ? row.TimeSlot.toISOString().substr(11, 8)
          : typeof row.TimeSlot === 'string'
            ? row.TimeSlot
            : '00:00:00',
        slotsPerTime: row.SlotsPerTime,
        startDate: row.StartDate,
        endDate: row.EndDate,
        isActive: row.IsActive,
        cityId: row.CityId,
        healthPostName: row.HealthPostName,
        serviceName: row.ServiceName
      };
      // Retorne apenas o objeto camelCase, igual ao delete
      return res.json(response);
      
    } catch (error) {
      console.error('Erro ao atualizar modelo:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Deletar modelo
  async deleteTemplate(req, res) {
    try {
      const { id } = req.params;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM ScheduleTemplates WHERE Id = @id');
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Modelo não encontrado' });
      }
      
      res.json({ message: 'Modelo deletado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar modelo:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default scheduleTemplateController;
