import { sql, getPool } from '../config/database.js';

const serviceController = {
  // Listar serviços por cidade
  async getServicesByCity(req, res) {
    try {
      const { cityId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          SELECT Id, Name, Duration, Requirements, CityId, CreatedAt 
          FROM Services 
          WHERE CityId = @cityId 
          ORDER BY Name
        `);
      
      res.json(result.recordset);
    } catch (error) {
      console.error('Erro ao buscar serviços:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar novo serviço
  async createService(req, res) {
    try {
      const { name, duration, requirements, cityId } = req.body;
      
      if (!name || !duration || !requirements || !cityId) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('duration', sql.NVarChar, duration)
        .input('requirements', sql.NVarChar, requirements)
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          INSERT INTO Services (Name, Duration, Requirements, CityId) 
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Duration, INSERTED.Requirements, INSERTED.CityId, INSERTED.CreatedAt
          VALUES (@name, @duration, @requirements, @cityId)
        `);
      
      res.status(201).json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao criar serviço:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar serviço
  async updateService(req, res) {
    try {
      const { id } = req.params;
      const { name, duration, requirements } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar, name)
        .input('duration', sql.NVarChar, duration)
        .input('requirements', sql.NVarChar, requirements)
        .query(`
          UPDATE Services 
          SET Name = COALESCE(@name, Name),
              Duration = COALESCE(@duration, Duration),
              Requirements = COALESCE(@requirements, Requirements),
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Duration, INSERTED.Requirements, INSERTED.CityId, INSERTED.CreatedAt
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar serviço:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Deletar serviço
  async deleteService(req, res) {
    try {
      const { id } = req.params;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM Services WHERE Id = @id');
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Serviço não encontrado' });
      }
      
      res.json({ message: 'Serviço deletado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar serviço:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default serviceController;
