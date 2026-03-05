const mysql = require('mysql2');

class MySQL {
  constructor() {
    this.connection = null;
    this.config = null;
  }

  init(config) {
    this.config = config;
    this.connection = mysql.createConnection(config);
    
    this.connection.connect((err) => {
      if (err) {
        console.error('Error conectando a MySQL:', err);
        return;
      }
      console.log('Conectado a MySQL');
    });
  }

  async query(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.connection.execute(sql, params, (err, results) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(results);
      });
    });
  }

  table_to_json(rows, types) {
    if (!rows || rows.length === 0) return [];
    
    return rows.map(row => {
      const newRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (types && types[key]) {
          // Convertir según el tipo especificado
          switch (types[key]) {
            case 'number':
              newRow[key] = value ? Number(value) : null;
              break;
            case 'string':
              newRow[key] = value ? String(value) : '';
              break;
            case 'boolean':
              newRow[key] = Boolean(value);
              break;
            default:
              newRow[key] = value;
          }
        } else {
          newRow[key] = value;
        }
      }
      return newRow;
    });
  }

  async end() {
    if (this.connection) {
      return new Promise((resolve, reject) => {
        this.connection.end((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  }
}

module.exports = MySQL;