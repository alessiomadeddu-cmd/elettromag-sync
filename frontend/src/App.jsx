import { useState, useMemo, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  Settings, BookOpen, ArrowLeft, Radio, Zap, Sun, Shield,
  Plus, Trash2, X, Check, Minus, RotateCcw, Package, Wrench, Lightbulb, Server, Battery, Plug, WifiOff, Pencil
} from 'lucide-react';

const ICONS = { Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug };
const COLOR_POOL = ['bg-purple-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-lime-600', 'bg-orange-500'];

export default function App() {
  const [view, setView] = useState('home');
  const [selectedDept, setSelectedDept] = useState(null);
  const [data, setData] = useState({ departments: [], articles: [], history: [] });
  const [conn, setConn] = useState('disconnected');
  const [auth, setAuth] = useState({ open: false, key: '', err: false });
  const [modal, setModal] = useState({ isOpen: false, type: 'load', deptId: '', articleId: '', descrizione: '', qty: '1', customer: '', origin: '', targetType: 'N', newQtyN: '', newQtyR: '' });
  const [addModal, setAddModal] = useState({ isOpen: false, description: '' });
  const [addDeptModal, setAddDeptModal] = useState({ isOpen: false, name: '' });
  const [delDeptModal, setDelDeptModal] = useState({ isOpen: false, deptId: '', label: '' });
  const [delOk, setDelOk] = useState(false);
  const [delArtConfirm, setDelArtConfirm] = useState(false);
  const [editDeptModal, setEditDeptModal] = useState({ isOpen: false, deptId: '', currentLabel: '', newLabel: '' });
  const [holdProg, setHoldProg] = useState(0);
  const [pressId, setPressId] = useState(null);
  const sock = useRef(null);
  const lpTimer = useRef(null);
  const holdTimer = useRef(null);

  useEffect(() => {
    const savedAuth = localStorage.getItem('em_auth');
    if (savedAuth === 'true') connect(localStorage.getItem('em_auth_key') || '');
    else setAuth(p => ({ ...p, open: true }));
    return () => sock.current?.disconnect();
  }, []);

  const connect = (key) => {
    const url = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
    const s = io(url, { auth: { key }, reconnection: true, reconnectionDelay: 1000, timeout: 5000, transports: ['websocket', 'polling'] });
    sock.current = s;
    s.on('connect', () => {
      setConn('connected');
      if (!localStorage.getItem('em_auth')) {
        localStorage.setItem('em_auth', 'true');
        localStorage.setItem('em_auth_key', key);
      }
      setAuth({ open: false, key: '', err: false });
    });
    s.on('disconnect', () => setConn('disconnected'));
    s.on('connect_error', () => { setConn('error'); setAuth({ open: true, key: '', err: true }); localStorage.removeItem('em_auth'); });
    s.on('state_sync', (st) => {
      const arts = {};
      st.articles.forEach(a => { (arts[a.dept_id] = arts[a.dept_id] || []).push(a); });
      setData({ ...st, articles: arts, departments: st.departments.map(d => ({ ...d, icon: ICONS[d.icon] || Package })) });
    });
  };

  // ✅ FIX SCROLL: lpEnd cancella il timer su qualsiasi movimento
  const lpStart = (d, a) => { setPressId(a); lpTimer.current = setTimeout(() => { openModal(d, a, 'realignment'); setPressId(null); navigator.vibrate?.(100); }, 5000); };
  const lpEnd = () => { clearTimeout(lpTimer.current); setPressId(null); };

  const openModal = (d, a, t) => {
    const art = data.articles[d]?.find(x => x.id === a);
    if (!art) return;
    setDelArtConfirm(false);
    setModal({ isOpen: true, type: t, deptId: d, articleId: a, descrizione: art.descrizione, qty: '1', customer: '', origin: '', targetType: 'N', newQtyN: String(art.qtyNuovo), newQtyR: String(art.qtyRigenerato) });
  };

  const closeModal = () => {
    setModal(p => ({ ...p, isOpen: false }));
    setDelArtConfirm(false);
  };

  const closeAdd = () => setAddModal({ isOpen: false, description: '' });
  const addArt = () => {
    if (!addModal.description.trim() || data.articles[selectedDept.id]?.some(x => x.descrizione.toLowerCase() === addModal.description.trim().toLowerCase())) return;
    sock.current.emit('add_art', { id: `a${Date.now()}`, deptId: selectedDept.id, descrizione: addModal.description.trim() });
    closeAdd();
  };

  const confirmTx = () => {
    if (delArtConfirm && modal.type === 'realignment') {
      sock.current.emit('delete_art', { artId: modal.articleId, deptId: modal.deptId });
      closeModal();
      return;
    }

    const now = new Date().toLocaleString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    const art = data.articles[modal.deptId]?.find(x => x.id === modal.articleId);
    let dN = 0, dR = 0, hist = [];
    if (modal.type === 'realignment') {
      const nN = parseInt(modal.newQtyN), nR = parseInt(modal.newQtyR);
      if (isNaN(nN) || isNaN(nR)) return alert('Valori non validi');
      dN = nN - art.qtyNuovo; dR = nR - art.qtyRigenerato;
      if (dN !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dN, customer: '', origin: '', tipo: 'Nuovo', op: 'realignment' });
      if (dR !== 0) hist.push({ desc: modal.descrizione, date: now, qty: dR, customer: '', origin: '', tipo: 'Rigenerato', op: 'realignment' });
    } else {
      const q = parseInt(modal.qty);
      if (isNaN(q) || q <= 0 || (modal.type === 'unload' && !modal.customer.trim())) return;
      const f = modal.targetType === 'N' ? 'qtyNuovo' : 'qtyRigenerato';
      if (modal.type === 'load') f === 'qtyNuovo' ? dN = q : dR = q; else f === 'qtyNuovo' ? dN = -q : dR = -q;
      hist.push({ desc: modal.descrizione, date: now, qty: q, customer: modal.customer.trim(), origin: modal.origin.trim(), tipo: modal.targetType === 'N' ? 'Nuovo' : 'Rigenerato', op: modal.type });
    }
    sock.current.emit('confirm_tx', { type: modal.type, artId: modal.articleId, newN: parseInt(modal.newQtyN), newR: parseInt(modal.newQtyR), deltaN: dN, deltaR: dR, history: hist });
    closeModal();
  };

  const addDept = () => {
    if (!addDeptModal.name.trim() || data.departments.some(x => x.label.toLowerCase() === addDeptModal.name.trim().toLowerCase())) return;
    const idx = data.departments.length;
    const ICON_NAMES = ['Radio', 'Zap', 'Sun', 'Shield', 'Package', 'Wrench', 'Lightbulb', 'Server', 'Battery', 'Plug'];
    const nd = { id: `d${Date.now()}`, label: addDeptModal.name.trim(), iconName: ICON_NAMES[idx % ICON_NAMES.length], color: COLOR_POOL[idx % COLOR_POOL.length] };
    sock.current.emit('add_dept', nd);
    setAddDeptModal({ isOpen: false, name: '' });
  };

  const holdStart = () => {
    if (!delOk) return; setHoldProg(0); let e = 0;
    holdTimer.current = setInterval(() => { e += 50; setHoldProg(Math.min(e, 5000)); if (e >= 5000) { clearInterval(holdTimer.current); delExec(); } }, 50);
  };
  const holdStop = () => { clearInterval(holdTimer.current); if (holdProg < 5000) setHoldProg(0); };
  const delExec = () => { sock.current.emit('del_dept', delDeptModal.deptId); setDelDeptModal({ isOpen: false, deptId: '', label: '' }); setDelOk(false); setHoldProg(0); };

  const DeptView = () => {
    const arts = useMemo(() => [...(data.articles[selectedDept?.id] || [])].sort((a, b) => a.descrizione.localeCompare(b.descrizione)), [data, selectedDept]);
    return (
      <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-24">
        <div className={`flex items-center gap-3 p-4 rounded-xl ${selectedDept?.color} text-white shadow-md mb-3`}>{selectedDept && <selectedDept.icon className="w-8 h-8"/>}<h2 className="text-2xl font-bold">{selectedDept?.label}</h2></div>
        <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
          <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <div className="col-span-5">Descrizione</div><div className="col-span-2 text-center">N</div><div className="col-span-2 text-center">R</div><div className="col-span-3 text-right">Azioni</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {arts.length === 0 ? <div className="p-8 text-center text-gray-400">Nessun articolo</div> : arts.map(i => (
              /* ✅ FIX SCROLL: onTouchMove e onMouseMove cancellano il long-press */
              <div key={i.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/20 transition select-none ${pressId === i.id ? 'scale-[0.98] bg-amber-900/30 ring-2 ring-amber-500/50 rounded-lg' : ''}`} 
                onTouchStart={() => lpStart(selectedDept.id, i.id)} 
                onTouchMove={lpEnd} 
                onTouchEnd={lpEnd} 
                onMouseDown={() => lpStart(selectedDept.id, i.id)} 
                onMouseMove={lpEnd} 
                onMouseUp={lpEnd} 
                onMouseLeave={lpEnd}>
                <div className="col-span-5 min-w-0 text-gray-200 font-medium truncate text-sm">{i.descrizione}</div>
                <div className={`col-span-2 text-center text-sm font-semibold tabular-nums ${i.qtyNuovo < 0 ? 'text-red-400' : 'text-green-400'}`}>{i.qtyNuovo}</div>
                <div className={`col-span-2 text-center text-sm font-semibold tabular-nums ${i.qtyRigenerato < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{i.qtyRigenerato}</div>
                <div className="col-span-3 flex justify-end gap-2" onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()} onMouseUp={e=>e.stopPropagation()}>
                  <button onClick={() => openModal(selectedDept.id, i.id, 'unload')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-400 active:scale-90"><Minus className="w-4 h-4"/></button>
                  <button onClick={() => openModal(selectedDept.id, i.id, 'load')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-900/30 hover:bg-green-900/50 border border-green-800 text-green-400 active:scale-90"><Plus className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-center items-center gap-2 text-xs text-gray-500"><RotateCcw className="w-3.5 h-3.5"/><span>Tieni premuto 5s per riallineare</span></div>
        <button onClick={() => setAddModal({ isOpen: true, description: '' })} className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus className="w-7 h-7"/></button>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-gray-100 select-none">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center gap-3">{view !== 'home' && <button onClick={() => setView('home')} className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5"/></button>}<div className="flex items-center gap-2"><div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">E</div><span className="font-semibold text-lg">ElettroMag</span></div></div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center text-xs px-2 py-1 rounded-full bg-gray-800 border border-gray-700 ${conn==='connected'?'text-green-400':conn==='error'?'text-red-400':'text-yellow-400'}`}>
            <div className={`status-dot ${conn==='connected'?'status-connected':conn==='error'?'status-disconnected':'status-reconnecting'}`}/>{conn==='connected'?'Online':conn==='error'?'Errore':'Sync...'}
          </div>
          <button onClick={() => setView('history')} className="p-2 rounded-lg hover:bg-gray-800"><BookOpen className="w-6 h-6 text-gray-400"/></button>
          <button onClick={() => setView('settings')} className="p-2 rounded-lg hover:bg-gray-800"><Settings className="w-6 h-6 text-gray-400"/></button>
        </div>
      </header>

      {view === 'home' && <main className="p-4 pb-24"><h1 className="text-xl font-bold mb-6">Reparti</h1><div className="grid grid-cols-2 gap-4">{data.departments.map(d => (<button key={d.id} onClick={() => { setSelectedDept(d); setView('dept'); }} className={`${d.color} flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-lg text-white font-semibold text-lg active:scale-95 min-h-[140px]`}><d.icon className="w-10 h-10"/><span>{d.label}</span></button>))}</div></main>}
      {view === 'dept' && <DeptView/>}
      {view === 'history' && <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-4"><h2 className="text-xl font-bold mb-3 flex gap-2 items-center"><BookOpen className="w-5 h-5"/>Storico</h2><div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col"><div className="sticky top-0 grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900 border-b text-xs font-bold text-gray-400 uppercase"><div className="col-span-3">Data</div><div className="col-span-3">Descrizione</div><div className="col-span-3 text-center">Qtà</div><div className="col-span-3">Dest/Orig</div></div><div className="flex-1 overflow-y-auto">{data.history.length===0?<div className="p-8 text-center text-gray-400">Nessun movimento</div>:
      data.history.map(h => {
        const op = h.operation || h.op || '';
        const c = h.tipo==='Nuovo'?'text-green-400':h.tipo==='Rigenerato'?'text-yellow-400':'text-blue-400';
        const q = op === 'unload' ? `-${h.qty}` : `+${h.qty}`;
        const d = h.customer? `Cli: ${h.customer}` :h.origin? `Org: ${h.origin}` :'-';
        const bg = op === 'load' ? 'bg-green-900/20' : 'bg-red-900/35';
        return (
          <div key={h.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-700/50 hover:bg-gray-600/20 text-sm ${bg}`}>
            <div className="col-span-3 text-gray-400 truncate">{h.date}</div>
            <div className="col-span-3 text-gray-200 truncate">{h.descrizione}</div>
            <div className={`col-span-3 text-center font-semibold tabular-nums ${c}`}>{q}</div>
            <div className="col-span-3 text-gray-300 truncate">{d}</div>
          </div>
        );
      })
      }</div></div></main>}
      
      {view === 'settings' && <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-4"><h2 className="text-xl font-bold mb-4">Impostazioni</h2><div className="flex-1 space-y-3 mb-4 overflow-y-auto">
        {data.departments.map(d => (
          <div key={d.id} className="flex justify-between p-4 bg-gray-800 rounded-xl border border-gray-700">
            <div className="flex gap-3 items-center">
              <div className={`w-10 h-10 ${d.color} rounded-lg flex items-center justify-center`}><d.icon className="w-5 h-5"/></div>
              <span>{d.label}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditDeptModal({ isOpen: true, deptId: d.id, currentLabel: d.label, newLabel: d.label })} className="text-blue-400 p-2 hover:text-blue-300 transition hover:bg-blue-900/30 rounded-lg">
                <Pencil className="w-5 h-5"/>
              </button>
              <button onClick={() => setDelDeptModal({ isOpen: true, deptId: d.id, label: d.label })} className="text-red-400 p-2 hover:text-red-300 transition hover:bg-red-900/30 rounded-lg">
                <Trash2 className="w-5 h-5"/>
              </button>
            </div>
          </div>
        ))}
      </div><div className="space-y-3">
        <div className="flex gap-2">
          <button onClick={async () => { try { const key = auth.key || localStorage.getItem('em_auth_key'); const res = await fetch(`/api/db/export?key=${encodeURIComponent(key)}`); if(!res.ok) return alert('❌ Errore export'); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`em_backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); window.URL.revokeObjectURL(url); alert('✅ Backup salvato in Download'); } catch(e){ alert('❌ ' + e.message); }}} className="flex-1 py-3 bg-gray-700 text-gray-200 rounded-xl flex gap-2 items-center justify-center hover:bg-gray-600 transition">💾 Backup</button>
          <label className="flex-1 py-3 bg-gray-700 text-gray-200 rounded-xl flex gap-2 items-center justify-center hover:bg-gray-600 transition cursor-pointer">📥 Restore<input type="file" accept=".json" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(!file) return; const fd = new FormData(); fd.append('dbfile', file); const key = auth.key || localStorage.getItem('em_auth_key'); try { const res = await fetch(`/api/db/import?key=${encodeURIComponent(key)}`, {method:'POST', body:fd}); const d = await res.json(); alert(d.success ? '✅ ' + d.message : '❌ ' + d.error); } catch(err){ alert('❌ ' + err.message); } e.target.value=''; }}/></label>
        </div>
        <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 bg-red-900/50 text-red-200 rounded-xl flex gap-2 items-center justify-center"><WifiOff className="w-5 h-5"/>Disconnetti / Reset</button>
        <button onClick={() => setAddDeptModal({ isOpen: true, name: '' })} className="w-full py-4 bg-emerald-600 text-white rounded-xl flex gap-2 items-center justify-center"><Plus className="w-5 h-5"/>Nuovo Reparto</button>
      </div></main>}

      {auth.open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 p-4"><div className="w-full max-w-sm bg-gray-800 rounded-2xl p-6 border border-gray-700 text-center"><h2 className="text-xl font-bold mb-2">Accesso Richiesto</h2><p className="text-gray-400 text-sm mb-4">Inserisci la chiave per sincronizzare il magazzino</p><form onSubmit={e => { e.preventDefault(); connect(auth.key.trim()); }}><input type="password" value={auth.key} onChange={e => setAuth(p => ({...p, key: e.target.value}))} placeholder="Chiave di accesso" className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-center mb-3 outline-none focus:ring-2 focus:ring-blue-500" autoFocus/>{auth.err && <p className="text-red-400 text-sm mb-2">Chiave errata o server non raggiungibile</p>}<button type="submit" className="w-full py-3 bg-blue-600 rounded-xl font-bold">Accedi</button></form></div></div>}

      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={closeModal}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl max-h-[80vh] overflow-y-auto p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              {/* ✅ FIX: Mostra nome articolo anche nel riallineamento */}
              <h3 className="font-bold">
                {modal.type==='load' ? `📥 Carico - ${modal.descrizione}` : 
                 modal.type==='unload' ? `📤 Scarico - ${modal.descrizione}` : 
                 `🔄 Riallineamento - ${modal.descrizione}`}
              </h3>
              <button onClick={closeModal}><X/></button>
            </div>
            {modal.type==='realignment'?(
              <>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div><label className="text-xs text-green-400">Nuovo</label><input type="number" value={modal.newQtyN} onChange={e=>setModal(p=>({...p,newQtyN:e.target.value}))} className="w-full bg-gray-900 rounded-lg p-2 mt-1"/></div>
                  <div><label className="text-xs text-yellow-400">Rigenerato</label><input type="number" value={modal.newQtyR} onChange={e=>setModal(p=>({...p,newQtyR:e.target.value}))} className="w-full bg-gray-900 rounded-lg p-2 mt-1"/></div>
                </div>
                <label className="flex gap-2 items-center mb-4 p-3 bg-gray-900/50 rounded-xl cursor-pointer text-red-400" onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" checked={delArtConfirm} onChange={e=>{e.stopPropagation();setDelArtConfirm(e.target.checked);}} onClick={e=>e.stopPropagation()} className="w-5 h-5 text-red-500 rounded"/>
                  <span className="text-sm">Elimina questo articolo definitivamente</span>
                </label>
              </>
            ):(
              <>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <button onClick={()=>setModal(p=>({...p,targetType:'N'}))} className={`p-3 rounded-xl border ${modal.targetType==='N'?'bg-green-600 border-green-500':'bg-gray-900'}`}>Nuovo</button>
                  <button onClick={()=>setModal(p=>({...p,targetType:'R'}))} className={`p-3 rounded-xl border ${modal.targetType==='R'?'bg-yellow-600 border-yellow-500':'bg-gray-900'}`}>Rigenerato</button>
                </div>
                <label className="text-xs">Quantità</label>
                <div className="flex items-center gap-2 mb-4">
                  <input type="number" inputMode="numeric" value={modal.qty} onChange={e=>setModal(p=>({...p,qty:e.target.value}))} className="flex-1 h-12 bg-gray-900 rounded-lg px-3 text-center"/>
                  <button onClick={()=>setModal(p=>({...p,qty:String(Math.max(1,(parseInt(p.qty)||1)-1))}))} className="w-12 h-12 bg-gray-800 rounded-lg border border-gray-700"><Minus/></button>
                  <button onClick={()=>setModal(p=>({...p,qty:String((parseInt(p.qty)||0)+1)}))} className="w-12 h-12 bg-blue-600 rounded-lg"><Plus/></button>
                </div>
                {modal.type==='load' && <input type="text" value={modal.origin} onChange={e=>setModal(p=>({...p,origin:e.target.value}))} placeholder="Origine/Fornitore" className="w-full bg-gray-900 rounded-lg p-3 mb-4"/>}
                {modal.type==='unload' && <input type="text" value={modal.customer} onChange={e=>setModal(p=>({...p,customer:e.target.value}))} placeholder="Cliente" className="w-full bg-gray-900 rounded-lg p-3 mb-4"/>}
              </>
            )}
            <div className="flex gap-3 mt-4">
              <button onClick={closeModal} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button 
                onClick={confirmTx} 
                className={`flex-1 py-3 rounded-xl ${delArtConfirm && modal.type === 'realignment' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
              >
                {delArtConfirm && modal.type === 'realignment' ? '🗑️ Elimina Articolo' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {addModal.isOpen && (<div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={closeAdd}><div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700"><h3 className="font-bold mb-3">📦 Nuovo Articolo - {selectedDept?.label}</h3><input type="text" value={addModal.description} onChange={e=>setAddModal(p=>({...p,description:e.target.value}))} placeholder="Descrizione" className="w-full bg-gray-900 rounded-lg p-3 mb-4" autoFocus/><div className="flex gap-3"><button onClick={closeAdd} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button><button onClick={addArt} className="flex-1 py-3 bg-emerald-600 rounded-xl">Aggiungi</button></div></div></div>)}
      
      {addDeptModal.isOpen && (<div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={()=>setAddDeptModal({isOpen:false,name:''})}><div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700"><h3 className="font-bold mb-3">📁 Nuovo Reparto</h3><input type="text" value={addDeptModal.name} onChange={e=>setAddDeptModal(p=>({...p,name:e.target.value}))} placeholder="Nome Reparto" className="w-full bg-gray-900 rounded-lg p-3 mb-4" autoFocus/><div className="flex gap-3"><button onClick={()=>setAddDeptModal({isOpen:false,name:''})} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button><button onClick={addDept} className="flex-1 py-3 bg-emerald-600 rounded-xl">Crea</button></div></div></div>)}

      {delDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={(e) => { if(e.target === e.currentTarget) { setDelDeptModal({isOpen:false,deptId:'',label:''}); setDelOk(false); setHoldProg(0); } }}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-red-900/50" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 font-bold mb-2">⚠️ Elimina Reparto</h3>
            <p className="text-sm text-gray-300 mb-4">Eliminare definitivamente "{delDeptModal.label}" e tutti i suoi articoli?</p>
            <label className="flex gap-2 items-start mb-4 p-3 bg-gray-900/50 rounded-xl cursor-pointer" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={delOk} onChange={e => { e.stopPropagation(); setDelOk(e.target.checked); }} onClick={e => e.stopPropagation()} className="mt-1 w-5 h-5 text-red-500 rounded"/>
              <span className="text-sm">Confermo la cancellazione definitiva</span>
            </label>
            <button disabled={!delOk} onMouseDown={holdStart} onMouseUp={holdStop} onMouseLeave={holdStop} onTouchStart={e=>{e.preventDefault();holdStart()}} onTouchEnd={holdStop} className={`w-full py-4 rounded-xl font-bold relative overflow-hidden ${delOk?'bg-red-600':'bg-gray-700 text-gray-500'}`}>
              <div className="absolute left-0 top-0 h-full bg-red-800/50" style={{width:`${(holdProg/5000)*100}%`}}/>
              <span className="relative z-10">{holdProg > 0 && holdProg < 5000 ? `Tieni premuto... ${(1-holdProg/5000).toFixed(1)}s` : 'Tieni premuto 5s'}</span>
            </button>
          </div>
        </div>
      )}

      {editDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4" onClick={() => setEditDeptModal({isOpen:false, deptId:'', currentLabel:'', newLabel:''})}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">✏️ Modifica Nome Reparto</h3>
            <p className="text-sm text-gray-400 mb-3">Attuale: <span className="text-white font-medium">{editDeptModal.currentLabel}</span></p>
            <input 
              type="text" 
              value={editDeptModal.newLabel} 
              onChange={e => setEditDeptModal(p => ({...p, newLabel: e.target.value}))} 
              placeholder="Nuovo nome reparto" 
              className="w-full p-3 bg-gray-900 rounded-xl border border-gray-600 mb-4 focus:ring-2 focus:ring-blue-500 outline-none" 
              autoFocus 
            />
            <div className="flex gap-3">
              <button onClick={() => setEditDeptModal({isOpen:false, deptId:'', currentLabel:'', newLabel:''})} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition">Annulla</button>
              <button 
                onClick={() => {
                  if (!editDeptModal.newLabel.trim()) return alert('Il nome non può essere vuoto');
                  sock.current.emit('update_dept', { id: editDeptModal.deptId, label: editDeptModal.newLabel.trim() });
                  setEditDeptModal({isOpen:false, deptId:'', currentLabel:'', newLabel:''});
                }} 
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition"
              >
                Salva Modifiche
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}