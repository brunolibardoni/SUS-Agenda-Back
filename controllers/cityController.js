//const { sql, getPool } = require('../config/database');
import { sql, getPool } from '../config/database.js';

const cityController = {
  // Listar todas as cidades ativas
  async getAllCities(req, res) {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .query('SELECT Id, Name, State, IsActive, CreatedAt FROM Cities WHERE IsActive = 1 ORDER BY Name');
      
      res.json(result.recordset);
    } catch (error) {
      console.error('Erro ao buscar cidades:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Listar todas as cidades (para admin)
  async getAllCitiesAdmin(req, res) {
    try {
      const pool = await getPool();
      const result = await pool.request()
        .query('SELECT Id, Name, State, IsActive, CreatedAt FROM Cities ORDER BY Name');
      
      res.json(result.recordset);
    } catch (error) {
      console.error('Erro ao buscar cidades:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar nova cidade
  async createCity(req, res) {
    try {
      const { name, state, isActive } = req.body;
      
      if (!name || !state) {
        return res.status(400).json({ error: 'Nome e estado são obrigatórios' });
      }

      const pool = await getPool();
      const result = await pool.request()
        .input('name', sql.NVarChar, name)
        .input('state', sql.NVarChar, state.toUpperCase())
        .input('isActive', sql.Bit, isActive !== false)
        .query(`
          INSERT INTO Cities (Name, State, IsActive) 
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.State, INSERTED.IsActive, INSERTED.CreatedAt
          VALUES (@name, @state, @isActive)
        `);
      
      res.status(201).json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao criar cidade:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar cidade
  async updateCity(req, res) {
    try {
      const { id } = req.params;
      const { name, state, isActive } = req.body;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .input('name', sql.NVarChar, name)
        .input('state', sql.NVarChar, state?.toUpperCase())
        .input('isActive', sql.Bit, isActive)
        .query(`
          UPDATE Cities 
          SET Name = COALESCE(@name, Name),
              State = COALESCE(@state, State),
              IsActive = COALESCE(@isActive, IsActive),
              UpdatedAt = GETDATE()
          OUTPUT INSERTED.Id, INSERTED.Name, INSERTED.State, INSERTED.IsActive, INSERTED.CreatedAt
          WHERE Id = @id
        `);
      
      if (result.recordset.length === 0) {
        return res.status(404).json({ error: 'Cidade não encontrada' });
      }
      
      res.json(result.recordset[0]);
    } catch (error) {
      console.error('Erro ao atualizar cidade:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Deletar cidade
  async deleteCity(req, res) {
    try {
      const { id } = req.params;

      const pool = await getPool();
      const result = await pool.request()
        .input('id', sql.UniqueIdentifier, id)
        .query('DELETE FROM Cities WHERE Id = @id');
      
      if (result.rowsAffected[0] === 0) {
        return res.status(404).json({ error: 'Cidade não encontrada' });
      }
      
      res.json({ message: 'Cidade deletada com sucesso' });
    } catch (error) {
      console.error('Erro ao deletar cidade:', error);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};

export default cityController;
