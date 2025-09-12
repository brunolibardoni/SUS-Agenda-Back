import { sql, getPool } from '../config/database.js';

const healthPostController = {
  // Listar postos por cidade
  async getHealthPostsByCity(req, res) {
    try {
      const { cityId } = req.params;
      
      const pool = await getPool();
      const result = await pool.request()
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          SELECT Id, Name, Address, Distance, CityId, CreatedAt 
          FROM HealthPosts 
          WHERE CityId = @cityId 
          ORDER BY Name
        `);
      
      res.json(result.recordset);
    } catch (error) {
      console.error('Erro ao buscar postos de saúde:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar novo posto
  async createHealthPost(req, res) {
    try {
      const { name, address, distance, cityId } = req.body;
      
      if (!name || !address || !cityId) {
        return res.status(400).json({ error: 'Nome, endereço e cidade são obrigatórios' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('address', sql.NVarChar, address)
        .input('distance', sql.Decimal(5,2), distance || 0)
        .input('cityId', sql.UniqueIdentifier, cityId)
        .query(`
          INSERT INTO HealthPosts (Name, Address, Distance, CityId) 
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Address, INSERTED.Distance, INSERTED.CityId, INSERTED.CreatedAt
          VALUES (@name, @address, @distance, @cityId)
        `);
      
      res.status(201).json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao criar posto de saúde:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar posto
  async updateHealthPost(req, res) {
    try {
      const { id } = req.params;
      const { name, address, distance } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar, name)
        .input('address', sql.NVarChar, address)
        .input('distance', sql.Decimal(5,2), distance)
        .query(`
          UPDATE HealthPosts 
          SET Name = COALESCE(@name, Name),
              Address = COALESCE(@address, Address),
              Distance = COALESCE(@distance, Distance),
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.Address, INSERTED.Distance, INSERTED.CityId, INSERTED.CreatedAt
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Posto de saúde não encontrado' });
      }
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar posto de saúde:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Deletar posto
  async deleteHealthPost(req, res) {
    try {
      const { id } = req.params;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM HealthPosts WHERE Id = @id');
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Posto de saúde não encontrado' });
      }
      
      res.json({ message: 'Posto de saúde deletado com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar posto de saúde:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default healthPostController;
