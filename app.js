/* ============ Dompet — catatan keuangan ============ */
const LS = 'dompet.v1';

const EXP = [
  { id:'makan',    n:'Makan',     i:'🍜', c:'#ff8a4c' },
  { id:'transport',n:'Transport', i:'🛵', c:'#4cc9f0' },
  { id:'belanja',  n:'Belanja',   i:'🛍️', c:'#ff5c8a' },
  { id:'tagihan',  n:'Tagihan',   i:'🧾', c:'#ffb340' },
  { id:'kos',      n:'Kos',       i:'🏠', c:'#a78bfa' },
  { id:'kesehatan',n:'Sehat',     i:'💊', c:'#34d399' },
  { id:'hiburan',  n:'Hiburan',   i:'🎮', c:'#f472b6' },
  { id:'pulsa',    n:'Pulsa',     i:'📱', c:'#60a5fa' },
  { id:'ngopi',    n:'Ngopi',     i:'☕', c:'#d6a06a' },
  { id:'lain',     n:'Lainnya',   i:'✨', c:'#8b93a7' },
];
const INC = [
  { id:'gaji',   n:'Gaji',    i:'💼', c:'#22d68a' },
  { id:'bonus',  n:'Bonus',   i:'🎁', c:'#4ade80' },
  { id:'jualan', n:'Jualan',  i:'🏪', c:'#34d399' },
  { id:'tf',     n:'Transfer',i:'💸', c:'#2dd4bf' },
  { id:'bunga',  n:'Bunga',   i:'📈', c:'#86efac' },
  { id:'lain',   n:'Lainnya', i:'✨', c:'#8b93a7' },
];
/* Tabungan & aset: BUKAN pemasukan/pengeluaran. Nilainya nambah kekayaan,
   tapi tidak masuk hitungan arus kas (Masuk/Keluar) maupun saldo bulanan. */
const SAV = [
  { id:'darurat',  n:'Darurat',  i:'🛟', c:'#4cc9f0' },
  { id:'tabungan', n:'Tabungan', i:'🏦', c:'#22d68a' },
  { id:'reksa',    n:'Reksa',    i:'📈', c:'#a78bfa' },
];
const AST = [
  { id:'motor',    n:'Motor',    i:'🛵', c:'#ff8a4c' },
  { id:'elektronik',n:'Elektronik',i:'💻',c:'#60a5fa' },
  { id:'tanah',    n:'Tanah',    i:'🏞️', c:'#34d399' },
  { id:'emas',     n:'Emas',     i:'🪙', c:'#ffc64d' },
  { id:'lain',     n:'Lainnya',  i:'✨', c:'#8b93a7' },
];
const ALL = [...EXP, ...INC, ...SAV, ...AST];
const poolOf = (type) => type === 'in' ? INC : type === 'sav' ? SAV : type === 'ast' ? AST : EXP;
const catOf = (id, type) => poolOf(type).find(c => c.id === id)
  || ALL.find(c => c.id === id) || { n:'Lainnya', i:'✨', c:'#8b93a7' };

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

/* ---------- state ---------- */
let db = load();
let cursor = monthKey(new Date());        // "2026-11"
let form = { type:'out', cat:'makan', id:null };
let detailId = null;
let showAll = false;

function load(){
  try {
    const raw = localStorage.getItem(LS);
    if (raw) { const d = JSON.parse(raw); if (Array.isArray(d.tx)) return migrate(d); }
  } catch(e){}
  const s = seed();
  s.demo = true;
  s.schema = 2;
  try { localStorage.setItem(LS, JSON.stringify(s)); } catch(e){}
  return s;
}
/* v2 (Nov 2026): kategori Emas pindah dari Tabungan ke Aset.
   Record lama yang mencatat emas sebagai tabungan ikut dipindah, sekali saja,
   supaya total Tabungan/Aset tidak beda dengan yang lo lihat di menu. */
function migrate(d){
  if (d.schema >= 2) return d;
  let n = 0;
  (d.tx || []).forEach(t => {
    if (!t.deleted && t.type === 'sav' && t.cat === 'emas') { t.type = 'ast'; t.updated = Date.now(); n++; }
  });
  d.schema = 2;
  try { localStorage.setItem(LS, JSON.stringify(d)); } catch(e){}
  if (n) setTimeout(() => toast(n + ' catatan emas dipindah ke Aset'), 900);
  return d;
}
function save(){
  try { localStorage.setItem(LS, JSON.stringify(db)); } catch(e){ toast('Gagal menyimpan'); }
  if (window.SYNC) SYNC.touch();
}
/* `let db` bukan properti window — sync.js butuh akses lewat getter ini. */
window.getDB = () => db;
window.saveDB = save;

