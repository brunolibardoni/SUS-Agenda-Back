import { sql, getPool } from '../config/database.js';

export async function getAvailableSlots(req, res) {
  const { healthPostId, serviceId, date } = req.query;
  if (!healthPostId || !serviceId || !date) {
    return res.status(400).json({ error: 'healthPostId, serviceId e date são obrigatórios.' });
  }

  try {
    // Buscar todos os templates de horários para o posto/serviço/data
  const pool = await getPool();
    const templatesResult = await pool.request()
        .input('healthPostId', sql.VarChar, healthPostId)
        .input('serviceId', sql.VarChar, serviceId)
        .input('date', sql.Date, date)
        .query(`
           SELECT 
                st.Id,
                CONVERT(VARCHAR(5), st.TimeSlot, 108) AS TimeSlot,
                st.SlotsPerTime,
                s.Requirements AS ServiceDescription,
                ISNULL(b.TotalPatients, 0) AS TotalPatients,
                st.SlotsPerTime - ISNULL(b.TotalPatients, 0) AS SlotsAvailable
            FROM ScheduleTemplates st
            INNER JOIN Services s 
                ON st.ServiceId = s.Id
            LEFT JOIN (
                SELECT 
                    CONVERT(VARCHAR(5), b.Time, 108) AS TimeSlot,
                    SUM(b.PatientCount) AS TotalPatients
                FROM Bookings b
                WHERE b.HealthPostId = @healthPostId
                  AND b.ServiceId = @serviceId
                  AND b.Date = @date
                  AND b.Status = 'confirmed'
                GROUP BY CONVERT(VARCHAR(5), b.Time, 108)
            ) b 
                ON CONVERT(VARCHAR(5), st.TimeSlot, 108) = b.TimeSlot
            WHERE st.HealthPostId = @healthPostId
              AND st.ServiceId = @serviceId
              AND @date BETWEEN st.StartDate AND st.EndDate
              AND EXISTS (
                  SELECT 1
                  FROM OPENJSON(st.DaysOfWeek) AS d
                  WHERE d.value = CAST(((DATEPART(WEEKDAY, @date) + @@DATEFIRST - 1) % 7) AS NVARCHAR)
              )
            ORDER BY TimeSlot;
        `);

    const templates = templatesResult.recordset;

    // Filtrar horários disponíveis
    const availableSlots = templates.map(t => {

      //const availableSlots = Math.max(t.SlotsPerTime - 1, 0); // slots restantes
      return {
        id: t.Id,
        time: t.TimeSlot,
        available: t.SlotsAvailable > 0 ? true : false,
        totalSlots: t.SlotsPerTime,
        availableSlots: t.SlotsAvailable, // slots restantes
        serviceDescription: t.ServiceDescription
      };

    }).filter(slot => slot != null);

    
    res.json({ availableSlots });
  } catch (error) {
    console.error('Erro ao buscar horários disponíveis:', error);
    res.status(500).json({ error: 'Erro ao buscar horários disponíveis.' });
  }
}
