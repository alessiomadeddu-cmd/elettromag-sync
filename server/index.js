require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./db');

const app = express();
const server = http.createServer(app);

// Configura Socket.IO con CORS permissive per il deploy cloud
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
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

// Gestione connessioni
io.on('connection', (socket) => {
  console.log(`🔌 Nuovo client connesso: ${socket.id}`);
  
  // Invia stato iniziale completo
  socket.emit('state_sync', db.getState());
  
  // 📁 Aggiungi reparto
  socket.on('add_dept', (data) => {
    console.log(`➕ Nuovo reparto: ${data.label}`);
    db.exec(
      'INSERT INTO departments (id, label, icon, color) VALUES (?, ?, ?, ?)',
      [data.id, data.label, data.iconName, data.color]
    );
    io.emit('state_sync', db.getState());
  });
  
  // 🗑️ Elimina reparto
  socket.on('del_dept', (deptId) => {
    console.log(`🗑️ Elimina reparto: ${deptId}`);
    db.exec('DELETE FROM departments WHERE id = ?', [deptId]);
    io.emit('state_sync', db.getState());
  });
  
  // 📦 Aggiungi articolo
  socket.on('add_art', (data) => {
    console.log(`📦 Nuovo articolo: ${data.descrizione} in ${data.deptId}`);
    db.exec(
      'INSERT INTO articles (id, dept_id, descrizione, qtyNuovo, qtyRigenerato) VALUES (?, ?, ?, 0, 0)',
      [data.id, data.deptId, data.descrizione]
    );
    io.emit('state_sync', db.getState());
  });
  
  // ✅ Conferma transazione (carico/scarico/riallineamento)
  socket.on('confirm_tx', (tx) => {
    console.log(`✅ Transazione: ${tx.type} su articolo ${tx.artId}`);
    
    if (tx.type === 'realignment') {
      // Riallineamento: imposta valori assoluti
      db.exec(
        'UPDATE articles SET qtyNuovo = ?, qtyRigenerato = ? WHERE id = ?',
        [tx.newN, tx.newR, tx.artId]
      );
    } else {
      // Carico/Scarico: incrementa/decrementa
      db.exec(
        'UPDATE articles SET qtyNuovo = qtyNuovo + ?, qtyRigenerato = qtyRigenerato + ? WHERE id = ?',
        [tx.deltaN, tx.deltaR, tx.artId]
      );
    }
    
    // Salva nello storico
    tx.history.forEach(h => {
      db.exec(
        'INSERT INTO history (descrizione, date, qty, customer, origin, tipo, operation) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [h.desc, h.date, h.qty, h.customer || '', h.origin || '', h.tipo, h.op]
      );
    });
    
    // Invia stato aggiornato a tutti i client
    io.emit('state_sync', db.getState());
  });
  
  // Disconnessione
  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnesso: ${socket.id}`);
  });
});

// 🌐 Serve il frontend buildato come file statici
// ✅ MODIFICA CHIAVE: punta a ../dist (nella root) invece di ../frontend/dist
app.use(express.static(path.join(__dirname, '../frontend/dist')));

// Catch-all route: invia index.html per qualsiasi route (SPA)
// ✅ MODIFICA CHIAVE: punta a ../dist/index.html
app.get('*', (_, res) => res.sendFile(path.join(__dirname, '../frontend/dist/index.html')));

// Avvia server SOLO dopo che il DB è stato inizializzato
async function startServer() {
  await db.initDB();
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log('🚀 ==================================');
    console.log('🚀 ElettroMag Sync Server Attivo');
    console.log('🚀 Porta:', PORT);
    console.log('🚀 Ambiente:', process.env.NODE_ENV || 'development');
    console.log('🚀 ==================================');
  });
}

startServer();

// Graceful shutdown per deploy puliti
process.on('SIGTERM', () => {
  console.log('📴 Server in chiusura...');
  server.close(() => {
    console.log('✅ Server chiuso');
    process.exit(0);
  });
});