function seed(){
  const t = new Date();
  const d = (n) => { const x = new Date(t); x.setDate(x.getDate() - n); return iso(x); };
  const m = new Date(t.getFullYear(), t.getMonth(), 1);
  return { tx: [
    { id:uid(), type:'in',  amt:6500000, cat:'gaji',   note:'Gaji bulanan',      date:iso(m) },
    { id:uid(), type:'out', amt:1500000, cat:'kos',    note:'Sewa kos',          date:iso(m) },
    { id:uid(), type:'out', amt:42000,   cat:'makan',  note:'Nasi padang',       date:d(0) },
    { id:uid(), type:'out', amt:18000,   cat:'ngopi',  note:'Kopi susu',         date:d(0) },
    { id:uid(), type:'out', amt:25000,   cat:'transport', note:'Gojek kantor',   date:d(1) },
    { id:uid(), type:'out', amt:245000,  cat:'belanja',note:'Belanja bulanan',   date:d(2) },
    { id:uid(), type:'out', amt:120000,  cat:'tagihan',note:'Token listrik',     date:d(3) },
    { id:uid(), type:'out', amt:55000,   cat:'hiburan',note:'Langganan streaming',date:d(4) },
    { id:uid(), type:'in',  amt:750000,  cat:'jualan', note:'Jual baju preloved',date:d(5) },
    { id:uid(), type:'out', amt:85000,   cat:'makan',  note:'Makan bareng temen',date:d(6) },
  ], opening: { amount: 2500000, month: monthKey(new Date(t.getFullYear(), t.getMonth()-1, 1)) } };
}

/* ---------- helpers ---------- */
function uid(){ return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
function iso(d){ const p = n => String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; }
function monthKey(d){ return iso(d).slice(0,7); }
function rp(n, short){
  n = Math.round(n);
  if (short && Math.abs(n) >= 1000000) return 'Rp ' + (n/1000000).toFixed(n % 1000000 === 0 ? 0 : 1).replace('.', ',') + 'jt';
  if (short && Math.abs(n) >= 10000) return 'Rp ' + Math.round(n/1000) + 'rb';
  return 'Rp ' + n.toLocaleString('id-ID');
}
function num(s){ return parseInt(String(s).replace(/[^\d]/g,''), 10) || 0; }
function monthLabel(k){ const [y,m] = k.split('-'); return `${MONTHS[+m-1]} ${y}`; }
function dayLabel(d){
  const today = iso(new Date());
  const y = new Date(); y.setDate(y.getDate()-1);
  if (d === today) return 'Hari ini';
  if (d === iso(y)) return 'Kemarin';
  const dt = new Date(d + 'T00:00:00');
  return `${dt.getDate()} ${MONTHS[dt.getMonth()].slice(0,3)} ${dt.getFullYear()}`;
}
function shiftMonth(k, delta){
  const [y,m] = k.split('-').map(Number);
  const d = new Date(y, m-1+delta, 1);
  return monthKey(d);
}
function inMonth(k){ return db.tx.filter(t => !t.deleted && t.date.startsWith(k)); }
/* arus kas = masuk/keluar saja. tabungan & aset punya jalur sendiri. */
const isFlow = (t) => t.type === 'in' || t.type === 'out';
const isSave = (t) => t.type === 'sav' || t.type === 'ast';
const signOf = (t) => t.type === 'in' ? 1 : t.type === 'out' ? -1 : 0;
/* nilai tabungan/aset per bulan = akumulasi semua record sampai bulan itu */
function saveTotalAt(k, type){
  return db.tx.filter(t => !t.deleted && t.type === type && t.date.slice(0,7) <= k)
    .reduce((a,t) => a + t.amt, 0);
}
function saveTotal(type){ return saveTotalAt('9999-12', type); }
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('on');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 1900);
}

