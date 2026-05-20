import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug,
  Plus, Minus, History, Settings, LogOut, RotateCcw, Trash2, AlertTriangle
} from 'lucide-react';

const ICON_NAMES = ['Radio', 'Zap', 'Sun', 'Shield', 'Package', 'Wrench', 'Lightbulb', 'Server', 'Battery', 'Plug'];
const COLOR_POOL = ['bg-purple-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-lime-600', 'bg-orange-500', 'bg-emerald-600', 'bg-teal-600', 'bg-blue-600', 'bg-violet-600'];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authKey, setAuthKey] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [data, setData] = useState({ departments: [], articles: [], history: [] });
  const [view, setView] = useState('home');
  const [modal, setModal] = useState({ isOpen: false, type: '', deptId: '', articleId: '', targetType: 'N', qty: '', customer: '', origin: '', descrizione: '', newQtyN: '', newQtyR: '' });
  const [addDeptModal, setAddDeptModal] = useState({ isOpen: false, name: '' });
  const [delDeptModal, setDelDeptModal] = useState({ isOpen: false, deptId: '', label: '' });
  const [delOk, setDelOk] = useState(false);
  const [resetting, setResetting] = useState(false);
  const sock = useRef(null);

  // 🔌 Connessione Socket
  const connect = (key) => {
    const url = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
    const s = io(url, { auth: { key }, reconnection: true, reconnectionDelay: 1000, transports: ['websocket', 'polling'] });
    s.on('connect', () => setIsOnline(true));
    s.on('disconnect', () => setIsOnline(false));
    s.on('state_sync', (newState) => { setData(newState); setIsOnline(true); });
    s.on('connect_error', () => setIsOnline(false));
    sock.current = s;
  };

  useEffect(() => {
    const savedKey = localStorage.getItem('em_auth_key');
    if (savedKey) {
      setAuthKey(savedKey);
      connect(savedKey);
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!authKey.trim()) return;
    connect(authKey.trim());
    localStorage.setItem('em_auth_key', authKey.trim());
    setIsAuthenticated(true);
  };

  const logout = () => {
    sock.current?.disconnect();
    localStorage.removeItem('em_auth_key');
    setIsAuthenticated(false);
    setAuthKey('');
    setData({ departments: [], articles: [], history: [] });
  };

  // 📦 Gestione Transazioni
  const openModal = (type, deptId, artId) => {
    const art = data.articles[deptId]?.find(a => a.id === artId);
    setModal({
      isOpen: true, type, deptId, articleId: artId,
      targetType: 'N', qty: '', customer: '', origin: '', descrizione: art?.descrizione || '',
      newQtyN: art?.qtyNuovo.toString() || '0', newQtyR: art?.qtyRigenerato.toString() || '0'
    });
  };

  const confirmTx = () => {
    const now = new Date().toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    let dN = 0, dR = 0, hist = [];

    if (modal.type === 'realignment') {
      const nN = parseInt(modal.newQtyN) || 0, nR = parseInt(modal.newQtyR) || 0;
      const art = data.articles[modal.deptId]?.find(a => a.id === modal.articleId);
      if (art) {
        dN = nN - art.qtyNuovo;
        dR = nR - art.qtyRigenerato;
        if (dN !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dN, customer: '', origin: '', tipo: 'Nuovo', op: 'realignment' });
        if (dR !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dR, customer: '', origin: '', tipo: 'Rigenerato', op: 'realignment' });
      }
    } else {
      const q = parseInt(modal.qty);
      if (isNaN(q) || q <= 0 || (modal.type === 'unload' && !modal.customer.trim())) return alert('Quantità o cliente non validi');
      if (modal.type === 'load') {
        modal.targetType === 'N' ? dN = q : dR = q;
      } else {
        modal.targetType === 'N' ? dN = -q : dR = -q;
      }
      hist.push({ desc: modal.descrizione, date: now, qty: q, customer: modal.customer.trim(), origin: modal.origin.trim(), tipo: modal.targetType === 'N' ? 'Nuovo' : 'Rigenerato', op: modal.type });
    }

    sock.current?.emit('confirm_tx', { 
      type: modal.type, artId: modal.articleId, 
      newN: parseInt(modal.newQtyN) || 0, newR: parseInt(modal.newQtyR) || 0, 
      deltaN: dN, deltaR: dR, history: hist 
    });
    closeModal();
  };

  const closeModal = () => setModal({ ...modal, isOpen: false });

  // 🏢 Gestione Reparti
  const addDept = () => {
    if (!addDeptModal.name.trim() || data.departments.some(x => x.label.toLowerCase() === addDeptModal.name.trim().toLowerCase())) return;
    const idx = data.departments.length;
    const nd = { id: `d${Date.now()}`, label: addDeptModal.name.trim(), iconName: ICON_NAMES[idx % ICON_NAMES.length], color: COLOR_POOL[idx % COLOR_POOL.length] };
    sock.current?.emit('add_dept', nd);
    setAddDeptModal({ isOpen: false, name: '' });
  };

  const delDept = (deptId, label) => {
    setDelDeptModal({ isOpen: true, deptId, label });
    setDelOk(false);
  };

  const delExec = () => {
    if (!delDeptModal.deptId) return;
    sock.current?.emit('del_dept', delDeptModal.deptId);
    setDelDeptModal({ isOpen: false, deptId: '', label: '' });
    setDelOk(false);
  };

  // 🗄️ Reset Database
  const resetDb = async () => {
    if (!window.confirm('⚠️ ATTENZIONE: Questo cancellerà TUTTI i dati (reparti, articoli, storico) e ripristinerà lo stato iniziale. Continuare?')) return;
    setResetting(true);
    try {
      const key = authKey || localStorage.getItem('em_auth_key');
      const res = await fetch(`${window.location.origin}/api/reset-db?key=${key}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) {
        alert('✅ Database resettato con successo!');
        window.location.reload();
      } else {
        alert('❌ Errore: ' + (result.error || 'Sconosciuto'));
      }
    } catch (e) {
      alert('❌ Errore di connessione: ' + e.message);
    } finally {
      setResetting(false);
    }
  };

  // 🔑 Login Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-2xl w-full max-w-sm border border-gray-700 shadow-xl">
          <div className="flex justify-center mb-6 text-4xl">⚡</div>
          <h2 className="text-2xl font-bold text-white text-center mb-6">Accesso Richiesto</h2>
          <input
            type="password"
            value={authKey}
            onChange={e => setAuthKey(e.target.value)}
            placeholder="Chiave di accesso"
            className="w-full p-3 bg-gray-700 text-white rounded-xl mb-4 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
          <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">Accedi</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4 sticky top-0 z-10">
        <div className="flex justify-between items-center max-w-4xl mx-auto">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h1 className="text-xl font-bold">ElettroMag Sync</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full ${isOnline ? 'bg-green-900 text-green-400' : 'bg-red-900 text-red-400'}`}>
              {isOnline ? '🟢 Online' : '🔴 Sync...'}
            </span>
            <button onClick={() => setView('home')} className="p-2 hover:bg-gray-700 rounded-lg transition" title="Home">🏠</button>
            <button onClick={() => setView('history')} className="p-2 hover:bg-gray-700 rounded-lg transition" title="Storico">📖</button>
            <button onClick={() => setView('settings')} className="p-2 hover:bg-gray-700 rounded-lg transition" title="Impostazioni">⚙️</button>
            <button onClick={logout} className="p-2 hover:bg-gray-700 rounded-lg transition text-red-400" title="Esci"><LogOut size={18}/></button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-20">
        {/* HOME VIEW */}
        {view === 'home' && (
          <div className="space-y-6">
            {data.departments.map(dept => {
              const iconMap = { Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug };
              const Icon = iconMap[dept.iconName] || Package;
              const arts = data.articles[dept.id] || [];
              return (
                <div key={dept.id} className={`${dept.color} rounded-2xl p-4 shadow-lg`}>
                  <div className="flex items-center gap-3 mb-4">
                    <Icon size={24} />
                    <h2 className="text-xl font-bold">{dept.label}</h2>
                  </div>
                  {arts.length === 0 ? <p className="text-gray-200 opacity-80 italic">Nessun articolo</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {arts.map(art => (
                        <div key={art.id} className="bg-gray-900/40 backdrop-blur rounded-xl p-3 flex justify-between items-center">
                          <span className="font-medium truncate mr-2">{art.descrizione}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button onClick={() => openModal('load', dept.id, art.id)} className="bg-green-600 hover:bg-green-500 p-2 rounded-lg transition"><Plus size={16}/></button>
                            <span className="text-xs bg-gray-800 px-2 py-1 rounded">N:{art.qtyNuovo} R:{art.qtyRigenerato}</span>
                            <button onClick={() => openModal('unload', dept.id, art.id)} className="bg-red-600 hover:bg-red-500 p-2 rounded-lg transition"><Minus size={16}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY VIEW */}
        {view === 'history' && (
          <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700/50 font-bold text-lg">📖 Storico Movimenti</div>
            <div className="divide-y divide-gray-700/50">
              {data.history.length === 0 ? <div className="p-6 text-center text-gray-400">Nessuna operazione registrata</div> :
                data.history.map(h => {
                  const op = h.operation || h.op || '';
                  const c = h.tipo === 'Nuovo' ? 'text-green-400' : h.tipo === 'Rigenerato' ? 'text-yellow-400' : 'text-blue-400';
                  const q = op === 'unload' ? `-${h.qty}` : `+${h.qty}`;
                  const d = h.customer ? `Cli: ${h.customer}` : h.origin ? `Org: ${h.origin}` : '-';
                  const bg = op === 'load' ? 'bg-green-900/35' : 'bg-red-900/20';
                  return (
                    <div key={h.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-700/50 hover:bg-gray-600/20 text-sm ${bg}`}>
                      <div className="col-span-3 text-gray-400 truncate">{h.date}</div>
                      <div className="col-span-3 text-gray-200 truncate">{h.descrizione}</div>
                      <div className={`col-span-3 text-center font-semibold tabular-nums ${c}`}>{q}</div>
                      <div className="col-span-3 text-gray-300 truncate">{d}</div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* SETTINGS VIEW */}
        {view === 'settings' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-2xl p-5 border border-gray-700">
              <h3 className="text-lg font-bold mb-4">🏢 Gestione Reparti</h3>
              <button onClick={() => setAddDeptModal({ isOpen: true, name: '' })} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center justify-center gap-2 transition mb-4">
                <Plus size={18}/> Nuovo Reparto
              </button>
              <div className="space-y-2">
                {data.departments.map(d => (
                  <div key={d.id} className="flex justify-between items-center bg-gray-900/50 p-3 rounded-xl">
                    <span className="font-medium">{d.label}</span>
                    <button onClick={() => delDept(d.id, d.label)} className="text-red-400 hover:text-red-300 p-2 transition"><Trash2 size={18}/></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-2xl p-5 border border-red-900/50">
              <h3 className="text-lg font-bold text-red-400 mb-2">⚠️ Zona Pericolosa</h3>
              <p className="text-sm text-gray-400 mb-4">Il reset cancella tutti i dati e ripristina i reparti/articoli iniziali.</p>
              <button
                disabled={resetting}
                onClick={resetDb}
                className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition ${resetting ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-900/60 text-red-200 hover:bg-red-900/80'}`}
              >
                {resetting ? '⏳ Reset in corso...' : <><RotateCcw size={20}/> Reset Completo Database</>}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODALE TRANSAZIONI */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={closeModal}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{modal.type === 'load' ? '📥 Carico' : modal.type === 'unload' ? '📤 Scarico' : '🔄 Riallineamento'}</h3>
            <div className="space-y-3 mb-4">
              {modal.type !== 'realignment' && (
                <>
                  <input type="number" value={modal.qty} onChange={e => setModal({...modal, qty: e.target.value})} placeholder="Quantità" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                  <select value={modal.targetType} onChange={e => setModal({...modal, targetType: e.target.value})} className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600">
                    <option value="N">Nuovo</option>
                    <option value="R">Rigenerato</option>
                  </select>
                  {modal.type === 'unload' && <input type="text" value={modal.customer} onChange={e => setModal({...modal, customer: e.target.value})} placeholder="Cliente / Destinazione" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />}
                  {modal.type === 'load' && <input type="text" value={modal.origin} onChange={e => setModal({...modal, origin: e.target.value})} placeholder="Origine / Fornitore" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />}
                </>
              )}
              {modal.type === 'realignment' && (
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" value={modal.newQtyN} onChange={e => setModal({...modal, newQtyN: e.target.value})} placeholder="Qty Nuovo" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                  <input type="number" value={modal.newQtyR} onChange={e => setModal({...modal, newQtyR: e.target.value})} placeholder="Qty Rigenerato" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl">Annulla</button>
              <button onClick={confirmTx} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold">Conferma</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE NUOVO REPARTO */}
      {addDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={() => setAddDeptModal({isOpen:false, name:''})}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">➕ Nuovo Reparto</h3>
            <input type="text" value={addDeptModal.name} onChange={e => setAddDeptModal({...addDeptModal, name: e.target.value})} placeholder="Nome reparto" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600 mb-4" autoFocus />
            <div className="flex gap-3">
              <button onClick={() => setAddDeptModal({isOpen:false, name:''})} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl">Annulla</button>
              <button onClick={addDept} className="flex-1 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold">Crea</button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE ELIMINA REPARTO (FIXATA) */}
      {delDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={() => { setDelDeptModal({isOpen:false, deptId:'', label:''}); setDelOk(false); }}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-red-900/50 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2">
              <AlertTriangle size={24} /> Elimina Reparto
            </h3>
            <p className="text-gray-300 mb-6">Sei sicuro di voler eliminare <strong className="text-white">"{delDeptModal.label}"</strong> e tutti i suoi articoli? L'operazione è irreversibile.</p>

            <div className="flex items-center gap-3 mb-6 p-4 bg-gray-900/50 rounded-xl border border-gray-700">
              <input
                type="checkbox"
                id="confirm-delete"
                checked={delOk}
                onChange={e => {
                  e.stopPropagation(); // Impedisce la chiusura della modale
                  setDelOk(e.target.checked);
                }}
                onClick={e => e.stopPropagation()} // Doppia sicurezza per click
                className="w-5 h-5 rounded border-gray-500 text-red-600 focus:ring-red-500 bg-gray-700 cursor-pointer"
              />
              <label htmlFor="confirm-delete" className="text-sm text-gray-200 cursor-pointer select-none">
                Confermo la cancellazione definitiva
              </label>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setDelDeptModal({isOpen:false, deptId:'', label:''}); setDelOk(false); }}
                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition"
              >
                Annulla
              </button>
              <button
                disabled={!delOk}
                onClick={delExec}
                className={`flex-1 py-3 rounded-xl font-bold transition ${
                  delOk ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                }`}
              >
                {delOk ? '✅ Elimina Ora' : 'Spunta per abilitare'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}