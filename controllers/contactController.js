//const { sql, getPool } = require('../config/database');
import { sql, getPool } from '../config/database.js';

const contactController = {
  // Buscar informações de contato por cidade
  async getContactByCity(req, res) {
    try {
      const { cityId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          SELECT Id, CentralPhone, CentralHours, GeneralHours, EmergencyInfo, CityId, CreatedAt 
          FROM ContactInfo 
          WHERE CityId = @cityId
        `);
      
      res.json(result.recordset[0] || null);
    } catch (error) {
      console.error('Erro ao buscar informações de contato:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar informações de contato
  async createContact(req, res) {
    try {
      const { centralPhone, centralHours, generalHours, emergencyInfo, cityId } = req.body;
      
      if (!centralPhone || !centralHours || !generalHours || !emergencyInfo || !cityId) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('centralPhone', sql.NVarChar, centralPhone)
        .input('centralHours', sql.NVarChar, centralHours)
        .input('generalHours', sql.NVarChar, generalHours)
        .input('emergencyInfo', sql.NVarChar, emergencyInfo)
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          INSERT INTO ContactInfo (CentralPhone, CentralHours, GeneralHours, EmergencyInfo, CityId) 
          OUTPUT INSERTED.Id, INSERTED.CentralPhone, INSERTED.CentralHours, INSERTED.GeneralHours, 
                 INSERTED.EmergencyInfo, INSERTED.CityId, INSERTED.CreatedAt
          VALUES (@centralPhone, @centralHours, @generalHours, @emergencyInfo, @cityId)
        `);
      
      res.status(201).json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao criar informações de contato:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar informações de contato
  async updateContact(req, res) {
    try {
      const { id } = req.params;
      const { centralPhone, centralHours, generalHours, emergencyInfo } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('centralPhone', sql.NVarChar, centralPhone)
        .input('centralHours', sql.NVarChar, centralHours)
        .input('generalHours', sql.NVarChar, generalHours)
        .input('emergencyInfo', sql.NVarChar, emergencyInfo)
        .query(`
          UPDATE ContactInfo 
          SET CentralPhone = COALESCE(@centralPhone, CentralPhone),
              CentralHours = COALESCE(@centralHours, CentralHours),
              GeneralHours = COALESCE(@generalHours, GeneralHours),
              EmergencyInfo = COALESCE(@emergencyInfo, EmergencyInfo),
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.CentralPhone, INSERTED.CentralHours, INSERTED.GeneralHours,
                 INSERTED.EmergencyInfo, INSERTED.CityId, INSERTED.CreatedAt
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Informações de contato não encontradas' });
      }
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar informações de contato:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default contactController;