/* ---------- render: home ---------- */
/* ---------- saldo berjalan ---------- */
// total netto semua transaksi sebelum bulan tertentu (inklusif/batas)
function netBefore(monthK){
  return db.tx.filter(t => !t.deleted && isFlow(t)).reduce((a,t) => t.date.slice(0,7) < monthK
    ? a + signOf(t) * t.amt : a, 0);
}
// saldo awal sebuah bulan = saldo awal tersimpan (kalau bulannya lebih tua) + semua transaksi sebelum bulan itu
function openingOf(monthK){
  const base = db.opening || {};
  if (!base.month || base.month >= monthK) {
    // belum ada saldo awal tersimpan yang berlaku, atau diset setelah bulan ini → pakai apa adanya
    if (base.month === monthK) return base.amount;
    return netBefore(monthK);
  }
  // saldo awal berlaku: hitung hanya transaksi dari bulan saldo awal s/d sebelum bulan ini
  const from = base.month;
  const move = db.tx.filter(t => !t.deleted && isFlow(t)).reduce((a,t) => {
    const k = t.date.slice(0,7);
    return (k >= from && k < monthK) ? a + signOf(t) * t.amt : a;
  }, 0);
  return base.amount + move;
}
function closingOf(monthK){
  return openingOf(monthK) + monthNet(monthK);
}
function monthNet(monthK){
  return db.tx.filter(t => !t.deleted && isFlow(t)).reduce((a,t) => t.date.slice(0,7) === monthK
    ? a + signOf(t) * t.amt : a, 0);
}

function renderHome(){
  const list = inMonth(cursor);
  const tin  = list.filter(t => t.type === 'in').reduce((a,t) => a + t.amt, 0);
  const tout = list.filter(t => t.type === 'out').reduce((a,t) => a + t.amt, 0);

  const opening = openingOf(cursor);
  const closing = opening + tin - tout;
  const savTot = saveTotalAt(cursor, 'sav');
  const astTot = saveTotalAt(cursor, 'ast');
  const savMonth = list.filter(t => t.type === 'sav').reduce((a,t) => a + t.amt, 0);
  const astMonth = list.filter(t => t.type === 'ast').reduce((a,t) => a + t.amt, 0);

  const balEl = document.getElementById('hBal');
  balEl.textContent = (closing < 0 ? '−' : '') + rp(Math.abs(closing));
  balEl.classList.toggle('neg', closing < 0);
  document.getElementById('hBalLbl').textContent = 'Duit Lo Sekarang';

  document.getElementById('hIn').textContent  = rp(tin, true);
  document.getElementById('hOut').textContent = rp(tout, true);

  const sEl = document.getElementById('hSav'), aEl = document.getElementById('hAst');
  if (sEl) {
    sEl.textContent = rp(savTot, true);
    document.getElementById('hSavSub').textContent =
      savMonth > 0 ? '+' + rp(savMonth, true).replace('Rp ','') + ' bulan ini' : 'tidak termasuk arus kas';
  }
  if (aEl) {
    aEl.textContent = rp(astTot, true);
    document.getElementById('hAstSub').textContent =
      astMonth > 0 ? '+' + rp(astMonth, true).replace('Rp ','') + ' bulan ini' : 'tidak termasuk arus kas';
  }
  const nwEl = document.getElementById('hNet');
  if (nwEl) {
    const nw = closing + savTot + astTot;
    nwEl.textContent = (nw < 0 ? '−' : '') + rp(Math.abs(nw), true);
    nwEl.classList.toggle('neg', nw < 0);
  }

  // Hutang = total kekayaan negatif (kalau minus) atau 0
  const debtEl = document.getElementById('hDebt');
  if (debtEl) {
    const debt = Math.max(0, -(closing + savTot + astTot));
    debtEl.textContent = rp(debt, true);
    debtEl.classList.toggle('neg', debt > 0);
  }

  document.getElementById('hMonth').textContent = monthLabel(cursor);

  document.getElementById('hFlowNote').innerHTML =
    `<span>Saldo awal</span> <b>${opening < 0 ? '−' : ''}${rp(Math.abs(opening), true).replace('Rp ','')}</b>
     <span class="arw">+</span> <b style="color:#22d68a">${rp(tin, true).replace('Rp ','')}</b>
     <span class="arw">−</span> <b style="color:#ff5c72">${rp(tout, true).replace('Rp ','')}</b>
     <span class="arw">=</span> <b>${closing < 0 ? '−' : ''}${rp(Math.abs(closing), true).replace('Rp ','')}</b>`;

  const days = new Set(list.map(t => t.date)).size;
  let sub;
  if (!list.length) sub = `Belum ada transaksi · bawa saldo ${rp(opening, true)} dari bulan lalu`;
  else {
    sub = `${list.length} transaksi · ${days} hari aktif`;
    if (tout > 0 && opening + tin > 0) {
      const burn = Math.round(tout / (opening + tin) * 100);
      sub += ` · ${burn}% dana terpakai`;
    }
  }
  document.getElementById('hSub').textContent = sub;

  renderDonut(list, tout);
  renderList(list, 'homeList', showAll ? null : 12);
  document.getElementById('demoBanner').classList.toggle('hidden', !db.demo);
  document.getElementById('btnSeeAll').textContent =
    list.length > 12 && !showAll ? `Lihat semua (${list.length})` : 'Statistik ›';
}

