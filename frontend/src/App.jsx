import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug,
  Plus, Minus, History, Settings, LogOut, RotateCcw, Trash2, AlertTriangle, ArrowLeft
} from 'lucide-react';

const ICON_NAMES = ['Radio', 'Zap', 'Sun', 'Shield', 'Package', 'Wrench', 'Lightbulb', 'Server', 'Battery', 'Plug'];
const COLOR_POOL = ['bg-purple-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-lime-600', 'bg-orange-500', 'bg-emerald-600', 'bg-teal-600', 'bg-blue-600', 'bg-violet-600'];

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authKey, setAuthKey] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [data, setData] = useState({ departments: [], articles: [], history: [] });
  const [view, setView] = useState('home'); // home | history | settings
  const [selectedDept, setSelectedDept] = useState(null);
  
  // Modali & Stati
  const [modal, setModal] = useState({ isOpen: false, type: '', deptId: '', articleId: '', targetType: 'N', qty: '', customer: '', origin: '', descrizione: '', newQtyN: '', newQtyR: '' });
  const [addDeptModal, setAddDeptModal] = useState({ isOpen: false, name: '' });
  const [delDeptModal, setDelDeptModal] = useState({ isOpen: false, deptId: '', label: '' });
  const [delOk, setDelOk] = useState(false);
  const [deleteArtConfirm, setDeleteArtConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  
  const sock = useRef(null);

  // 🔌 Socket
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

  // 📦 Transazioni
  const openModal = (type, deptId, artId) => {
    const art = data.articles.find(a => a.id === artId);
    setModal({
      isOpen: true, type, deptId, articleId: artId,
      targetType: 'N', qty: '', customer: '', origin: '', descrizione: art?.descrizione || '',
      newQtyN: art?.qtyNuovo?.toString() || '0', newQtyR: art?.qtyRigenerato?.toString() || '0'
    });
    setDeleteArtConfirm(false);
  };

  const confirmTx = () => {
    const now = new Date().toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    let dN = 0, dR = 0, hist = [];

    if (modal.type === 'realignment') {
      const nN = parseInt(modal.newQtyN) || 0, nR = parseInt(modal.newQtyR) || 0;
      const art = data.articles.find(a => a.id === modal.articleId);
      if (art) {
        dN = nN - art.qtyNuovo;
        dR = nR - art.qtyRigenerato;
        if (dN !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dN, customer: '', origin: '', tipo: 'Nuovo', op: 'realignment' });
        if (dR !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dR, customer: '', origin: '', tipo: 'Rigenerato', op: 'realignment' });
      }
    } else {
      const q = parseInt(modal.qty);
      if (isNaN(q) || q <= 0 || (modal.type === 'unload' && !modal.customer.trim())) return alert('Quantità o cliente non validi');
      if (modal.type === 'load') modal.targetType === 'N' ? dN = q : dR = q;
      else modal.targetType === 'N' ? dN = -q : dR = -q;
      hist.push({ desc: modal.descrizione, date: now, qty: q, customer: modal.customer.trim(), origin: modal.origin.trim(), tipo: modal.targetType === 'N' ? 'Nuovo' : 'Rigenerato', op: modal.type });
    }

    sock.current?.emit('confirm_tx', { type: modal.type, artId: modal.articleId, newN: parseInt(modal.newQtyN)||0, newR: parseInt(modal.newQtyR)||0, deltaN: dN, deltaR: dR, history: hist });
    closeModal();
  };

  const closeModal = () => {
    setModal({ ...modal, isOpen: false });
    setDeleteArtConfirm(false);
  };

  // 🏢 Reparti
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

  // 🗄️ Reset
  const resetDb = async () => {
    if (!window.confirm('⚠️ ATTENZIONE: Questo cancellerà TUTTI i dati e ripristinerà lo stato iniziale. Continuare?')) return;
    setResetting(true);
    try {
      const key = authKey || localStorage.getItem('em_auth_key');
      const res = await fetch(`${window.location.origin}/api/reset-db?key=${key}`, { method: 'POST' });
      const result = await res.json();
      if (result.success) { alert('✅ Database resettato!'); window.location.reload(); }
      else alert('❌ Errore: ' + (result.error || 'Sconosciuto'));
    } catch (e) { alert('❌ Errore di connessione: ' + e.message); }
    finally { setResetting(false); }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-2xl w-full max-w-sm border border-gray-700 shadow-xl">
          <div className="flex justify-center mb-6 text-4xl">⚡</div>
          <h2 className="text-2xl font-bold text-white text-center mb-6">Accesso Richiesto</h2>
          <input type="password" value={authKey} onChange={e => setAuthKey(e.target.value)} placeholder="Chiave di accesso" className="w-full p-3 bg-gray-700 text-white rounded-xl mb-4 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500" autoFocus />
          <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition">Accedi</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* HEADER PULITO & iOS SAFE-AREA */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-4 sticky top-0 z-10" style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}>
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <h1 className="text-lg font-bold tracking-wide">ElettroMag Sync</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${isOnline ? 'bg-green-900/80 text-green-400' : 'bg-red-900/80 text-red-400'}`}>
              {isOnline ? '🟢 Online' : '🔴 Sync...'}
            </span>
            <nav className="flex items-center gap-1">
              <button onClick={() => { setView('home'); setSelectedDept(null); }} className={`p-2 rounded-lg transition ${view === 'home' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>🏠</button>
              <button onClick={() => setView('history')} className={`p-2 rounded-lg transition ${view === 'history' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>📖</button>
              <button onClick={() => setView('settings')} className={`p-2 rounded-lg transition ${view === 'settings' ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>⚙️</button>
              <button onClick={logout} className="p-2 rounded-lg transition text-gray-400 hover:text-red-400" title="Esci"><LogOut size={18}/></button>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 pb-8" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
        
        {/* 🏠 HOME VIEW */}
        {view === 'home' && (
          <div className="space-y-4">
            {!selectedDept ? (
              <>
                <h2 className="text-xl font-bold text-gray-300 mb-2">Reparti</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {data.departments.map(dept => {
                    const iconMap = { Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug };
                    const Icon = iconMap[dept.iconName] || Package;
                    return (
                      <button 
                        key={dept.id} 
                        onClick={() => setSelectedDept(dept.id)}
                        className={`${dept.color} p-6 rounded-2xl shadow-lg flex items-center justify-between hover:scale-[1.02] transition active:scale-95 text-left`}
                      >
                        <div className="flex items-center gap-4">
                          <Icon size={28} />
                          <span className="text-xl font-bold">{dept.label}</span>
                        </div>
                        <span className="text-sm bg-black/20 px-3 py-1 rounded-full">
                          {data.articles.filter(a => a.dept_id === dept.id).length} articoli
                        </span>
                      </button>
                    );
                  })}
                </div>
                {data.departments.length === 0 && <p className="text-center text-gray-500 mt-10">Nessun reparto creato. Vai in Impostazioni per aggiungerne uno.</p>}
              </>
            ) : (
              <>
                {/* Dettaglio Reparto */}
                <button onClick={() => setSelectedDept(null)} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition">
                  <ArrowLeft size={18} /> Torna ai reparti
                </button>
                {(() => {
                  const dept = data.departments.find(d => d.id === selectedDept);
                  if (!dept) return null;
                  const arts = data.articles.filter(a => a.dept_id === selectedDept);
                  return (
                    <div className="bg-gray-800 rounded-2xl border border-gray-700 overflow-hidden">
                      <div className={`${dept.color} p-5`}>
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                          <span className="bg-white/20 p-2 rounded-lg">{(() => {
                            const iconMap = { Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug };
                            const Icon = iconMap[dept.iconName] || Package;
                            return <Icon size={24} />;
                          })()}</span>
                          {dept.label}
                        </h2>
                      </div>
                      <div className="p-4 space-y-3">
                        {arts.length === 0 ? (
                          <p className="text-center text-gray-400 py-6">Nessun articolo in questo reparto</p>
                        ) : (
                          arts.map(art => (
                            <div key={art.id} className="bg-gray-700/50 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <span className="font-semibold text-lg">{art.descrizione}</span>
                              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                                <div className="flex gap-4 text-sm">
                                  <span className="bg-gray-800 px-3 py-1 rounded-lg">Nuovo: <b>{art.qtyNuovo}</b></span>
                                  <span className="bg-gray-800 px-3 py-1 rounded-lg">Rig.: <b>{art.qtyRigenerato}</b></span>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => openModal('load', dept.id, art.id)} className="bg-green-600 hover:bg-green-500 p-2.5 rounded-xl transition"><Plus size={20}/></button>
                                  <button onClick={() => openModal('unload', dept.id, art.id)} className="bg-red-600 hover:bg-red-500 p-2.5 rounded-xl transition"><Minus size={20}/></button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* 📖 STORICO VIEW */}
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

        {/* ⚙️ IMPOSTAZIONI VIEW */}
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
              <button disabled={resetting} onClick={resetDb} className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition ${resetting ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-red-900/60 text-red-200 hover:bg-red-900/80'}`}>
                {resetting ? '⏳ Reset in corso...' : <><RotateCcw size={20}/> Reset Completo Database</>}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* MODALE TRANSAZIONI */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{modal.type === 'load' ? '📥 Carico' : modal.type === 'unload' ? '📤 Scarico' : '🔄 Riallineamento'}</h3>
            <div className="space-y-3 mb-4">
              {modal.type !== 'realignment' && (
                <>
                  <input type="number" value={modal.qty} onChange={e => setModal({...modal, qty: e.target.value})} placeholder="Quantità" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                  <select value={modal.targetType} onChange={e => setModal({...modal, targetType: e.target.value})} className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600">
                    <option value="N">Nuovo</option><option value="R">Rigenerato</option>
                  </select>
                  {modal.type === 'unload' && <input type="text" value={modal.customer} onChange={e => setModal({...modal, customer: e.target.value})} placeholder="Cliente / Destinazione" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />}
                  {modal.type === 'load' && <input type="text" value={modal.origin} onChange={e => setModal({...modal, origin: e.target.value})} placeholder="Origine / Fornitore" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />}
                </>
              )}
              {modal.type === 'realignment' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input type="number" value={modal.newQtyN} onChange={e => setModal({...modal, newQtyN: e.target.value})} placeholder="Qty Nuovo" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                    <input type="number" value={modal.newQtyR} onChange={e => setModal({...modal, newQtyR: e.target.value})} placeholder="Qty Rigenerato" className="w-full p-3 bg-gray-700 rounded-xl border border-gray-600" />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-red-400 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={deleteArtConfirm} onChange={e => { e.stopPropagation(); setDeleteArtConfirm(e.target.checked); }} onClick={e => e.stopPropagation()} className="w-4 h-4 rounded border-gray-500 text-red-600 bg-gray-700" />
                    Elimina questo articolo definitivamente
                  </label>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={closeModal} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl">Annulla</button>
              <button 
                onClick={deleteArtConfirm && modal.type === 'realignment' ? () => {
                  sock.current?.emit('delete_art', { artId: modal.articleId, deptId: modal.deptId });
                  closeModal();
                } : confirmTx}
                className={`flex-1 py-3 rounded-xl font-bold transition ${deleteArtConfirm && modal.type === 'realignment' ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              >
                {deleteArtConfirm && modal.type === 'realignment' ? '🗑️ Elimina Articolo' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODALE NUOVO REPARTO */}
      {addDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={e => e.target === e.currentTarget && setAddDeptModal({isOpen:false, name:''})}>
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

      {/* MODALE ELIMINA REPARTO (BLINDATA) */}
      {delDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur p-4" onClick={e => e.target === e.currentTarget && setDelDeptModal({isOpen:false, deptId:'', label:''})}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-red-900/50 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-red-400 mb-3 flex items-center gap-2"><AlertTriangle size={24} /> Elimina Reparto</h3>
            <p className="text-gray-300 mb-6">Sei sicuro di voler eliminare <strong className="text-white">"{delDeptModal.label}"</strong> e tutti i suoi articoli?</p>
            
            <div className="flex items-center gap-3 mb-6 p-3 bg-gray-900/50 rounded-xl border border-gray-700">
              <input
                type="checkbox"
                id="confirm-delete-dept"
                checked={delOk}
                onChange={e => { e.stopPropagation(); setDelOk(e.target.checked); }}
                onClick={e => e.stopPropagation()}
                onTouchStart={e => e.stopPropagation()}
                className="w-5 h-5 rounded border-gray-500 text-red-600 focus:ring-red-500 bg-gray-700 cursor-pointer"
              />
              <label htmlFor="confirm-delete-dept" className="text-sm text-gray-200 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                Confermo la cancellazione definitiva
              </label>
            </div>
            
            <div className="flex gap-3">
              <button onClick={() => { setDelDeptModal({isOpen:false, deptId:'', label:''}); setDelOk(false); }} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-medium transition">Annulla</button>
              <button disabled={!delOk} onClick={delExec} className={`flex-1 py-3 rounded-xl font-bold transition ${delOk ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                {delOk ? '✅ Elimina Ora' : 'Spunta per abilitare'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}