require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.use((socket, next) => {
  if (socket.handshake.auth.key === process.env.ACCESS_KEY) return next();
  next(new Error('Chiave di accesso non valida'));
});

io.on('connection', (socket) => {
  socket.emit('state_sync', db.getState());

  socket.on('add_dept', (data) => {
    db.exec('INSERT INTO departments (id, label, icon, color) VALUES (?, ?, ?, ?)', [data.id, data.label, data.iconName, data.color]);
    io.emit('state_sync', db.getState());
  });

  socket.on('del_dept', (deptId) => {
    try {
      db.exec('DELETE FROM articles WHERE dept_id = ?', [deptId]);
      db.exec('DELETE FROM departments WHERE id = ?', [deptId]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore eliminazione reparto:', e.message); }
  });

  socket.on('update_dept', ({ id, label }) => {
    try {
      db.exec('UPDATE departments SET label = ? WHERE id = ?', [label, id]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore aggiornamento reparto:', e.message); }
  });

  socket.on('add_art', (data) => {
    db.exec('INSERT INTO articles (id, dept_id, descrizione, qtyNuovo, qtyRigenerato) VALUES (?, ?, ?, 0, 0)', [data.id, data.deptId, data.descrizione]);
    io.emit('state_sync', db.getState());
  });

  socket.on('update_art', ({ id, descrizione }) => {
    try {
      db.exec('UPDATE articles SET descrizione = ? WHERE id = ?', [descrizione, id]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore aggiornamento articolo:', e.message); }
  });

  socket.on('delete_art', ({ artId }) => {
    try {
      db.exec('DELETE FROM articles WHERE id = ?', [artId]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore eliminazione articolo:', e.message); }
  });

  socket.on('confirm_tx', (tx) => {
    try {
      if (tx.type === 'realignment') {
        db.exec('UPDATE articles SET qtyNuovo = ?, qtyRigenerato = ? WHERE id = ?', [tx.newN, tx.newR, tx.artId]);
      } else {
        db.exec('UPDATE articles SET qtyNuovo = qtyNuovo + ?, qtyRigenerato = qtyRigenerato + ? WHERE id = ?', [tx.deltaN, tx.deltaR, tx.artId]);
      }
      tx.history.forEach(h => {
        db.exec('INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES (?, ?, ?, ?, ?, ?, ?)', [h.desc, h.date, h.qty, h.customer || '', h.origin || '', h.tipo, h.op]);
      });
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore transazione:', e.message); }
  });

  socket.on('disconnect', () => console.log('🔌 Client disconnesso:', socket.id));
});

app.use(express.static(path.join(__dirname, '../frontend/dist')));

const upload = multer({ dest: 'uploads/' });

// ✅ Endpoint Backup
app.get('/api/db/export', (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  const dbPath = path.join(__dirname, 'warehouse.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, `em_backup_${new Date().toISOString().slice(0,10)}.db`);
  } else {
    res.status(404).json({ error: 'Database non trovato' });
  }
});

// ✅ Endpoint Restore
app.post('/api/db/import', upload.single('dbfile'), (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  try {
    const dbPath = path.join(__dirname, 'warehouse.db');
    fs.copyFileSync(req.file.path, dbPath);
    fs.unlinkSync(req.file.path);
    db.saveDB();
    io.emit('state_sync', db.getState());
    res.json({ success: true, message: 'Backup ripristinato. Riavvio in corso...' });
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/reset-db', (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  try {
    db.exec('DROP TABLE IF EXISTS history');
    db.exec('DROP TABLE IF EXISTS articles');
    db.exec('DROP TABLE IF EXISTS departments');
    db.run('CREATE TABLE departments (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL)');
    db.run('CREATE TABLE articles (id TEXT PRIMARY KEY, dept_id TEXT NOT NULL, descrizione TEXT NOT NULL, qtyNuovo INTEGER DEFAULT 0, qtyRigenerato INTEGER DEFAULT 0)');
    db.run('CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, descrizione TEXT NOT NULL, date TEXT NOT NULL, qty INTEGER NOT NULL, customer TEXT DEFAULT \'\', origin TEXT DEFAULT \'\', tipo TEXT NOT NULL, operation TEXT NOT NULL)');
    db.run("INSERT INTO departments VALUES ('antenne','Antenne','Radio','bg-sky-600')");
    db.run("INSERT INTO departments VALUES ('elettrico','Elettrico','Zap','bg-amber-600')");
    db.run("INSERT INTO departments VALUES ('fotovoltaico','Fotovoltaico','Sun','bg-orange-600')");
    db.run("INSERT INTO departments VALUES ('sicurezza','Sicurezza','Shield','bg-rose-600')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('a1','antenne','Antenna DVB-T2')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('e1','elettrico','Cavo 2x1.5mm')");
    db.saveDB();
    io.emit('state_sync', db.getState());
    res.json({ success: true, message: 'Database resettato' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

async function startServer() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server attivo su porta ${PORT}`));
}
startServer();

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });