require('dotenv').config();
console.log('🔑 Chiave caricata:', process.env.ACCESS_KEY);
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// 🔐 Auth Socket
io.use((socket, next) => {
  if (socket.handshake.auth.key === process.env.ACCESS_KEY) return next();
  next(new Error('Chiave non valida'));
});

io.on('connection', (socket) => {
  console.log('✅ Connesso:', socket.id);
  socket.emit('state_sync', db.getState());

  socket.on('add_dept', (d) => {
    db.exec('INSERT INTO departments VALUES (?, ?, ?, ?)', [d.id, d.label, d.iconName, d.color]);
    io.emit('state_sync', db.getState());
  });

  socket.on('del_dept', (id) => {
    db.exec('DELETE FROM departments WHERE id = ?', [id]);
    io.emit('state_sync', db.getState());
  });

  socket.on('add_art', (a) => {
    db.exec('INSERT INTO articles (id, dept_id, descrizione) VALUES (?, ?, ?)', [a.id, a.deptId, a.descrizione]);
    io.emit('state_sync', db.getState());
  });

  socket.on('confirm_tx', (tx) => {
    console.log('🔄 confirm_tx ricevuto:', tx.artId, 'tipo:', tx.type); // <-- Aggiungi questa riga
    if (tx.type === 'realignment') {
      db.exec('UPDATE articles SET qtyNuovo = ?, qtyRigenerato = ? WHERE id = ?', [tx.newN, tx.newR, tx.artId]);
    } else {
      db.exec('UPDATE articles SET qtyNuovo = qtyNuovo + ?, qtyRigenerato = qtyRigenerato + ? WHERE id = ?', [tx.deltaN, tx.deltaR, tx.artId]);
    }
    tx.history.forEach(h => db.exec('INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [h.desc, h.date, h.qty, h.customer || '', h.origin || '', h.tipo, h.op]));
    io.emit('state_sync', db.getState());
  });

  socket.on('disconnect', () => console.log('🔌 Disconnesso:', socket.id));
});

// 🌐 Serve frontend
app.use(express.static(path.join(__dirname, '../frontend/dist')));
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

// Avvio async sicuro
async function start() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => console.log(`🚀 Server attivo su http://localhost:${PORT}`));
}
start();