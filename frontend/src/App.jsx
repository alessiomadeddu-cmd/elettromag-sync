import { useState, useMemo, useRef, useEffect } from 'react';
import { io } from 'socket.io-client';
import {
  Settings, BookOpen, ArrowLeft, Radio, Zap, Sun, Shield,
  Plus, Trash2, X, Check, Minus, RotateCcw, Package, Wrench, Lightbulb, Server, Battery, Plug, WifiOff, Pencil,
  Calendar, ChevronLeft, ChevronRight, Star, Database,
  ListTodo, FileText, CheckCircle, Circle
} from 'lucide-react';

const ICONS = { Radio, Zap, Sun, Shield, Package, Wrench, Lightbulb, Server, Battery, Plug };
const COLOR_POOL = ['bg-purple-600', 'bg-indigo-600', 'bg-pink-600', 'bg-cyan-600', 'bg-lime-600', 'bg-orange-500'];

const getLocalDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function App() {
  const [view, setView] = useState('main');
  
  // ✅ STATI MAGAZZINO V2.0
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
  
  // ✅ STATI AGENDA V3
  const [appointments, setAppointments] = useState([]);
  const [agendaModal, setAgendaModal] = useState(false);
  const [editAppt, setEditAppt] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const touchStartX = useRef(null);
  const [inventoryModal, setInventoryModal] = useState(false);
  
  // ✅ STATI V4.0 (TODO & FATTURE)
  const [todos, setTodos] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [todoModal, setTodoModal] = useState({ open: false, editId: null, title: '', priority: 'medium', due_date: '' });
  const [invoiceModal, setInvoiceModal] = useState({ open: false, editId: null, customer: '', amount: '', status: 'pending', due_date: '', notes: '' });
  const [todoFilter, setTodoFilter] = useState('all');
  const [invoiceFilter, setInvoiceFilter] = useState('pending');
  
  const sock = useRef(null);
  const holdTimer = useRef(null);

  useEffect(() => {
    const savedAuth = localStorage.getItem('em_auth');
    if (savedAuth === 'true') connect(localStorage.getItem('em_auth_key') || '');
    else setAuth(p => ({ ...p, open: true }));
    return () => sock.current?.disconnect();
  }, []);

  useEffect(() => {
    if (view === 'agenda') {
      setSelectedDate(getLocalDate());
      setCurrentMonth(new Date());
    }
    if (screen.orientation?.lock) screen.orientation.lock('portrait').catch(() => {});
  }, [view]);

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
      st.articles.forEach(a => {
        a.qtyNuovo = a.qtyNuovo ?? a.qtynuovo ?? 0;
        a.qtyRigenerato = a.qtyRigenerato ?? a.qtyrigenerato ?? 0;
        (arts[a.dept_id] = arts[a.dept_id] || []).push(a);
      });
      setData({ ...st, articles: arts, departments: st.departments.map(d => ({ ...d, icon: ICONS[d.icon] || Package })) });
    });
    s.on('sync_appts', (st) => setAppointments(st.appointments || []));
    s.on('sync_todos', (st) => setTodos(st.todos || []));
    s.on('sync_invoices', (st) => setInvoices(st.invoices || []));
  };

  const goBack = () => {
    if (view === 'warehouse' || view === 'agenda' || view === 'settings_global' || view === 'todos' || view === 'invoices') setView('main');
    else if (view === 'dept') setView('warehouse');
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear(), month = date.getMonth();
    const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
    const days = [];
    let startDay = firstDay.getDay();
    startDay = startDay === 0 ? 6 : startDay - 1;
    for (let i = 0; i < startDay; i++) days.push({ day: null, date: null });
    const today = getLocalDate();
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const d = new Date(year, month, i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      days.push({ day: i, date: dateStr, isToday: dateStr === today, isWeekend: d.getDay() === 0 });
    }
    return days;
  };

  const days = useMemo(() => getDaysInMonth(currentMonth), [currentMonth]);
  const hasAppt = (dateStr) => dateStr && appointments.some(a => a.date === dateStr);
  
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (!touchStartX.current) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) diff > 0 ? setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)) : setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    touchStartX.current = null;
  };

  const allArticles = useMemo(() => {
    const flat = [];
    for (const [deptId, arts] of Object.entries(data.articles)) arts.forEach(a => flat.push({ ...a, dept_id: deptId }));
    return flat.sort((a, b) => a.descrizione.localeCompare(b.descrizione));
  }, [data.articles]);

  const openModal = (d, a, t) => {
    const art = data.articles[d]?.find(x => x.id === a);
    if (!art) return;
    setDelArtConfirm(false);
    setModal({ isOpen: true, type: t, deptId: d, articleId: a, descrizione: art.descrizione, qty: '1', customer: '', origin: '', targetType: 'N', newQtyN: String(art.qtyNuovo), newQtyR: String(art.qtyRigenerato) });
  };
  const closeModal = () => { setModal(p => ({ ...p, isOpen: false })); setDelArtConfirm(false); };
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
      if (art && art.descrizione !== modal.descrizione.trim()) sock.current.emit('update_art', { id: modal.articleId, descrizione: modal.descrizione.trim() });
      const nN = parseInt(modal.newQtyN), nR = parseInt(modal.newQtyR);
      if (isNaN(nN) || isNaN(nR)) return alert('Valori non validi');
      dN = nN - (art.qtyNuovo ?? 0); dR = nR - (art.qtyRigenerato ?? 0);
      if (dN !== 0) hist.push({ desc: modal.descrizione, date: now, qty: Math.abs(dN), customer: dN < 0 ? 'M-AGG' : '', origin: dN > 0 ? 'M-AGG' : '', tipo: 'Nuovo', op: dN > 0 ? 'load' : 'unload' });
      if (dR !== 0) hist.push({ desc: modal.descrizione, date: now, qty: Math.abs(dR), customer: dR < 0 ? 'M-AGG' : '', origin: dR > 0 ? 'M-AGG' : '', tipo: 'Rigenerato', op: dR > 0 ? 'load' : 'unload' });
    } else {
      const q = parseInt(modal.qty);
      if (isNaN(q) || q <= 0) return alert('Quantità non valida');
      if (modal.type === 'load' && !modal.origin.trim()) return alert('Inserire il Fornitore');
      if (modal.type === 'unload' && !modal.customer.trim()) return alert('Inserire il Cliente');
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
    sock.current.emit('add_dept', { id: `d${Date.now()}`, label: addDeptModal.name.trim(), iconName: ICON_NAMES[idx % ICON_NAMES.length], color: COLOR_POOL[idx % COLOR_POOL.length] });
    setAddDeptModal({ isOpen: false, name: '' });
  };

  const holdStart = () => { if (!delOk) return; setHoldProg(0); let e = 0; holdTimer.current = setInterval(() => { e += 50; setHoldProg(Math.min(e, 5000)); if (e >= 5000) { clearInterval(holdTimer.current); delExec(); } }, 50); };
  const holdStop = () => { clearInterval(holdTimer.current); if (holdProg < 5000) setHoldProg(0); };
  const delExec = () => { sock.current.emit('del_dept', delDeptModal.deptId); setDelDeptModal({ isOpen: false, deptId: '', label: '' }); setDelOk(false); setHoldProg(0); };

  // ✅ V4.0 HANDLERS
  const handleAddTodo = () => {
    if (!todoModal.title.trim()) return alert('Inserisci un titolo');
    sock.current.emit('add_todo', { id: `todo_${Date.now()}`, title: todoModal.title.trim(), priority: todoModal.priority, due_date: todoModal.due_date || null });
    setTodoModal({ open: false, editId: null, title: '', priority: 'medium', due_date: '' });
  };
  const handleToggleTodo = (id, completed) => {
    sock.current.emit('toggle_todo', { id, completed: !completed });
  };
  const handleDeleteTodo = (id) => {
    sock.current.emit('delete_todo', { id });
  };

  const handleSaveInvoice = () => {
    if (!invoiceModal.customer.trim() || !invoiceModal.amount) return alert('Compila cliente e importo');
    const payload = { id: invoiceModal.editId || `inv_${Date.now()}`, customer: invoiceModal.customer.trim(), amount: parseFloat(invoiceModal.amount), status: invoiceModal.status, due_date: invoiceModal.due_date || null, notes: invoiceModal.notes.trim() };
    sock.current.emit(invoiceModal.editId ? 'update_invoice' : 'add_invoice', payload);
    setInvoiceModal({ open: false, editId: null, customer: '', amount: '', status: 'pending', due_date: '', notes: '' });
  };
  const handleDeleteInvoice = (id) => {
    sock.current.emit('delete_invoice', { id });
  };

  const DeptView = () => {
    const arts = useMemo(() => [...(data.articles[selectedDept?.id] || [])].sort((a, b) => a.descrizione.localeCompare(b.descrizione)), [data, selectedDept]);
    return (
      <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-24">
        <div className={`flex items-center gap-3 p-4 rounded-xl ${selectedDept?.color} text-white shadow-md mb-3`}>
          {selectedDept && <selectedDept.icon className="w-8 h-8"/>} 
          <h2 className="text-2xl font-bold">{selectedDept?.label}</h2>
        </div>
        <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
          <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900 border-b border-gray-700 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <div className="col-span-5">Descrizione</div> <div className="col-span-2 text-center">N</div> <div className="col-span-2 text-center">R</div> <div className="col-span-3 text-right">Azioni</div>
          </div>
          <div className="flex-1 overflow-y-auto touch-pan-y">
            {arts.length === 0 ? <div className="p-8 text-center text-gray-400">Nessun articolo</div> : arts.map(i => (
              <div key={i.id} className="grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-700/50 hover:bg-gray-700/20 transition select-none">
                <div className="col-span-5 min-w-0 text-gray-200 font-medium truncate text-sm">{i.descrizione}</div>
                <div className={`col-span-2 text-center text-base font-bold tabular-nums ${i.qtyNuovo < 0 ? 'text-red-400' : 'text-green-400'}`}>{i.qtyNuovo}</div>
                <div className={`col-span-2 text-center text-base font-bold tabular-nums ${i.qtyRigenerato < 0 ? 'text-red-400' : 'text-yellow-400'}`}>{i.qtyRigenerato}</div>
                <div className="col-span-3 flex justify-end gap-2">
                  <button onClick={() => openModal(selectedDept.id, i.id, 'unload')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-400 active:scale-90"><Minus className="w-4 h-4"/></button>
                  <button onClick={() => openModal(selectedDept.id, i.id, 'load')} className="w-8 h-8 flex items-center justify-center rounded-lg bg-green-900/30 hover:bg-green-900/50 border border-green-800 text-green-400 active:scale-90"><Plus className="w-4 h-4"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex justify-center items-center gap-2 text-xs text-gray-500"><Settings className="w-3.5 h-3.5"/><span>Usa Gestione Inventario per modificare/riallineare</span></div>
        <button onClick={() => setAddModal({ isOpen: true, description: '' })} className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus className="w-7 h-7"/></button>
      </main>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 font-sans text-gray-100 select-none">
      <style>{`@keyframes monthFadeSlide { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .month-transition { animation: monthFadeSlide 0.3s ease-out forwards; }`}</style>
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 py-3 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="flex items-center gap-3">
          {view !== 'main' && <button onClick={goBack} className="p-2 rounded-lg hover:bg-gray-800"><ArrowLeft className="w-5 h-5"/></button>}
          <div className="flex items-center gap-2"><div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">E</div><span className="font-semibold text-lg">ElettroMag</span></div>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center text-xs px-2 py-1 rounded-full bg-gray-800 border border-gray-700 ${conn==='connected'?'text-green-400':conn==='error'?'text-red-400':'text-yellow-400'}`}>
            <div className={`w-2 h-2 rounded-full mr-1 ${conn==='connected'?'bg-green-400':conn==='error'?'bg-red-400':'bg-yellow-400 animate-pulse'}`}/>{conn==='connected'?'Online':conn==='error'?'Errore':'Sync...'}
          </div>
          <button onClick={() => setView('settings_global')} className="p-2 rounded-lg hover:bg-gray-800 transition" title="Configurazione"><Settings className="w-5 h-5 text-gray-300"/></button>
          {(view === 'warehouse' || view === 'dept' || view === 'history' || view === 'settings') && (
            <>
              <button onClick={() => setView('history')} className="p-2 rounded-lg hover:bg-gray-800"><BookOpen className="w-6 h-6 text-gray-400"/></button>
              <button onClick={() => setView('settings')} className="p-2 rounded-lg hover:bg-gray-800"><Settings className="w-6 h-6 text-gray-400"/></button>
            </>
          )}
        </div>
      </header>

      {view === 'settings_global' && (
        <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-4 items-center justify-center">
          <h2 className="text-2xl font-bold mb-8">Configurazione & Database</h2>
          <div className="w-full max-w-md space-y-4">
            <button onClick={async () => { 
              try { const key = auth.key || localStorage.getItem('em_auth_key'); const res = await fetch(`/api/db/export?key=${encodeURIComponent(key)}`); if(!res.ok) return alert('❌ Errore export'); const blob = await res.blob(); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`em_backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); window.URL.revokeObjectURL(url); alert('✅ Backup salvato'); } catch(e){ alert('❌ ' + e.message); }
            }} className="w-full py-4 bg-gray-700 text-gray-200 rounded-xl flex gap-3 items-center justify-center hover:bg-gray-600 transition text-lg font-medium"><Database className="w-6 h-6"/> Backup Database</button>
            <label className="w-full py-4 bg-gray-700 text-gray-200 rounded-xl flex gap-3 items-center justify-center hover:bg-gray-600 transition text-lg font-medium cursor-pointer">
              <RotateCcw className="w-6 h-6"/> Restore Database
              <input type="file" accept=".json" className="hidden" onChange={async (e) => { const file = e.target.files[0]; if(!file) return; const fd = new FormData(); fd.append('dbfile', file); const key = auth.key || localStorage.getItem('em_auth_key'); try { const res = await fetch(`/api/db/import?key=${encodeURIComponent(key)}`, {method:'POST', body:fd}); const d = await res.json(); alert(d.success ? '✅ ' + d.message : '❌ ' + d.error); } catch(err){ alert('❌ ' + err.message); } e.target.value=''; }}/>
            </label>
            <button onClick={() => setView('main')} className="w-full py-3 mt-8 text-gray-500 hover:text-white transition">Torna alla Home</button>
          </div>
        </main>
      )}

      {/* ✅ SEZIONE HOME (GRID COMPATTA 2X2 CON ASSOCIAZIONI RICHIESTE) */}
      {view === 'main' && (
        <main className="flex flex-col items-center justify-center h-[calc(100vh-56px)] p-4 max-w-lg mx-auto">
          <div className="grid grid-cols-2 gap-4 w-full">
            {/* ── FILA 1 ── */}
            <button onClick={() => setView('warehouse')} className="w-full p-5 bg-gray-800 rounded-2xl border border-gray-700 hover:border-blue-500 transition flex flex-col items-center justify-center gap-2 active:scale-95 text-center min-h-[150px]">
              <Package className="w-10 h-10 text-blue-400"/>
              <span className="text-xl font-bold">Magazzino</span>
              <span className="text-gray-400 text-xs line-clamp-2">Reparti e articoli</span>
            </button>
            <button onClick={() => setView('agenda')} className="w-full p-5 bg-gray-800 rounded-2xl border border-gray-700 hover:border-purple-500 transition flex flex-col items-center justify-center gap-2 active:scale-95 text-center min-h-[150px]">
              <Calendar className="w-10 h-10 text-purple-400"/>
              <span className="text-xl font-bold">Calendario</span>
              <span className="text-gray-400 text-xs line-clamp-2">Appuntamenti operatori</span>
            </button>

            {/* ── FILA 2 ── */}
            <button onClick={() => setView('todos')} className="w-full p-5 bg-gray-800 rounded-2xl border border-gray-700 hover:border-orange-500 transition flex flex-col items-center justify-center gap-2 active:scale-95 text-center min-h-[150px]">
              <ListTodo className="w-10 h-10 text-orange-400"/>
              <span className="text-xl font-bold">ToDo</span>
              <span className="text-gray-400 text-xs line-clamp-2">Attività e priorità</span>
            </button>
            <button onClick={() => setView('invoices')} className="w-full p-5 bg-gray-800 rounded-2xl border border-gray-700 hover:border-emerald-500 transition flex flex-col items-center justify-center gap-2 active:scale-95 text-center min-h-[150px]">
              <FileText className="w-10 h-10 text-emerald-400"/>
              <span className="text-xl font-bold">Fatture</span>
              <span className="text-gray-400 text-xs line-clamp-2">Registro da emettere</span>
            </button>
          </div>
        </main>
      )}

      {view === 'warehouse' && (
        <main className="p-4 pb-24">
          <h1 className="text-xl font-bold mb-6">Reparti</h1>
          <div className="grid grid-cols-2 gap-4">
            {data.departments.map(d => (
              <button key={d.id} onClick={() => { setSelectedDept(d); setView('dept'); }} className={`${d.color} flex flex-col items-center justify-center gap-3 p-6 rounded-2xl shadow-lg text-white font-semibold text-lg active:scale-95 min-h-[140px]`}>
                <d.icon className="w-10 h-10"/>
                <span>{d.label}</span>
              </button>
            ))}
          </div>
        </main>
      )}
      
      {view === 'dept' && <DeptView/>}
      
      {view === 'history' && (
        <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-4">
          <h2 className="text-xl font-bold mb-3 flex gap-2 items-center"><BookOpen className="w-5 h-5"/>Storico</h2>
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden flex flex-col">
            <div className="sticky top-0 grid grid-cols-12 gap-2 px-4 py-3 bg-gray-900 border-b text-xs font-bold text-gray-400 uppercase">
              <div className="col-span-3">Data</div><div className="col-span-3">Descrizione</div><div className="col-span-2 text-center">Qtà</div><div className="col-span-4">Dest/Orig</div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {data.history.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Nessun movimento</div>
              ) : (
                [...data.history].reverse().map(h => {
                  const op = h.operation || h.op || '';
                  const c = h.tipo === 'Nuovo' ? 'text-green-400' : h.tipo === 'Rigenerato' ? 'text-yellow-400' : 'text-blue-400';
                  const q = op === 'unload' ? `-${h.qty}` : `+${h.qty}`;
                  const d = h.customer ? `Cli: ${h.customer}` : h.origin ? `Org: ${h.origin}` : '-';
                  const bg = op === 'unload' ? 'bg-red-900/20 border-l-4 border-l-red-500' : op === 'realignment' ? 'bg-blue-900/10 border-l-4 border-l-blue-500' : 'bg-green-900/20 border-l-4 border-l-green-500';
                  return (
                    <div key={h.id} className={`grid grid-cols-12 gap-2 items-center px-4 py-3 border-b border-gray-700/50 hover:bg-gray-600/20 text-sm ${bg}`}>
                      <div className="col-span-3 text-gray-400 truncate">{h.date}</div>
                      <div className="col-span-3 text-gray-200 truncate">{h.descrizione}</div>
                      <div className={`col-span-2 text-center font-semibold tabular-nums ${c}`}>{q}</div>
                      <div className="col-span-4 text-gray-300 truncate">{d}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </main>
      )}
      
      {view === 'settings' && (
        <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-4">
          <h2 className="text-xl font-bold mb-4">Gestione Reparti</h2>
          <div className="flex-1 space-y-3 mb-4 overflow-y-auto">
            {data.departments.map(d => (
              <div key={d.id} className="flex justify-between p-4 bg-gray-800 rounded-xl border border-gray-700">
                <div className="flex gap-3 items-center">
                  <div className={`w-10 h-10 ${d.color} rounded-lg flex items-center justify-center`}>
                    <d.icon className="w-5 h-5"/>
                  </div>
                  <span>{d.label}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditDeptModal({ isOpen: true, deptId: d.id, currentLabel: d.label, newLabel: d.label })} className="text-blue-400 p-2 hover:text-blue-300 transition hover:bg-blue-900/30 rounded-lg">
                    <Settings className="w-5 h-5"/>
                  </button>
                  <button onClick={() => setDelDeptModal({ isOpen: true, deptId: d.id, label: d.label })} className="text-red-400 p-2 hover:text-red-300 transition hover:bg-red-900/30 rounded-lg">
                    <Trash2 className="w-5 h-5"/>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <button onClick={() => setInventoryModal(true)} className="w-full py-3 bg-gray-700 text-gray-200 rounded-xl flex gap-2 items-center justify-center hover:bg-gray-600 transition">
              <Wrench className="w-5 h-5"/> Gestione Inventario
            </button>
            <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="w-full py-4 bg-red-900/50 text-red-200 rounded-xl flex gap-2 items-center justify-center">
              <WifiOff className="w-5 h-5"/>Disconnetti / Reset
            </button>
            <button onClick={() => setAddDeptModal({ isOpen: true, name: '' })} className="w-full py-4 bg-emerald-600 text-white rounded-xl flex gap-2 items-center justify-center">
              <Plus className="w-5 h-5"/>Nuovo Reparto
            </button>
          </div>
        </main>
      )}

      {/* ✅ V4.0 VIEW TO-DO */}
      {view === 'todos' && (
        <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex gap-2 items-center"><ListTodo className="w-6 h-6 text-orange-400"/>To-Do List</h2>
            <div className="flex gap-1 bg-gray-800 p-1 rounded-lg">
              {['all','active','completed'].map(f => (
                <button key={f} onClick={()=>setTodoFilter(f)} className={`px-3 py-1 rounded-md text-xs font-medium transition ${todoFilter===f?'bg-gray-700 text-white':'text-gray-400 hover:text-white'}`}>
                  {f==='all'?'Tutte':f==='active'?'Da fare':'Completate'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-y-auto space-y-2 p-3">
            {todos.filter(t => todoFilter === 'all' ? true : todoFilter === 'active' ? !t.completed : t.completed).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500"><ListTodo className="w-12 h-12 mb-2 opacity-50"/><span>Nessuna attività</span></div>
            ) : (
              todos.filter(t => todoFilter === 'all' ? true : todoFilter === 'active' ? !t.completed : t.completed).map(todo => (
                <div key={todo.id} className={`flex items-center gap-3 p-3 bg-gray-900/50 rounded-xl border ${todo.completed ? 'border-gray-700 opacity-70' : 'border-gray-600'} transition`}>
                  <button onClick={() => handleToggleTodo(todo.id, todo.completed)} className="flex-shrink-0">
                    {todo.completed ? <CheckCircle className="w-6 h-6 text-green-400"/> : <Circle className="w-6 h-6 text-gray-400"/>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`font-medium truncate ${todo.completed ? 'line-through text-gray-500' : 'text-gray-200'}`}>{todo.title}</p>
                    <div className="flex gap-2 text-xs mt-1">
                      <span className={`px-1.5 rounded ${todo.priority==='high'?'bg-red-500/20 text-red-400':todo.priority==='medium'?'bg-yellow-500/20 text-yellow-400':'bg-blue-500/20 text-blue-400'}`}>{todo.priority}</span>
                      {todo.due_date && <span className="text-gray-500 flex items-center gap-1"><Calendar className="w-3 h-3"/>{todo.due_date}</span>}
                    </div>
                  </div>
                  <button onClick={() => handleDeleteTodo(todo.id)} className="p-2 text-gray-500 hover:text-red-400 transition"><Trash2 className="w-4 h-4"/></button>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setTodoModal({ open: true, editId: null, title: '', priority: 'medium', due_date: '' })} className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-orange-600 hover:bg-orange-500 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus className="w-7 h-7"/></button>
        </main>
      )}

      {/* ✅ V4.0 VIEW FATTURE */}
      {view === 'invoices' && (
        <main className="flex flex-col h-[calc(100vh-56px)] p-4 pb-20">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold flex gap-2 items-center"><FileText className="w-6 h-6 text-emerald-400"/>Fatture</h2>
            <div className="flex gap-1 bg-gray-800 p-1 rounded-lg overflow-x-auto">
              {['pending','all','issued','paid'].map(f => (
                <button key={f} onClick={()=>setInvoiceFilter(f)} className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap transition ${invoiceFilter===f?'bg-gray-700 text-white':'text-gray-400 hover:text-white'}`}>
                  {f==='all'?'Tutte':f==='pending'?'Da emettere':f==='issued'?'Emesse':f==='paid'?'Pagate':'Annullate'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-gray-800 rounded-xl border border-gray-700 overflow-y-auto p-3 space-y-2">
            {invoices.filter(i => invoiceFilter === 'all' ? true : i.status === invoiceFilter).length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-500"><FileText className="w-12 h-12 mb-2 opacity-50"/><span>Nessuna fattura</span></div>
            ) : (
              invoices.filter(i => invoiceFilter === 'all' ? true : i.status === invoiceFilter).map(inv => (
                <div key={inv.id} className="flex items-center justify-between p-4 bg-gray-900/50 rounded-xl border border-gray-700 hover:border-gray-600 transition">
                  <div>
                    <p className="font-semibold text-gray-200 truncate max-w-[200px]">{inv.customer}</p>
                    <p className="text-xs text-gray-500 mt-1">{inv.due_date ? `Scadenza: ${inv.due_date}` : 'Nessuna scadenza'}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-bold text-emerald-400 tabular-nums">€ {parseFloat(inv.amount).toFixed(2)}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${inv.status==='pending'?'bg-orange-500/10 text-orange-400 border-orange-500/30':inv.status==='issued'?'bg-blue-500/10 text-blue-400 border-blue-500/30':'bg-green-500/10 text-green-400 border-green-500/30'}`}>{inv.status==='pending'?'In attesa':inv.status==='issued'?'Emessa':'Pagata'}</span>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setInvoiceModal({ open: true, editId: inv.id, customer: inv.customer, amount: inv.amount, status: inv.status, due_date: inv.due_date || '', notes: inv.notes || '' })} className="p-2 text-gray-400 hover:text-blue-400 transition"><Pencil className="w-4 h-4"/></button>
                      <button onClick={() => handleDeleteInvoice(inv.id)} className="p-2 text-gray-400 hover:text-red-400 transition"><Trash2 className="w-4 h-4"/></button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          <button onClick={() => setInvoiceModal({ open: true, editId: null, customer: '', amount: '', status: 'pending', due_date: '', notes: '' })} className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus className="w-7 h-7"/></button>
        </main>
      )}

      {view === 'agenda' && (
        <div className="flex flex-col h-[calc(100vh-56px)] bg-gray-900 overflow-hidden">
          <div className="bg-gray-800 p-4 border-b border-gray-700 z-10 shadow-lg flex-shrink-0" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
            <div className="flex justify-between items-center mb-4">
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))} className="p-2 rounded-full hover:bg-gray-700"><ChevronLeft className="w-5 h-5"/></button>
              <span className="font-bold text-lg capitalize">{currentMonth.toLocaleString('it-IT', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))} className="p-2 rounded-full hover:bg-gray-700"><ChevronRight className="w-5 h-5"/></button>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-gray-500 mb-2"><span>LUN</span><span>MAR</span><span>MER</span><span>GIO</span><span>VEN</span><span className="text-gray-400">SAB</span><span className="text-red-500">DOM</span></div>
            <div key={currentMonth.toISOString()} className="grid grid-cols-7 gap-1.5 month-transition">
              {days.map((d, i) => {
                const isSelected = d.date === selectedDate;
                const isToday = d.isToday;
                let dayClass = !d.date ? 'opacity-10 border-transparent' : isSelected ? 'bg-blue-600/40 border-blue-500 text-white ring-2 ring-blue-400/50' : isToday ? 'bg-cyan-500/20 border-cyan-500/60 text-cyan-300 font-semibold' : 'bg-gray-800/50 border-gray-700 text-gray-300 hover:bg-gray-700/40';
                if (!isSelected && d.isWeekend) dayClass += ' text-red-400';
                return (<button key={i} onClick={() => d.date && setSelectedDate(d.date)} disabled={!d.date} className={`h-12 w-full rounded-lg border flex flex-col items-center justify-center relative transition ${dayClass}`}>{d.day}{hasAppt(d.date) && <Star className="w-3 h-3 text-yellow-400 absolute top-1 right-1"/>}</button>);
              })}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
            {appointments.filter(a => a.date === selectedDate).sort((a,b) => a.time.localeCompare(b.time)).map(appt => (
              <div key={appt.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center gap-4">
                <span className="text-lg font-bold text-gray-200 w-12">{appt.time}</span>
                <span className="flex-1 truncate text-gray-300 font-medium">{appt.title}</span>
                <div className="flex gap-1">{(appt.operator === 'A' || appt.operator === 'AC') && <span className="px-2 py-1 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">A</span>}{(appt.operator === 'C' || appt.operator === 'AC') && <span className="px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30">C</span>}</div>
                <button onClick={() => { setEditAppt({ ...appt }); setAgendaModal(true); }} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"><Pencil className="w-4 h-4"/></button>
              </div>
            ))}
            {appointments.filter(a => a.date === selectedDate).length === 0 && (<div className="text-center text-gray-500 mt-10"><Calendar className="w-12 h-12 mx-auto mb-2 opacity-50"/>Nessun appuntamento per questa data</div>)}
          </div>
          <button onClick={() => { setEditAppt({ date: selectedDate, time: '', title: '', operator: 'A' }); setAgendaModal(true); }} className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus className="w-7 h-7"/></button>
        </div>
      )}

      {/* ✅ MODALI MAGAZZINO */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={closeModal}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl border border-gray-700 shadow-2xl max-h-[80vh] overflow-y-auto p-5" onClick={e=>e.stopPropagation()}>
            <div className="flex justify-between mb-4">
              <h3 className="font-bold">{modal.type==='load'?`📥 Carico - ${modal.descrizione}`:modal.type==='unload'?`📤 Scarico - ${modal.descrizione}`:'⚙️ Riallineamento - '+modal.descrizione}</h3>
              <button onClick={closeModal}><X/></button>
            </div>
            
            {modal.type==='realignment'?(
              <>
                <div className="mb-3">
                  <label className="text-xs text-blue-400">Nome Articolo</label>
                  <input type="text" value={modal.descrizione} onChange={e=>setModal(p=>({...p, descrizione: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-2 mt-1 border border-gray-700 text-white focus:ring-2 focus:ring-blue-500 outline-none"/>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div><label className="text-xs text-green-400">Nuovo</label><input type="number" value={modal.newQtyN} onChange={e=>setModal(p=>({...p,newQtyN:e.target.value}))} className="w-full bg-gray-900 rounded-lg p-2 mt-1"/></div>
                  <div><label className="text-xs text-yellow-400">Rigenerato</label><input type="number" value={modal.newQtyR} onChange={e=>setModal(p=>({...p,newQtyR:e.target.value}))} className="w-full bg-gray-900 rounded-lg p-2 mt-1"/></div>
                </div>
                <label className="flex gap-2 items-center mb-4 p-3 bg-gray-900/50 rounded-xl cursor-pointer text-red-400" onClick={e=>e.stopPropagation()}>
                  <input type="checkbox" checked={delArtConfirm} onChange={e=>{e.stopPropagation();setDelArtConfirm(e.target.checked);}} className="w-5 h-5 text-red-500 rounded"/>
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
                <>
                  {modal.type==='load' && <input type="text" value={modal.origin} onChange={e=>setModal(p=>({...p,origin:e.target.value}))} placeholder="Origine/Fornitore" className="w-full bg-gray-900 rounded-lg p-3 mb-4"/>}
                  {modal.type==='unload' && <input type="text" value={modal.customer} onChange={e=>setModal(p=>({...p,customer:e.target.value}))} placeholder="Cliente" className="w-full bg-gray-900 rounded-lg p-3 mb-4"/>}
                </>
              </>
            )}
            
            <div className="flex gap-3 mt-4">
              <button onClick={closeModal} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button onClick={confirmTx} className={`flex-1 py-3 rounded-xl ${delArtConfirm && modal.type === 'realignment' ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>{delArtConfirm && modal.type === 'realignment' ? '🗑️ Elimina Articolo' : 'Conferma'}</button>
            </div>
          </div>
        </div>
      )}
      
      {addModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={closeAdd}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700">
            <h3 className="font-bold mb-3">📦 Nuovo Articolo - {selectedDept?.label}</h3>
            <input type="text" value={addModal.description} onChange={e=>setAddModal(p=>({...p,description:e.target.value}))} placeholder="Descrizione" className="w-full bg-gray-900 rounded-lg p-3 mb-4" autoFocus/>
            <div className="flex gap-3">
              <button onClick={closeAdd} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button onClick={addArt} className="flex-1 py-3 bg-emerald-600 rounded-xl">Aggiungi</button>
            </div>
          </div>
        </div>
      )}
      
      {addDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={()=>setAddDeptModal({isOpen:false,name:''})}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700">
            <h3 className="font-bold mb-3">📁 Nuovo Reparto</h3>
            <input type="text" value={addDeptModal.name} onChange={e=>setAddDeptModal(p=>({...p,name:e.target.value}))} placeholder="Nome Reparto" className="w-full bg-gray-900 rounded-lg p-3 mb-4" autoFocus/>
            <div className="flex gap-3">
              <button onClick={()=>setAddDeptModal({isOpen:false,name:''})} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button onClick={addDept} className="flex-1 py-3 bg-emerald-600 rounded-xl">Crea</button>
            </div>
          </div>
        </div>
      )}
      
      {delDeptModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={(e) => { if(e.target === e.currentTarget) { setDelDeptModal({isOpen:false,deptId:'',label:''}); setDelOk(false); setHoldProg(0); } }}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-red-900/50" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 font-bold mb-2">⚠️ Elimina Reparto</h3>
            <p className="text-sm text-gray-300 mb-4">Eliminare definitivamente "{delDeptModal.label}" e tutti i suoi articoli?</p>
            <label className="flex gap-2 items-start mb-4 p-3 bg-gray-900/50 rounded-xl cursor-pointer" onClick={e => e.stopPropagation()}>
              <input type="checkbox" checked={delOk} onChange={e => { e.stopPropagation(); setDelOk(e.target.checked); }} className="mt-1 w-5 h-5 text-red-500 rounded"/>
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
            <input type="text" value={editDeptModal.newLabel} onChange={e => setEditDeptModal(p => ({...p, newLabel: e.target.value}))} placeholder="Nuovo nome reparto" className="w-full p-3 bg-gray-900 rounded-xl border border-gray-600 mb-4 focus:ring-2 focus:ring-blue-500 outline-none" autoFocus/>
            <div className="flex gap-3">
              <button onClick={() => setEditDeptModal({isOpen:false, deptId:'', currentLabel:'', newLabel:''})} className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl transition">Annulla</button>
              <button onClick={() => { if (!editDeptModal.newLabel.trim()) return alert('Il nome non può essere vuoto'); sock.current.emit('update_dept', { id: editDeptModal.deptId, label: editDeptModal.newLabel.trim() }); setEditDeptModal({isOpen:false, deptId:'', currentLabel:'', newLabel:''}); }} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition">Salva Modifiche</button>
            </div>
          </div>
        </div>
      )}
      
      {inventoryModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur p-4" onClick={() => setInventoryModal(false)}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📦 Gestione Inventario</h3>
              <button onClick={() => setInventoryModal(false)} className="p-1 hover:bg-gray-700 rounded transition"><X className="w-5 h-5"/></button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {allArticles.length === 0 ? (
                <div className="text-center text-gray-400 py-6">Nessun articolo presente nel database</div>
              ) : (
                allArticles.map(art => (
                  <div key={art.id} className="flex justify-between items-center p-3 bg-gray-900/50 rounded-xl border border-gray-700">
                    <span className="text-gray-200 truncate mr-3 text-sm font-medium">{art.descrizione}</span>
                    <button onClick={() => { setInventoryModal(false); openModal(art.dept_id, art.id, 'realignment'); }} className="p-2 rounded-lg transition text-white/60 hover:bg-white/10 hover:text-white active:scale-90">
                      <Settings className="w-4 h-4"/>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ✅ MODALE AGENDA */}
      {agendaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4" onClick={() => setAgendaModal(false)}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editAppt?.id ? '✏️ Modifica Appuntamento' : '📅 Nuovo Appuntamento'}</h3>
            <input type="date" value={editAppt.date || ''} onChange={e => setEditAppt(p => ({...p, date: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white focus:ring-2 focus:ring-purple-500 outline-none" disabled={!!editAppt?.id}/>
            <input type="time" placeholder="Ora" value={editAppt.time || ''} onChange={e => setEditAppt(p => ({...p, time: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white focus:ring-2 focus:ring-purple-500 outline-none"/>
            <input type="text" placeholder="Cliente / Titolo" value={editAppt.title || ''} onChange={e => setEditAppt(p => ({...p, title: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white focus:ring-2 focus:ring-purple-500 outline-none"/>
            <div className="flex gap-2 mb-4">
              {['A', 'C', 'AC'].map(op => (
                <button key={op} onClick={() => setEditAppt(p => ({...p, operator: op}))} className={`flex-1 py-2 rounded-lg font-bold transition ${editAppt?.operator === op ? (op==='A'?'bg-red-500/40 text-red-300 border border-red-500':op==='C'?'bg-green-500/40 text-green-300 border border-green-500':'bg-purple-500/40 text-purple-300 border border-purple-500') : 'bg-gray-700'}`}>
                  {op}
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setAgendaModal(false); setEditAppt(null); }} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              {editAppt?.id && (
                <button onClick={() => { if(confirm('Eliminare?')) { sock.current.emit('delete_appt', { id: editAppt.id }); setAgendaModal(false); setEditAppt(null); } }} className="py-3 px-4 bg-red-900/50 text-red-400 rounded-xl">
                  <Trash2 className="w-5 h-5"/>
                </button>
              )}
              <button onClick={() => { if(!editAppt.time || !editAppt.title || !editAppt.operator) return alert('Compila tutto'); const payload = { id: editAppt.id || `appt_${Date.now()}`, title: editAppt.title.trim(), date: editAppt.date, time: editAppt.time, operator: editAppt.operator }; sock.current.emit(editAppt.id ? 'update_appt' : 'add_appt', payload); setAgendaModal(false); setEditAppt(null); }} className="flex-1 py-3 bg-purple-600 rounded-xl font-bold">Salva</button>
            </div>
          </div>
        </div>
      )}

      {/* ✅ V4.0 MODALI TO-DO & FATTURE */}
      {todoModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4" onClick={() => setTodoModal({ open: false, editId: null, title: '', priority: 'medium', due_date: '' })}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">📝 {todoModal.editId ? 'Modifica Attività' : 'Nuova Attività'}</h3>
            <input type="text" placeholder="Titolo attività" value={todoModal.title} onChange={e => setTodoModal(p => ({...p, title: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white focus:ring-2 focus:ring-orange-500 outline-none"/>
            <select value={todoModal.priority} onChange={e => setTodoModal(p => ({...p, priority: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white outline-none">
              <option value="low">Bassa</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>
            <input type="date" value={todoModal.due_date} onChange={e => setTodoModal(p => ({...p, due_date: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-4 border border-gray-700 text-white outline-none"/>
            <div className="flex gap-3">
              <button onClick={() => setTodoModal({ open: false, editId: null, title: '', priority: 'medium', due_date: '' })} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button onClick={handleAddTodo} className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 rounded-xl font-bold">Salva</button>
            </div>
          </div>
        </div>
      )}
      
      {invoiceModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4" onClick={() => setInvoiceModal({ open: false, editId: null, customer: '', amount: '', status: 'pending', due_date: '', notes: '' })}>
          <div className="w-full max-w-md bg-gray-800 rounded-2xl p-5 border border-gray-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">🧾 {invoiceModal.editId ? 'Modifica Fattura' : 'Nuova Fattura'}</h3>
            <input type="text" placeholder="Cliente" value={invoiceModal.customer} onChange={e => setInvoiceModal(p => ({...p, customer: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white focus:ring-2 focus:ring-emerald-500 outline-none"/>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input type="number" step="0.01" placeholder="Importo €" value={invoiceModal.amount} onChange={e => setInvoiceModal(p => ({...p, amount: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 border border-gray-700 text-white outline-none"/>
              <select value={invoiceModal.status} onChange={e => setInvoiceModal(p => ({...p, status: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 border border-gray-700 text-white outline-none">
                <option value="pending">Da emettere</option>
                <option value="issued">Emessa</option>
                <option value="paid">Pagata</option>
                <option value="cancelled">Annullata</option>
              </select>
            </div>
            <input type="date" value={invoiceModal.due_date} onChange={e => setInvoiceModal(p => ({...p, due_date: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-3 border border-gray-700 text-white outline-none"/>
            <textarea placeholder="Note aggiuntive" value={invoiceModal.notes} onChange={e => setInvoiceModal(p => ({...p, notes: e.target.value}))} className="w-full bg-gray-900 rounded-lg p-3 mb-4 border border-gray-700 text-white outline-none resize-none h-20"/>
            <div className="flex gap-3">
              <button onClick={() => setInvoiceModal({ open: false, editId: null, customer: '', amount: '', status: 'pending', due_date: '', notes: '' })} className="flex-1 py-3 bg-gray-700 rounded-xl">Annulla</button>
              <button onClick={handleSaveInvoice} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl font-bold">Salva</button>
            </div>
          </div>
        </div>
      )}

      {auth.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/95 p-4">
          <div className="w-full max-w-sm bg-gray-800 rounded-2xl p-6 border border-gray-700 text-center">
            <h2 className="text-xl font-bold mb-2">Accesso Richiesto</h2>
            <p className="text-gray-400 text-sm mb-4">Inserisci la chiave per sincronizzare il magazzino</p>
            <form onSubmit={e => { e.preventDefault(); connect(auth.key.trim()); }}>
              <input type="password" value={auth.key} onChange={e => setAuth(p => ({...p, key: e.target.value}))} placeholder="Chiave di accesso" className="w-full bg-gray-900 border border-gray-700 rounded-xl p-3 text-center mb-3 outline-none focus:ring-2 focus:ring-blue-500" autoFocus/>
              {auth.err && <p className="text-red-400 text-sm mb-2">Chiave errata</p>}
              <button type="submit" className="w-full py-3 bg-blue-600 rounded-xl font-bold">Accedi</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}