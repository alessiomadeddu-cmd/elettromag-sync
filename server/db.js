// server/db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Necessario per Neon/Render
});

module.exports = {
  initDB: async () => {
    const tables = `
      CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, dept_id TEXT NOT NULL REFERENCES departments(id), descrizione TEXT NOT NULL, qtyNuovo INTEGER DEFAULT 0, qtyRigenerato INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS history (id SERIAL PRIMARY KEY, descrizione TEXT NOT NULL, date TEXT NOT NULL, qty INTEGER NOT NULL, customer TEXT DEFAULT '', origin TEXT DEFAULT '', tipo TEXT NOT NULL, operation TEXT NOT NULL);
    `;
    await pool.query(tables);

    // Seed iniziale se vuoto
    const { rows } = await pool.query('SELECT COUNT(*) FROM departments');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO departments VALUES ('antenne','Antenne','Radio','bg-sky-600'), ('elettrico','Elettrico','Zap','bg-amber-600'), ('fotovoltaico','Fotovoltaico','Sun','bg-orange-600'), ('sicurezza','Sicurezza','Shield','bg-rose-600');
        INSERT INTO articles (id, dept_id, descrizione) VALUES ('a1','antenne','Antenna DVB-T2'), ('e1','elettrico','Cavo 2x1.5mm');
      `);
    }
    console.log('✅ Database PostgreSQL inizializzato e pronto');
  },
  exec: async (text, params = []) => {
    await pool.query(text, params);
  },
  run: async (text, params = []) => {
    await pool.query(text, params);
  },
  getState: async () => {
    const [depts, arts, hist] = await Promise.all([
      pool.query('SELECT * FROM departments ORDER BY id'),
      pool.query('SELECT * FROM articles ORDER BY dept_id, descrizione'),
      pool.query('SELECT * FROM history ORDER BY id DESC')
    ]);
    return { departments: depts.rows, articles: arts.rows, history: hist.rows };
  },
  saveDB: async () => {} // Non più necessario con PostgreSQL
};