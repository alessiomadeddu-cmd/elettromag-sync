// server/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors'); // Necessario
const multer = require('multer'); // Necessario
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

// Auth Socket
io.use((socket, next) => {
  if (socket.handshake.auth.key === process.env.ACCESS_KEY) return next();
  next(new Error('Chiave non valida'));
});

io.on('connection', async (socket) => {
  socket.emit('state_sync', await db.getState());

  // ✅ Event Handlers con sintassi PostgreSQL ($1, $2)
  socket.on('add_dept', async (data) => {
    await db.exec('INSERT INTO departments (id, label, icon, color) VALUES ($1, $2, $3, $4)', [data.id, data.label, data.iconName, data.color]);
    io.emit('state_sync', await db.getState());
  });

  socket.on('del_dept', async (deptId) => {
    try {
      await db.exec('DELETE FROM articles WHERE dept_id = $1', [deptId]);
      await db.exec('DELETE FROM departments WHERE id = $1', [deptId]);
      io.emit('state_sync', await db.getState());
    } catch (e) { console.error('Errore del dept:', e); }
  });

  socket.on('update_dept', async ({ id, label }) => {
    try {
      await db.exec('UPDATE departments SET label = $1 WHERE id = $2', [label, id]);
      io.emit('state_sync', await db.getState());
    } catch (e) { console.error('Errore update dept:', e); }
  });

  socket.on('add_art', async (data) => {
    await db.exec('INSERT INTO articles (id, dept_id, descrizione, qtyNuovo, qtyRigenerato) VALUES ($1, $2, $3, 0, 0)', [data.id, data.deptId, data.descrizione]);
    io.emit('state_sync', await db.getState());
  });

  socket.on('update_art', async ({ id, descrizione }) => {
    try {
      await db.exec('UPDATE articles SET descrizione = $1 WHERE id = $2', [descrizione, id]);
      io.emit('state_sync', await db.getState());
    } catch (e) { console.error('Errore update art:', e); }
  });

  socket.on('delete_art', async ({ artId }) => {
    try {
      await db.exec('DELETE FROM articles WHERE id = $1', [artId]);
      io.emit('state_sync', await db.getState());
    } catch (e) { console.error('Errore del art:', e); }
  });

  socket.on('confirm_tx', async (tx) => {
    try {
      if (tx.type === 'realignment') {
        await db.exec('UPDATE articles SET qtyNuovo = $1, qtyRigenerato = $2 WHERE id = $3', [tx.newN, tx.newR, tx.artId]);
      } else {
        await db.exec('UPDATE articles SET qtyNuovo = qtyNuovo + $1, qtyRigenerato = qtyRigenerato + $2 WHERE id = $3', [tx.deltaN, tx.deltaR, tx.artId]);
      }
      for (const h of tx.history) {
        await db.exec('INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES ($1, $2, $3, $4, $5, $6, $7)', [h.desc, h.date, h.qty, h.customer || '', h.origin || '', h.tipo, h.op]);
      }
      io.emit('state_sync', await db.getState());
    } catch (e) { console.error('Errore tx:', e); }
  });
});

// 🌐 Frontend Statico
app.use(express.static(path.join(__dirname, '../frontend/dist')));

const upload = multer({ dest: 'uploads/' });

// 💾 Backup (Esporta JSON)
app.get('/api/db/export', async (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  try {
    const data = await db.getState();
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 📥 Restore (Importa JSON)
app.post('/api/db/import', upload.single('dbfile'), async (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  if (!req.file) return res.status(400).json({ error: 'File mancante' });
  try {
    const data = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
    fs.unlinkSync(req.file.path);

    // Pulisci DB e ripristina
    await db.exec('TRUNCATE TABLE history, articles, departments RESTART IDENTITY CASCADE');
    if (data.departments?.length) {
      for (const d of data.departments) await db.exec('INSERT INTO departments VALUES ($1,$2,$3,$4)', [d.id, d.label, d.icon, d.color]);
    }
    if (data.articles?.length) {
      for (const a of data.articles) await db.exec('INSERT INTO articles VALUES ($1,$2,$3,$4,$5)', [a.id, a.dept_id, a.descrizione, a.qtynuovo, a.qtyrigenerato]);
    }
    if (data.history?.length) {
      for (const h of data.history) await db.exec('INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES ($1,$2,$3,$4,$5,$6,$7)', [h.descrizione, h.date, h.qty, h.customer, h.origin, h.tipo, h.operation]);
    }
    
    io.emit('state_sync', await db.getState());
    res.json({ success: true, message: 'Ripristino completato' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 🔄 Reset
app.post('/api/reset-db', async (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({ error: 'Accesso negato' });
  try {
    await db.exec('TRUNCATE TABLE history, articles, departments RESTART IDENTITY CASCADE');
    await db.exec("INSERT INTO departments VALUES ('antenne','Antenne','Radio','bg-sky-600'), ('elettrico','Elettrico','Zap','bg-amber-600'), ('fotovoltaico','Fotovoltaico','Sun','bg-orange-600'), ('sicurezza','Sicurezza','Shield','bg-rose-600')");
    await db.exec("INSERT INTO articles (id, dept_id, descrizione) VALUES ('a1','antenne','Antenna DVB-T2'), ('e1','elettrico','Cavo 2x1.5mm')");
    io.emit('state_sync', await db.getState());
    res.json({ success: true, message: 'Reset completato' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

async function startServer() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server attivo su porta ${PORT}`));
}
startServer();