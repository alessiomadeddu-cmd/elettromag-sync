require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const server = http.createServer(app);

// 🔌 Socket.IO Configuration
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// 🔐 Middleware di autenticazione Socket
io.use((socket, next) => {
  const clientKey = socket.handshake.auth.key;
  if (clientKey === process.env.ACCESS_KEY) {
    console.log(`✅ Autenticato: ${socket.id}`);
    return next();
  }
  console.log(`❌ Accesso negato: ${socket.id}`);
  return next(new Error('Chiave di accesso non valida'));
});

// 📡 Gestione Connessioni & Eventi
io.on('connection', (socket) => {
  console.log(`🔌 Nuovo client connesso: ${socket.id}`);
  socket.emit('state_sync', db.getState());
  
  socket.on('add_dept', (data) => {
    db.exec('INSERT INTO departments (id, label, icon, color) VALUES (?, ?, ?, ?)', [data.id, data.label, data.iconName, data.color]);
    io.emit('state_sync', db.getState());
  });
  
  socket.on('del_dept', (deptId) => {
    console.log(`🗑️ Elimina reparto: ${deptId}`);
    try {
      db.exec('DELETE FROM articles WHERE dept_id = ?', [deptId]);
      db.exec('DELETE FROM departments WHERE id = ?', [deptId]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore eliminazione reparto:', e.message); }
  });
  
  socket.on('add_art', (data) => {
    db.exec('INSERT INTO articles (id, dept_id, descrizione, qtyNuovo, qtyRigenerato) VALUES (?, ?, ?, 0, 0)', [data.id, data.deptId, data.descrizione]);
    io.emit('state_sync', db.getState());
  });

  socket.on('delete_art', ({ artId, deptId }) => {
    console.log(`🗑️ Elimina articolo: ${artId}`);
    try {
      db.exec('DELETE FROM articles WHERE id = ?', [artId]);
      io.emit('state_sync', db.getState());
    } catch (e) { console.error('❌ Errore eliminazione articolo:', e.message); }
  });
  
  socket.on('confirm_tx', (tx) => {
    console.log(`✅ Transazione: ${tx.type} su articolo ${tx.artId}`);
    if (tx.type === 'realignment') {
      db.exec('UPDATE articles SET qtyNuovo = ?, qtyRigenerato = ? WHERE id = ?', [tx.newN, tx.newR, tx.artId]);
    } else {
      db.exec('UPDATE articles SET qtyNuovo = qtyNuovo + ?, qtyRigenerato = qtyRigenerato + ? WHERE id = ?', [tx.deltaN, tx.deltaR, tx.artId]);
    }
    tx.history.forEach(h => {
      db.exec('INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES (?, ?, ?, ?, ?, ?, ?)', [h.desc, h.date, h.qty, h.customer || '', h.origin || '', h.tipo, h.op]);
    });
    io.emit('state_sync', db.getState());
  });
  
  socket.on('disconnect', () => console.log(`🔌 Client disconnesso: ${socket.id}`));
});

// 🌐 Serve il frontend buildato
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// 🗄️ API: Reset Database
app.post('/api/reset-db', (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  try {
    db.exec('DROP TABLE IF EXISTS history');
    db.exec('DROP TABLE IF EXISTS articles');
    db.exec('DROP TABLE IF EXISTS departments');
    db.run(`CREATE TABLE departments (id TEXT PRIMARY KEY, label TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL)`);
    db.run(`CREATE TABLE articles (id TEXT PRIMARY KEY, dept_id TEXT NOT NULL, descrizione TEXT NOT NULL, qtyNuovo INTEGER DEFAULT 0, qtyRigenerato INTEGER DEFAULT 0)`);
    db.run(`CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, descrizione TEXT NOT NULL, date TEXT NOT NULL, qty INTEGER NOT NULL, customer TEXT DEFAULT '', origin TEXT DEFAULT '', tipo TEXT NOT NULL, operation TEXT NOT NULL)`);
    db.run("INSERT INTO departments VALUES ('antenne','Antenne','Radio','bg-sky-600')");
    db.run("INSERT INTO departments VALUES ('elettrico','Elettrico','Zap','bg-amber-600')");
    db.run("INSERT INTO departments VALUES ('fotovoltaico','Fotovoltaico','Sun','bg-orange-600')");
    db.run("INSERT INTO departments VALUES ('sicurezza','Sicurezza','Shield','bg-rose-600')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('a1','antenne','Antenna DVB-T2')");
    db.run("INSERT INTO articles (id, dept_id, descrizione) VALUES ('e1','elettrico','Cavo 2x1.5mm')");
    db.saveDB();
    io.emit('state_sync', db.getState());
    console.log('🗑️ Database resettato da API');
    res.json({ success: true, message: 'Database resettato' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 💾 API: Backup & Ripristino Database
const upload = multer({ dest: 'uploads/' });

app.get('/api/db/export', (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  const dbPath = path.join(__dirname, 'warehouse.db');
  if (fs.existsSync(dbPath)) {
    res.download(dbPath, `warehouse_backup_${new Date().toISOString().slice(0,10)}.db`);
  } else {
    res.status(404).json({ error: 'Database non trovato' });
  }
});

app.post('/api/db/import', upload.single('dbfile'), (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
  
  try {
    const dbPath = path.join(__dirname, 'warehouse.db');
    // Sostituisce il DB corrente con il backup caricato
    fs.copyFileSync(req.file.path, dbPath);
    fs.unlinkSync(req.file.path); // Rimuove il file temporaneo
    
    res.json({ success: true, message: 'Backup caricato. Riavvio server in corso...' });
    // Riavvia pulito il processo per caricare il nuovo DB da disco
    setTimeout(() => process.exit(0), 800);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 Catch-all per SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/dist/index.html'));
});

// 🚀 Avvio Server
async function startServer() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server attivo su porta ${PORT} | Ambiente: ${process.env.NODE_ENV || 'development'}`));
}
startServer();

// 🛑 Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📴 Server in chiusura...');
  server.close(() => process.exit(0));
});