function renderDonut(list, tout){
  const byCat = {};
  list.filter(t => t.type === 'out').forEach(t => { byCat[t.cat] = (byCat[t.cat] || 0) + t.amt; });
  const rows = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const arcs = document.getElementById('donutArcs');
  const legend = document.getElementById('legend');
  const C = 2 * Math.PI * 46;

  document.getElementById('donutTotal').textContent = tout ? rp(tout, true) + ' keluar' : '';
  arcs.innerHTML = ''; legend.innerHTML = '';

  if (!rows.length){
    document.getElementById('donutVal').textContent = '—';
    legend.innerHTML = '<div class="empty">Belum ada pengeluaran<br>bulan ini 🎉</div>';
    return;
  }
  document.getElementById('donutVal').textContent = rp(tout, true);

  let off = 0;
  rows.forEach(([cid, amt]) => {
    const c = catOf(cid, 'out');
    const len = (amt / tout) * C;
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    el.setAttribute('cx', 59); el.setAttribute('cy', 59); el.setAttribute('r', 46);
    el.setAttribute('fill', 'none');
    el.setAttribute('stroke', c.c);
    el.setAttribute('stroke-width', 15);
    el.setAttribute('stroke-linecap', 'butt');
    el.setAttribute('stroke-dasharray', `${Math.max(len - 2.5, 1)} ${C}`);
    el.setAttribute('stroke-dashoffset', -off);
    el.style.opacity = .95;
    arcs.appendChild(el);
    off += len;
  });

  rows.slice(0, 5).forEach(([cid, amt]) => {
    const c = catOf(cid, 'out');
    const d = document.createElement('div');
    d.className = 'li';
    d.innerHTML = `<i class="sw" style="background:${c.c}"></i>
      <span class="nm">${c.n}</span>
      <span class="am">${Math.round(amt/tout*100)}%</span>`;
    legend.appendChild(d);
  });
  if (rows.length > 5){
    const d = document.createElement('div');
    d.className = 'li';
    d.innerHTML = `<i class="sw" style="background:#3a4155"></i><span class="nm">+${rows.length-5} lainnya</span>`;
    legend.appendChild(d);
  }
}

function renderList(list, mountId, limit){
  const mount = document.getElementById(mountId);
  if (!list.length){
    mount.innerHTML = '<div class="empty" style="padding:30px 0">Belum ada catatan.<br>Tekan tombol + buat mulai.</div>';
    return;
  }
  const sorted = [...list].sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const shown = limit ? sorted.slice(0, limit) : sorted;

  const groups = {};
  shown.forEach(t => { (groups[t.date] = groups[t.date] || []).push(t); });

  let html = '';
  Object.keys(groups).sort().reverse().forEach(date => {
    const items = groups[date];
    const net = items.reduce((a,t) => a + signOf(t) * t.amt, 0);
    html += `<div class="dayhead"><span>${dayLabel(date)}</span>
      <span class="net" style="color:${net>=0?'#22d68a':'#ff8b9b'}">${net>=0?'+':'−'}${rp(Math.abs(net),true).replace('Rp ','')}</span></div><div class="list">`;
    items.forEach(t => {
      const c = catOf(t.cat, t.type);
      const sign = t.type === 'in' ? '+' : t.type === 'out' ? '−' : '';
      const cls = t.type === 'in' ? 'g' : t.type === 'out' ? 'r' : 'b';
      html += `<div class="row" data-id="${t.id}">
        <div class="av">${c.i}</div>
        <div class="body">
          <div class="t">${esc(t.note || c.n)}</div>
          <div class="c"><span style="color:${c.c}">${c.n}</span></div>
        </div>
        <div class="amt ${cls}">${sign}${rp(t.amt, true).replace('Rp ','')}</div>
      </div>`;
    });
    html += '</div>';
  });
  mount.innerHTML = html;
  mount.querySelectorAll('.row').forEach(r => r.onclick = () => openDetail(r.dataset.id));
}
function esc(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }

