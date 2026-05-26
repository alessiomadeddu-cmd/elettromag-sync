import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default {
  initDB: async () => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS departments (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, dept_id TEXT NOT NULL REFERENCES departments(id), descrizione TEXT NOT NULL, qtyNuovo INTEGER DEFAULT 0, qtyRigenerato INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS history (id SERIAL PRIMARY KEY, descrizione TEXT NOT NULL, date TEXT NOT NULL, qty INTEGER NOT NULL, customer TEXT DEFAULT '', origin TEXT DEFAULT '', tipo TEXT NOT NULL, operation TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS appointments (id TEXT PRIMARY KEY, title TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL, operator TEXT NOT NULL CHECK (operator IN ('A', 'C', 'AC')));
      CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, title TEXT NOT NULL, completed BOOLEAN DEFAULT false, priority TEXT DEFAULT 'medium', due_date DATE, created_at TIMESTAMP DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, customer TEXT NOT NULL, amount DECIMAL(10,2) NOT NULL, status TEXT CHECK (status IN ('pending','issued','paid','cancelled')) DEFAULT 'pending', due_date DATE, notes TEXT, created_at TIMESTAMP DEFAULT NOW());
    `);

    const { rows } = await pool.query('SELECT COUNT(*) FROM departments');
    if (parseInt(rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO departments VALUES
          ('antenne','Antenne','Radio','bg-sky-600'),
          ('elettrico','Elettrico','Zap','bg-amber-600');
        INSERT INTO articles (id, dept_id, descrizione) VALUES
          ('a1','antenne','Antenna DVB-T2');
      `);
    }
    console.log('✅ Database inizializzato');
  },
  exec: async (text, params) => await pool.query(text, params),
  query: async (text, params) => await pool.query(text, params),
  getState: async () => {
    const [depts, arts, hist, appts, todos, invoices] = await Promise.all([
      pool.query('SELECT * FROM departments'),
      pool.query('SELECT * FROM articles'),
      pool.query('SELECT * FROM history'),
      pool.query('SELECT * FROM appointments ORDER BY date DESC, time DESC'),
      pool.query('SELECT * FROM todos ORDER BY created_at DESC'),
      pool.query('SELECT * FROM invoices ORDER BY created_at DESC')
    ]);
    return {
      departments: depts.rows,
      articles: arts.rows,
      history: hist.rows,
      appointments: appts.rows,
      todos: todos.rows,
      invoices: invoices.rows
    };
  }
};