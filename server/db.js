const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

let SQL, db;
const DB_PATH = path.join(__dirname, 'warehouse.db');

async function initDB() {
  SQL = await initSqlJs();
  
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS departments (
    id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY, dept_id TEXT NOT NULL, descrizione TEXT NOT NULL,
    qtyNuovo INTEGER DEFAULT 0, qtyRigenerato INTEGER DEFAULT 0
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, descrizione TEXT NOT NULL, date TEXT NOT NULL,
    qty INTEGER NOT NULL, customer TEXT DEFAULT '', origin TEXT DEFAULT '',
    tipo TEXT NOT NULL, operation TEXT NOT NULL
  )`);

  // Seed iniziale
  const count = db.exec('SELECT COUNT(*) as c FROM departments')[0]?.values?.[0]?.[0] || 0;
  if (count === 0) {
    db.run("INSERT INTO departments VALUES ('antenne','Antenne','Radio','bg-sky-600')");
    db.run("INSERT INTO departments VALUES ('elettrico','Elettrico','Zap','bg-amber-600')");
    db.run("INSERT INTO departments VALUES ('fotovoltaico','Fotovoltaico','Sun','bg-orange-600')");
    db.run("INSERT INTO departments VALUES ('sicurezza','Sicurezza','Shield','bg-rose-600')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('a1','antenne','Antenna DVB-T2')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('e1','elettrico','Cavo 2x1.5mm')");
  }
  saveDB();
}

function saveDB() {
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (e) { console.error('❌ Save DB error:', e.message); }
}

// ✅ Escape sicuro per stringhe SQL
function escapeSql(str) {
  if (str === null || str === undefined) return "''";
  if (typeof str === 'number') return str;
  return `'${String(str).replace(/'/g, "''")}'`;
}

// ✅ Esegui query con sostituzione diretta dei valori (compatibile sql.js)
function runQuery(sqlTemplate, values = []) {
  try {
    let sql = sqlTemplate;
    for (const val of values) {
      sql = sql.replace('?', escapeSql(val));
    }
    db.run(sql);
    saveDB();
  } catch (e) {
    console.error('❌ Query error:', e.message, 'SQL:', sql);
    throw e;
  }
}

// ✅ Ottieni risultati come array di oggetti
function getAll(sql) {
  try {
    const result = db.exec(sql);
    if (!result.length) return [];
    const columns = result[0].columns;
    return result[0].values.map(row => {
      const obj = {};
      columns.forEach((col, i) => obj[col] = row[i]);
      return obj;
    });
  } catch (e) {
    console.error('❌ Select error:', e.message);
    return [];
  }
}

module.exports = {
  initDB,
  getState: () => ({
    departments: getAll('SELECT * FROM departments'),
    articles: getAll('SELECT * FROM articles'),
    history: getAll('SELECT * FROM history ORDER BY id DESC')
  }),
  exec: (sql, params = []) => runQuery(sql, params),
  all: (sql) => getAll(sql)
};