/* ---------- render: stats ---------- */
function renderStats(){
  const list = inMonth(cursor);
  const tin  = list.filter(t => t.type === 'in').reduce((a,t) => a + t.amt, 0);
  const tout = list.filter(t => t.type === 'out').reduce((a,t) => a + t.amt, 0);
  document.getElementById('sMonth').textContent = monthLabel(cursor);

  const savM = list.filter(t => t.type === 'sav').reduce((a,t) => a + t.amt, 0);
  const astM = list.filter(t => t.type === 'ast').reduce((a,t) => a + t.amt, 0);
  const sSav = document.getElementById('sSav'), sAst = document.getElementById('sAst');
  if (sSav) sSav.textContent = rp(savM, true);
  if (sAst) sAst.textContent = rp(astM, true);

  const days = new Date(+cursor.slice(0,4), +cursor.slice(5,7), 0).getDate();
  const isNow = cursor === monthKey(new Date());
  const denom = isNow ? new Date().getDate() : days;
  const avg = tout / Math.max(denom, 1);
  document.getElementById('sAvg').textContent = rp(avg);
  document.getElementById('sNote').textContent = tin > 0
    ? `${rp(tout,true)} keluar dari ${rp(tin,true)} masuk · ${list.length} transaksi`
    : `${rp(tout,true)} keluar · ${list.length} transaksi`;

  const byCat = {};
  list.filter(t => t.type === 'out').forEach(t => byCat[t.cat] = (byCat[t.cat]||0) + t.amt);
  const rows = Object.entries(byCat).sort((a,b) => b[1]-a[1]);
  const bars = document.getElementById('sBars');
  if (!rows.length){ bars.innerHTML = '<div class="empty">Belum ada pengeluaran bulan ini</div>'; }
  else {
    const max = rows[0][1];
    bars.innerHTML = rows.map(([cid, amt]) => {
      const c = catOf(cid, 'out');
      const pct = Math.round(amt/tout*100);
      return `<div class="bar-row">
        <div class="bl"><b>${c.i} ${c.n}</b><span style="color:#8b93a7">${rp(amt,true)} · ${pct}%</span></div>
        <div class="track"><i style="width:${Math.max(amt/max*100,4)}%;background:linear-gradient(90deg,${c.c},${c.c}bb)"></i></div>
      </div>`;
    }).join('');
  }

  // tren: hanya bulan yang ada isinya, maksimal 6 bulan terakhir
  const ml = [];
  for (let i = 5; i >= 0; i--) {
    const k = shiftMonth(cursor, -i);
    if (inMonth(k).length) ml.push(k);
  }
  const maxNet = Math.max(1, ...ml.map(k => Math.abs(
    inMonth(k).reduce((a,t) => a + (t.type==='in'? t.amt : -t.amt), 0))));

  const mount = document.getElementById('sMonths');
  if (!ml.length){
    mount.innerHTML = '<div class="empty">Belum ada data untuk dibandingkan.<br>Catat beberapa transaksi dulu.</div>';
    return;
  }
  mount.innerHTML = ml.map(k => {
    const l = inMonth(k);
    const i2 = l.filter(t => t.type==='in').reduce((a,t)=>a+t.amt,0);
    const o2 = l.filter(t => t.type==='out').reduce((a,t)=>a+t.amt,0);
    const net = i2 - o2;
    const close = closingOf(k);
    const col = net >= 0 ? '#22d68a' : '#ff5c72';
    const barW = Math.min(Math.abs(net)/maxNet*100, 100);
    return `<div class="mrow" data-m="${k}">
      <div class="mbar"><i style="height:${Math.max(barW,8)}%;background:${col}"></i></div>
      <div class="mm"><b>${monthLabel(k)}</b>
        <small>masuk ${rp(i2,true)} · keluar ${rp(o2,true)}</small></div>
      <div class="mright">
        <div class="net" style="color:${col}">${net<0?'−':'+'}${rp(Math.abs(net),true).replace('Rp ','')}</div>
        <small class="carry">saldo ${close<0?'−':''}${rp(Math.abs(close),true).replace('Rp ','')}</small>
      </div>
    </div>`;
  }).join('');
  mount.querySelectorAll('.mrow').forEach(el => el.onclick = () => {
    cursor = el.dataset.m; renderAll(); switchView('home');
  });
}

