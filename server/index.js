// server/index.js - ES Module Version
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
const upload = multer({ dest: 'uploads/' });

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });

io.use((socket, next) => {
  if (socket.handshake.auth.key === process.env.ACCESS_KEY) return next();
  next(new Error('Chiave non valida'));
});

io.on('connection', async (socket) => {
  const state = await db.getState();
  socket.emit('state_sync', state);
  socket.emit('sync_appts', { appointments: state.appointments || [] });

  // MAGAZZINO
  socket.on('add_dept', async (data) => {
    await db.exec('INSERT INTO departments VALUES ($1,$2,$3,$4)', [data.id, data.label, data.iconName, data.color]);
    io.emit('state_sync', await db.getState());
  });
  socket.on('del_dept', async (id) => {
    await db.exec('DELETE FROM articles WHERE dept_id = $1', [id]);
    await db.exec('DELETE FROM departments WHERE id = $1', [id]);
    io.emit('state_sync', await db.getState());
  });
  socket.on('add_art', async (data) => {
    await db.exec('INSERT INTO articles VALUES ($1,$2,$3,0,0)', [data.id, data.deptId, data.descrizione]);
    io.emit('state_sync', await db.getState());
  });
  socket.on('confirm_tx', async (tx) => {
    if (tx.type === 'realignment') {
      await db.exec('UPDATE articles SET qtyNuovo=$1, qtyRigenerato=$2 WHERE id=$3', [tx.newN, tx.newR, tx.artId]);
    } else {
      await db.exec('UPDATE articles SET qtyNuovo=qtyNuovo+$1, qtyRigenerato=qtyRigenerato+$2 WHERE id=$3', [tx.deltaN, tx.deltaR, tx.artId]);
    }
    for (const h of tx.history) {
      await db.exec('INSERT INTO history (descrizione,date,qty,customer,origin,tipo,operation) VALUES ($1,$2,$3,$4,$5,$6,$7)', [h.desc,h.date,h.qty,h.customer||'',h.origin||'',h.tipo,h.op]);
    }
    io.emit('state_sync', await db.getState());
  });

  // ✅ AGENDA (FIX UPDATE)
  socket.on('add_appt', async (data) => {
    try {
      console.log('➕ ADD:', data);
      await db.exec('INSERT INTO appointments VALUES ($1, $2, $3, $4, $5)', 
        [data.id, data.title, data.date, data.time, data.operator]);
      io.emit('sync_appts', { appointments: (await db.query('SELECT * FROM appointments ORDER BY date DESC, time DESC')).rows });
    } catch (e) { console.error('Errore add:', e); }
  });

  socket.on('update_appt', async (data) => {
    try {
      console.log('✏️ UPDATE:', data);
      // Aggiorna SOLO i campi modificati, mantenendo l'ID originale
      await db.exec('UPDATE appointments SET title=$1, date=$2, time=$3, operator=$4 WHERE id=$5', 
        [data.title, data.date, data.time, data.operator, data.id]);
      io.emit('sync_appts', { appointments: (await db.query('SELECT * FROM appointments ORDER BY date DESC, time DESC')).rows });
    } catch (e) { console.error('Errore update:', e); }
  });

  socket.on('delete_appt', async ({id}) => {
    await db.exec('DELETE FROM appointments WHERE id = $1', [id]);
    io.emit('sync_appts', { appointments: (await db.query('SELECT * FROM appointments ORDER BY date DESC, time DESC')).rows });
  });
});

// API BACKUP/RESTORE
app.get('/api/db/export', async (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({error:'Accesso negato'});
  try {
    const state = await db.getState();
    res.setHeader('Content-Type', 'application/json');
    res.json(state);
  } catch(e) { res.status(500).json({error: e.message}); }
});

app.post('/api/db/import', upload.single('dbfile'), async (req, res) => {
  if (req.query.key !== process.env.ACCESS_KEY) return res.status(403).json({error:'Accesso negato'});
  if (!req.file) return res.status(400).json({error:'File mancante'});
  try {
    const data = JSON.parse(fs.readFileSync(req.file.path, 'utf8'));
    fs.unlinkSync(req.file.path);
    await db.exec('TRUNCATE TABLE history, articles, departments, appointments RESTART IDENTITY CASCADE');
    if (data.departments) for (const d of data.departments) await db.exec('INSERT INTO departments VALUES ($1,$2,$3,$4)', [d.id,d.label,d.icon,d.color]);
    if (data.articles) for (const a of data.articles) await db.exec('INSERT INTO articles VALUES ($1,$2,$3,$4,$5)', [a.id,a.dept_id,a.descrizione,a.qtynuovo||0,a.qtyrigenerato||0]);
    if (data.history) for (const h of data.history) await db.exec('INSERT INTO history (descrizione,date,qty,customer,origin,tipo,operation) VALUES ($1,$2,$3,$4,$5,$6,$7)', [h.descrizione,h.date,h.qty,h.customer,h.origin,h.tipo,h.operation]);
    if (data.appointments) for (const a of data.appointments) await db.exec('INSERT INTO appointments VALUES ($1,$2,$3,$4,$5)', [a.id,a.title,a.date,a.time,a.operator]);
    io.emit('state_sync', await db.getState());
    res.json({success:true, message:'Ripristino completato'});
  } catch(e) {
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({error: e.message});
  }
});

app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

async function start() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server su porta ${PORT}`));
}
start();