/* ---------- form ---------- */
function openTx(preset){
  form = Object.assign({ type:'out', cat:'makan', id:null }, preset || {});
  const editing = !!form.id;
  document.getElementById('txTitle').textContent = editing ? 'Ubah transaksi' : 'Catat transaksi';
  document.getElementById('btnDelete').classList.toggle('hidden', !editing);

  const rec = editing ? db.tx.find(t => t.id === form.id) : null;
  if (rec) { form.type = rec.type; form.cat = rec.cat; }
  setSeg(form.type);
  document.getElementById('fAmount').value = rec ? rec.amt.toLocaleString('id-ID') : '';
  document.getElementById('fNote').value   = rec ? (rec.note || '') : '';
  document.getElementById('fDate').value   = rec ? rec.date : iso(new Date());

  renderCats();
  showSheet('sheetTx');
  if (!editing) setTimeout(() => document.getElementById('fAmount').focus(), 320);
}

function setSeg(type){
  form.type = type;
  /* jangan baca el.dataset.t — di WebView ini nilainya bisa basi.
     pakai peta eksplisit: id -> tipe. */
  const SEGMAP = { segOut:'out', segIn:'in', segSav:'sav', segAst:'ast' };
  Object.keys(SEGMAP).forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('data-t', SEGMAP[id]);
    el.classList.toggle('on', SEGMAP[id] === type);
  });
  const ph = { in:'misal: gaji november', out:'misal: nasi padang',
               sav:'misal: nabung bulanan', ast:'misal: beli laptop' };
  document.getElementById('fNote').placeholder = ph[type] || '';
  const pool = poolOf(type);
  if (!pool.some(c => c.id === form.cat)) form.cat = pool[0].id;
  /* field saldo awal & tombol hapus hanya relevan untuk arus kas */
  renderCats();
}

function renderCats(){
  const list = poolOf(form.type);
  if (!list.some(c => c.id === form.cat)) form.cat = list[0].id;
  const g = document.getElementById('catGrid');
  g.style.gridTemplateColumns = `repeat(${list.length <= 6 ? 3 : 5},1fr)`;
  g.innerHTML = list.map(c =>
    `<button class="cat ${c.id === form.cat ? 'on':''}" data-c="${c.id}">${c.i}<b>${c.n}</b></button>`
  ).join('');
  g.querySelectorAll('.cat').forEach(b => b.onclick = () => { form.cat = b.dataset.c; renderCats(); });
}

function saveTx(){
  const amt  = num(document.getElementById('fAmount').value);
  const date = document.getElementById('fDate').value || iso(new Date());
  const note = document.getElementById('fNote').value.trim();
  if (amt <= 0) return toast('Jumlah belum diisi');

  if (form.id){
    const t = db.tx.find(x => x.id === form.id);
    if (t) Object.assign(t, { type:form.type, amt, cat:form.cat, note, date, updated:Date.now() });
    toast('Transaksi diubah');
  } else {
    db.tx.push({ id:uid(), type:form.type, amt, cat:form.cat, note, date, updated:Date.now() });
    toast({ in:'Pemasukan tercatat ✓', out:'Pengeluaran tercatat ✓',
            sav:'Tabungan dicatat ✓', ast:'Aset dicatat ✓' }[form.type] || 'Tercatat ✓');
  }
  db.demo = false; showAll = false;
  cursor = date.slice(0,7);
  save(); closeSheets(); renderAll();
}

function delTx(){
  if (!form.id) return;
  if (!confirm('Hapus transaksi ini? Tidak bisa dibatalkan.')) return;
  const rec = db.tx.find(t => t.id === form.id);
  if (rec) {                       // tombstone: device lain ikut menghapus
    rec.deleted = true;
    rec.updated = Date.now();
  } else {
    db.tx = db.tx.filter(t => t.id !== form.id);
  }
  save(); closeSheets(); renderAll(); toast('Transaksi dihapus');
}

/* ---------- detail ---------- */
function openDetail(id){
  const t = db.tx.find(x => x.id === id); if (!t) return;
  detailId = id;
  const c = catOf(t.cat, t.type);
  document.getElementById('detailBody').innerHTML = `
    <div style="text-align:center;padding:6px 0 20px">
      <div class="av" style="width:64px;height:64px;flex:none;margin:0 auto 14px;font-size:30px;border-radius:20px">${c.i}</div>
      <div style="font-size:27px;font-weight:800;letter-spacing:-.5px;color:${typeCol(t.type)};font-variant-numeric:tabular-nums">
        ${t.type==='in'?'+':t.type==='out'?'−':''}${rp(t.amt)}
      </div>
      <div style="font-size:13px;color:#8b93a7;margin-top:8px">${esc(t.note || c.n)}</div>
    </div>
    <div style="background:#0d1018;border:1px solid #252b3a;border-radius:15px;padding:4px 14px;margin-bottom:14px">
      ${drow('Kategori', `${c.i} ${c.n}`)}
      ${drow('Jenis', t.type === 'in' ? 'Pemasukan' : t.type === 'out' ? 'Pengeluaran' : t.type === 'sav' ? 'Tabungan' : 'Aset')}
      ${drow('Tanggal', dayLabel(t.date) + ' · ' + t.date.split('-').reverse().join('/'))}
    </div>`;
  showSheet('sheetDetail');
}
/* warna per jenis transaksi */
function typeCol(type){
  return type === 'in' ? '#22d68a' : type === 'out' ? '#ff5c72'
       : type === 'sav' ? '#4cc9f0' : '#ffb340';
}
function drow(k, v){
  return `<div style="display:flex;justify-content:space-between;padding:12px 0;border-bottom:1px solid #1b1f2b;font-size:13px">
    <span style="color:#8b93a7">${k}</span><span style="font-weight:600">${v}</span></div>`;
}

/* ---------- sheets ---------- */
function showSheet(id){
  document.getElementById('backdrop').classList.add('on');
  document.getElementById(id).classList.add('on');
  document.getElementById('app').classList.add('sheet-open');
  document.body.classList.add('locked');
}
function closeSheets(){
  document.getElementById('backdrop').classList.remove('on');
  document.querySelectorAll('.sheet').forEach(s => s.classList.remove('on'));
  document.getElementById('app').classList.remove('sheet-open');
  document.body.classList.remove('locked');
}

/* ---------- views ---------- */
function switchView(v){
  document.querySelectorAll('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
  document.querySelectorAll('.nav button[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  window.scrollTo({ top:0, behavior:'smooth' });
}

/* ---------- saldo awal ---------- */
function openSaldo(){
  const base = db.opening || {};
  document.getElementById('fSaldo').value = base.amount ? base.amount.toLocaleString('id-ID') : '';
  document.getElementById('fSaldoMonth').value = base.month || monthKey(new Date());
  showSheet('sheetSaldo');
  setTimeout(() => document.getElementById('fSaldo').focus(), 320);
}
function saveSaldo(){
  const amt = num(document.getElementById('fSaldo').value);
  const m   = document.getElementById('fSaldoMonth').value || monthKey(new Date());
  db.opening = { amount: amt, month: m, updated: Date.now() };
  db.demo = false;
  save(); closeSheets(); renderAll();
  toast('Saldo awal ' + rp(amt, true) + ' diset');
}

/* ---------- sync UI ---------- */
function openSync(){
  const c = SYNC.cfg;
  document.getElementById('fRoom').value = c.room || '';
  document.getElementById('fKey').value = c.key || '';
  document.getElementById('fServer').value = c.url || '';
  renderSyncState();
  showSheet('sheetSync');
}

function renderSyncState(detail){
  const el = document.getElementById('syncState');
  if (!el) return;
  const st = SYNC.status(detail);
  el.className = 'sync-state' + (st.connected ? ' ok' : st.on ? '' : '');
  el.textContent = st.text;
}

window.updateSyncUI = renderSyncState;

function saveSyncCfg(){
  const room = document.getElementById('fRoom').value.trim();
  const key = document.getElementById('fKey').value.trim();
  const server = document.getElementById('fServer').value.trim().replace(/\/+$/, '');
  if (!room) { toast('Kode ruang masih kosong'); return; }
  if (!/^https?:\/\//i.test(server)) { toast('Alamat server harus http:// atau https://'); return; }
  SYNC.set(server, room, key);
  renderSyncState();
  toast('Sync disiapkan — menarik data…');
  setTimeout(() => SYNC.pullNow(), 100);
}

async function makeRoom(){
  const server = document.getElementById('fServer').value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(server)) { toast('Isi alamat server dulu'); return; }
  // set dulu alamatnya supaya createRoom tahu base URL
  SYNC.cfg.url = server;
  toast('Membuat ruang…');
  try {
    const r = await SYNC.createRoom();
    document.getElementById('fRoom').value = r.room;
    document.getElementById('fKey').value = r.key;
    SYNC.set(server, r.room, r.key);
    renderSyncState();
    toast('Ruang dibuat — bagikan kode & kunci ke keluarga');
  } catch(e) {
    toast('Gagal membuat ruang');
  }
}

function syncOff(){
  if (!confirm('Matikan sync di device ini? Data lokal tetap ada.')) return;
  SYNC.off();
  renderSyncState();
  toast('Sync dimatikan');
}

/* ---------- export ---------- */
function exportJson(){
  const blob = new Blob([JSON.stringify(db, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dompet-${iso(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('Backup diunduh');
}

/* ---------- boot ---------- */
function bindAmount(el, onEnter){
  el.addEventListener('input', () => {
    const v = num(el.value);
    el.value = v ? v.toLocaleString('id-ID') : '';
  });
  el.addEventListener('keydown', e => { if (e.key === 'Enter') onEnter(); });
}
function renderAll(){ renderHome(); renderStats(); }

function init(){
  const h = new Date().getHours();
  const g = h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 19 ? 'Sore' : 'Malam';
  document.getElementById('greet').textContent = `${g}, catatan keuangan lo`;

  document.getElementById('btnAdd').onclick = () => openTx();
  document.getElementById('btnSave').onclick = saveTx;
  document.getElementById('btnDelete').onclick = delTx;
  document.getElementById('segOut').onclick = () => setSeg('out');
  document.getElementById('segIn').onclick  = () => setSeg('in');
  const sSav = document.getElementById('segSav'); if (sSav) sSav.onclick = () => setSeg('sav');
  const sAst = document.getElementById('segAst'); if (sAst) sAst.onclick = () => setSeg('ast');
  document.getElementById('backdrop').onclick = closeSheets;
  document.getElementById('btnCloseDetail').onclick = closeSheets;
  document.getElementById('btnEdit').onclick = () => { const id = detailId; closeSheets(); setTimeout(() => openTx({ id, type:(db.tx.find(t=>t.id===id)||{}).type }), 120); };
  document.getElementById('btnExport').onclick = exportJson;
  document.getElementById('btnSync').onclick = openSync;
  document.getElementById('btnSyncSave').onclick = saveSyncCfg;
  document.getElementById('btnRoomNew').onclick = makeRoom;
  document.getElementById('btnSyncOff').onclick = syncOff;
  document.getElementById('btnSaldoAwal').onclick = openSaldo;
  document.getElementById('btnSaveSaldo').onclick = saveSaldo;
  document.getElementById('btnCloseSaldo').onclick = closeSheets;
  document.getElementById('btnClearDemo').onclick = () => {
    if (!confirm('Hapus semua data contoh dan mulai dari nol?')) return;
    db = { tx: [], opening: null };
    save(); renderAll(); toast('Data contoh dihapus');
  };

  document.getElementById('chipPrev').onclick = () => { cursor = shiftMonth(cursor, -1); showAll = false; renderAll(); };
  document.getElementById('chipNow').onclick  = () => { cursor = monthKey(new Date()); showAll = false; renderAll(); };
  document.getElementById('sPrev').onclick = () => { cursor = shiftMonth(cursor, -1); renderAll(); };
  document.getElementById('sNext').onclick = () => { cursor = shiftMonth(cursor,  1); renderAll(); };
  document.getElementById('btnSeeAll').onclick = () => {
    const n = inMonth(cursor).length;
    if (n > 12 && !showAll){ showAll = true; renderAll(); return; }
    switchView('stats');
  };

  document.querySelectorAll('.nav button[data-view]').forEach(b =>
    b.onclick = () => switchView(b.dataset.view));

  bindAmount(document.getElementById('fSaldo'), saveSaldo);
  bindAmount(document.getElementById('fAmount'), () => document.getElementById('fNote').focus());

  // swipe down to close sheets
  document.querySelectorAll('.sheet').forEach(sh => {
    let y0 = null;
    sh.addEventListener('touchstart', e => { if (sh.scrollTop <= 0) y0 = e.touches[0].clientY; });
    sh.addEventListener('touchmove', e => {
      if (y0 === null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy > 0) sh.style.transform = `translateY(${dy}px)`;
    });
    sh.addEventListener('touchend', e => {
      if (y0 === null) return;
      const dy = (e.changedTouches[0].clientY - y0);
      sh.style.transform = '';
      if (dy > 90) closeSheets();
      y0 = null;
    });
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheets(); });

  renderAll();
}

init();

/* daftar service worker hanya di http(s) — skema minis:// tidak mendukung SW */
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
