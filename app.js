/* Perfo — gestion de tâches par priorité 1 / 2 / 3
   Vanilla JS + IndexedDB. Aucune dépendance. */
(() => {
  'use strict';

  // ================= Stockage (IndexedDB) =================
  const DB_NAME = 'perfo';
  const STORE = 'tasks';
  let db;

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function loadAll() {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Écrit l'état complet (quelques dizaines de tâches : simple et fiable)
  function saveAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      st.clear();
      tasks.forEach(t => st.put(t));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ================= État =================
  /** @type {{id:string,title:string,prio:0|1|2|3,order:number,date:string|null,time:string|null,createdAt:number}[]} */
  let tasks = [];
  let calYear, calMonth, selDate;
  const snoozed = new Map(); // id -> timestamp jusqu'auquel on ne redemande pas

  const $ = s => document.querySelector(s);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const clone = arr => arr.map(t => ({ ...t }));

  // ================= Dates =================
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => ymd(new Date());
  const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const REVIEW_HOUR = 20;

  const fmtLong = s => parseYmd(s).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  function fmtShort(s) {
    const t = todayStr();
    if (s === t) return "Aujourd'hui";
    if (s === addDays(t, 1)) return 'Demain';
    if (s === addDays(t, -1)) return 'Hier';
    return parseYmd(s).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  const isLate = t => t.date && t.date < todayStr();

  // ================= Règles métier =================
  const inPrio = p => tasks.filter(t => t.prio === p);
  const maxOrder = p => inPrio(p).reduce((m, t) => Math.max(m, t.order), -1);

  // Le sablier : déclenché quand on termine / supprime une tâche.
  // Bloc 1 vide → les 2 montent en 1 (même ordre) et les 3 montent en 2.
  // Bloc 2 vide → les 3 montent en 2.
  function cascade() {
    let turned = false;
    for (let i = 0; i < 4; i++) {
      const c1 = inPrio(1).length, c2 = inPrio(2).length, c3 = inPrio(3).length;
      if (c1 === 0 && c2 > 0) {
        tasks.forEach(t => { if (t.prio === 2) t.prio = 1; else if (t.prio === 3) t.prio = 2; });
        turned = true;
      } else if (c2 === 0 && c3 > 0) {
        tasks.forEach(t => { if (t.prio === 3) t.prio = 2; });
        turned = true;
      } else break;
    }
    return turned;
  }

  function sortedBlock(p) {
    return inPrio(p).sort((a, b) => {
      const la = isLate(a) ? 0 : 1, lb = isLate(b) ? 0 : 1;
      return la - lb || a.order - b.order;
    });
  }

  // ================= Rendu : accueil =================
  const BLOCKS = [
    { p: 1, name: 'Priorité 1', hint: 'absolue' },
    { p: 2, name: 'Priorité 2', hint: '2–3 jours' },
    { p: 3, name: 'Priorité 3', hint: 'bonus' },
  ];

  const ICON_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_GRIP = '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

  function renderHome() {
    const wrap = $('#blocks');
    wrap.innerHTML = '';
    let total = 0;

    BLOCKS.forEach(b => {
      const list = sortedBlock(b.p);
      total += list.length;
      const sec = document.createElement('section');
      sec.className = `block p${b.p}` + (list.length ? '' : ' empty-zone');
      sec.innerHTML = `
        <div class="block-head">
          <img src="assets/p${b.p}.png" alt="">
          <h2>${b.name} <span class="hint">· ${b.hint}</span></h2>
          <span class="count">${list.length}</span>
        </div>
        <ul class="list" data-p="${b.p}"></ul>`;
      const ul = sec.querySelector('ul');
      list.forEach(t => ul.appendChild(homeCard(t)));
      wrap.appendChild(sec);
    });

    $('#empty-home').hidden = total > 0;

    const n = tasks.filter(t => t.date === todayStr()).length;
    const badge = $('#cal-badge');
    badge.hidden = n === 0;
    badge.textContent = n;

    $('#today-label').textContent = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function homeCard(t) {
    const li = document.createElement('li');
    li.className = 'card' + (isLate(t) ? ' late' : '');
    li.dataset.id = t.id;

    const chk = document.createElement('button');
    chk.className = 'check';
    chk.setAttribute('aria-label', 'Terminer');
    chk.innerHTML = ICON_CHECK;
    chk.addEventListener('click', e => { e.stopPropagation(); completeTask(t.id, li, chk); });

    const body = document.createElement('div');
    body.className = 'card-body';
    const title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = t.title;
    body.appendChild(title);

    if (t.date) {
      const meta = document.createElement('div');
      meta.className = 'card-meta';
      const chip = document.createElement('span');
      if (isLate(t)) { chip.className = 'chip late'; chip.textContent = 'En retard · ' + fmtShort(t.date); }
      else { chip.className = 'chip' + (t.date === todayStr() ? ' today' : ''); chip.textContent = fmtShort(t.date); }
      if (t.time) chip.textContent += ' · ' + t.time.replace(':', 'h');
      meta.appendChild(chip);
      body.appendChild(meta);
    }
    body.addEventListener('click', () => openTaskForm(t));

    const grip = document.createElement('div');
    grip.className = 'grip';
    grip.setAttribute('aria-label', 'Déplacer');
    grip.innerHTML = ICON_GRIP;
    grip.addEventListener('pointerdown', e => startDrag(e, li));

    li.append(chk, body, grip);
    return li;
  }

  // ================= Terminer / supprimer =================
  function completeTask(id, li, chk) {
    const snap = clone(tasks);
    if (chk) chk.classList.add('done');
    if (li) li.classList.add('leaving');
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(async () => {
      tasks = tasks.filter(t => t.id !== id);
      const turned = cascade();
      await saveAll();
      renderAll();
      showToast(turned ? 'Terminée · le sablier a tourné ⏳' : 'Tâche terminée', snap);
    }, li ? 230 : 0);
  }

  async function deleteTask(id, label = 'Tâche supprimée') {
    const snap = clone(tasks);
    tasks = tasks.filter(t => t.id !== id);
    const turned = cascade();
    await saveAll();
    renderAll();
    showToast(turned ? label + ' · le sablier a tourné ⏳' : label, snap);
  }

  // ================= Glisser-déposer =================
  let drag = null;

  function startDrag(e, li) {
    if (drag) return;
    e.preventDefault();
    const rect = li.getBoundingClientRect();
    const ph = document.createElement('li');
    ph.className = 'placeholder';
    ph.style.height = rect.height + 'px';
    li.parentNode.insertBefore(ph, li);

    document.body.classList.add('dragging');
    document.body.appendChild(li);
    li.classList.add('drag-ghost');
    li.style.width = rect.width + 'px';
    li.style.left = rect.left + 'px';
    li.style.top = rect.top + 'px';
    // garder la couleur du bloc d'origine sur la carte fantôme
    const p = ph.parentNode.dataset.p;
    li.classList.add('p' + p);

    drag = { li, ph, offY: e.clientY - rect.top, y: e.clientY, raf: 0 };
    if (navigator.vibrate) navigator.vibrate(8);
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    drag.raf = requestAnimationFrame(autoScroll);
  }

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    drag.y = e.clientY;
    drag.li.style.top = (e.clientY - drag.offY) + 'px';
    placePlaceholder(e.clientY);
  }

  function placePlaceholder(y) {
    const lists = [...document.querySelectorAll('#blocks .list')];
    let target = null, best = Infinity;
    for (const ul of lists) {
      const r = ul.getBoundingClientRect();
      if (y >= r.top - 10 && y <= r.bottom + 10) { target = ul; break; }
      const dist = Math.min(Math.abs(y - r.top), Math.abs(y - r.bottom));
      if (dist < best) { best = dist; target = ul; }
    }
    if (!target) return;
    const cards = [...target.querySelectorAll('.card')];
    let before = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (y < r.top + r.height / 2) { before = c; break; }
    }
    if (before) { if (drag.ph.nextSibling !== before) target.insertBefore(drag.ph, before); }
    else if (target.lastElementChild !== drag.ph) target.appendChild(drag.ph);
  }

  function autoScroll() {
    if (!drag) return;
    const edge = 90, y = drag.y, h = window.innerHeight;
    let dy = 0;
    if (y < edge) dy = -Math.ceil((edge - y) / 8);
    else if (y > h - edge) dy = Math.ceil((y - (h - edge)) / 8);
    if (dy) { window.scrollBy(0, dy); placePlaceholder(y); }
    drag.raf = requestAnimationFrame(autoScroll);
  }

  async function endDrag() {
    if (!drag) return;
    const { li, ph, raf } = drag;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);

    li.classList.remove('drag-ghost', 'p1', 'p2', 'p3');
    li.removeAttribute('style');
    ph.parentNode.insertBefore(li, ph);
    ph.remove();
    document.body.classList.remove('dragging');
    drag = null;

    // relire l'ordre affiché → priorité + ordre de chaque tâche
    document.querySelectorAll('#blocks .list').forEach(ul => {
      const p = Number(ul.dataset.p);
      [...ul.querySelectorAll('.card')].forEach((c, i) => {
        const t = tasks.find(x => x.id === c.dataset.id);
        if (t) { t.prio = p; t.order = i; }
      });
    });
    await saveAll();
    renderAll();
  }

  // ================= Calendrier =================
  function renderCal() {
    const first = new Date(calYear, calMonth, 1);
    $('#month-label').textContent = first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

    const counts = {};
    tasks.forEach(t => { if (t.date) counts[t.date] = (counts[t.date] || 0) + 1; });

    const grid = $('#cal-grid');
    grid.innerHTML = '';
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(calYear, calMonth, 1 - offset);
    const today = todayStr();

    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const s = ymd(d);
      const cell = document.createElement('button');
      cell.className = 'day' + (d.getMonth() !== calMonth ? ' out' : '') + (s === today ? ' is-today' : '') + (s === selDate ? ' sel' : '');
      cell.innerHTML = `<span>${d.getDate()}</span>`;
      if (counts[s]) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = counts[s];
        cell.appendChild(n);
      }
      cell.addEventListener('click', () => {
        selDate = s;
        if (d.getMonth() !== calMonth) { calYear = d.getFullYear(); calMonth = d.getMonth(); }
        renderCal();
      });
      grid.appendChild(cell);
    }
    renderDay();
  }

  function renderDay() {
    $('#day-title').textContent = selDate === todayStr() ? "Aujourd'hui · " + fmtLong(selDate) : fmtLong(selDate);
    const list = tasks.filter(t => t.date === selDate)
      .sort((a, b) => (a.time || '99') .localeCompare(b.time || '99') || (a.prio || 9) - (b.prio || 9));
    const ul = $('#day-list');
    ul.innerHTML = '';
    $('#day-empty').hidden = list.length > 0;

    list.forEach(t => {
      const li = document.createElement('li');
      li.className = 'card' + (t.prio ? ' p' + t.prio : '');
      const chk = document.createElement('button');
      chk.className = 'check';
      chk.setAttribute('aria-label', 'Terminer');
      chk.innerHTML = ICON_CHECK;
      chk.addEventListener('click', e => { e.stopPropagation(); completeTask(t.id, li, chk); });

      const time = document.createElement('span');
      time.className = 'time' + (t.time ? '' : ' none');
      time.textContent = t.time ? t.time.replace(':', 'h') : '—';

      const body = document.createElement('div');
      body.className = 'card-body';
      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = t.title;
      body.appendChild(title);
      body.addEventListener('click', () => openTaskForm(t));

      li.append(chk, time, body);
      if (t.prio) {
        const tag = document.createElement('img');
        tag.className = 'prio-tag';
        tag.src = `assets/p${t.prio}.png`;
        tag.alt = 'Priorité ' + t.prio;
        li.appendChild(tag);
      }
      ul.appendChild(li);
    });
  }

  // ================= Navigation =================
  let view = 'home';
  function show(v) {
    view = v;
    $('#view-home').classList.toggle('active', v === 'home');
    $('#view-cal').classList.toggle('active', v === 'cal');
    window.scrollTo(0, 0);
    renderAll();
  }
  function renderAll() {
    renderHome();
    if (view === 'cal') renderCal();
  }

  $('#btn-cal').addEventListener('click', () => {
    const d = new Date();
    calYear = d.getFullYear(); calMonth = d.getMonth(); selDate = todayStr();
    history.pushState({ v: 'cal' }, '');
    show('cal');
  });
  $('#btn-back').addEventListener('click', () => history.back());
  window.addEventListener('popstate', () => {
    // le bouton retour Android ferme d'abord une feuille ouverte
    const open = document.querySelector('.overlay:not([hidden])');
    if (open && open.id !== 'sheet-review') { closeSheet(open); history.pushState({ v: view }, ''); return; }
    show('home');
  });
  $('#m-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCal(); });
  $('#m-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCal(); });
  $('#btn-today').addEventListener('click', () => {
    const d = new Date(); calYear = d.getFullYear(); calMonth = d.getMonth(); selDate = todayStr(); renderCal();
  });

  // ================= Feuilles (overlay) =================
  function openSheet(el) { el.hidden = false; }
  function closeSheet(el) { el.hidden = true; }
  document.querySelectorAll('.overlay').forEach(ov => {
    ov.addEventListener('click', e => {
      if (e.target === ov && ov.id !== 'sheet-review') closeSheet(ov);
    });
  });

  // ================= Ajout / édition =================
  let editing = null, formPrio = 0;
  const fTitle = $('#f-title'), fDate = $('#f-date'), fTime = $('#f-time'), fErr = $('#f-error');

  function setFormPrio(p) {
    formPrio = p;
    document.querySelectorAll('#f-prio button').forEach(b => b.classList.toggle('on', Number(b.dataset.p) === p));
  }
  function syncDateUI() {
    fTime.disabled = !fDate.value;
    if (!fDate.value) fTime.value = '';
    $('#f-clear-date').hidden = !fDate.value;
  }

  function openTaskForm(task, defaults = {}) {
    editing = task || null;
    $('#task-form-title').textContent = task ? 'Modifier la tâche' : 'Nouvelle tâche';
    fTitle.value = task ? task.title : '';
    fDate.value = task ? (task.date || '') : (defaults.date || '');
    fTime.value = task ? (task.time || '') : '';
    setFormPrio(task ? task.prio : (defaults.date ? 0 : 1));
    syncDateUI();
    fErr.hidden = true;
    $('#f-delete').hidden = !task;
    openSheet($('#sheet-task'));
    if (!task) setTimeout(() => fTitle.focus(), 250);
  }

  document.querySelectorAll('#f-prio button').forEach(b => b.addEventListener('click', () => setFormPrio(Number(b.dataset.p))));
  fDate.addEventListener('change', syncDateUI);
  $('#f-clear-date').addEventListener('click', () => { fDate.value = ''; syncDateUI(); });
  $('#f-cancel').addEventListener('click', () => closeSheet($('#sheet-task')));
  $('#f-delete').addEventListener('click', () => {
    if (!editing) return;
    const id = editing.id;
    closeSheet($('#sheet-task'));
    deleteTask(id);
  });

  $('#task-form').addEventListener('submit', async e => {
    e.preventDefault();
    const title = fTitle.value.trim();
    const date = fDate.value || null;
    const time = date ? (fTime.value || null) : null;
    const err = msg => { fErr.textContent = msg; fErr.hidden = false; };

    if (!title) return err('Donne un nom à la tâche.');
    if (!formPrio && !date) return err('Choisis une priorité, une date, ou les deux. Sinon la tâche ne serait visible nulle part.');

    const snap = clone(tasks);
    if (editing) {
      const t = tasks.find(x => x.id === editing.id);
      if (!t) return closeSheet($('#sheet-task'));
      if (t.prio !== formPrio) t.order = formPrio ? maxOrder(formPrio) + 1 : 0;
      Object.assign(t, { title, prio: formPrio, date, time });
      snoozed.delete(t.id);
    } else {
      tasks.push({ id: uid(), title, prio: formPrio, order: formPrio ? maxOrder(formPrio) + 1 : 0, date, time, createdAt: Date.now() });
    }
    await saveAll();
    closeSheet($('#sheet-task'));
    renderAll();
    if (!editing) showToast('Tâche ajoutée', snap);
    checkReview();
  });

  $('#fab').addEventListener('click', () => openTaskForm(null, view === 'cal' ? { date: selDate } : {}));

  // ================= Revue de fin de journée (20 h) =================
  let reviewQueue = [], reviewing = null;

  function pendingReview() {
    const now = new Date(), t = todayStr(), late = now.getHours() >= REVIEW_HOUR, ts = Date.now();
    return tasks
      .filter(x => x.date && (x.date < t || (x.date === t && late)))
      .filter(x => !(snoozed.get(x.id) > ts))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  }

  function checkReview() {
    if (document.querySelector('.overlay:not([hidden])') || drag) return;
    reviewQueue = pendingReview();
    if (reviewQueue.length) nextReview(true);
  }

  function nextReview(first) {
    reviewQueue = pendingReview();
    if (!reviewQueue.length) { closeSheet($('#sheet-review')); reviewing = null; renderAll(); return; }
    reviewing = reviewQueue[0];
    $('#rv-count').textContent = reviewQueue.length > 1 ? `Fin de journée · ${reviewQueue.length} tâches datées à revoir` : 'Fin de journée';
    $('#rv-title').textContent = reviewing.title;
    let when = 'Prévue ' + fmtShort(reviewing.date).toLowerCase();
    if (reviewing.time) when += ' à ' + reviewing.time.replace(':', 'h');
    when += reviewing.prio ? ` · priorité ${reviewing.prio}` : ' · sans priorité';
    $('#rv-when').textContent = when;
    $('#rv-main').hidden = false;
    $('#rv-redate-box').hidden = true;
    if (first) openSheet($('#sheet-review'));
  }

  document.querySelectorAll('.rv-p').forEach(b => b.addEventListener('click', async () => {
    const t = tasks.find(x => x.id === reviewing?.id);
    if (!t) return nextReview();
    const p = Number(b.dataset.p);
    if (t.prio !== p) { t.order = maxOrder(p) + 1; t.prio = p; }
    t.date = null; t.time = null;
    await saveAll();
    nextReview();
  }));

  $('#rv-delete').addEventListener('click', async () => {
    tasks = tasks.filter(x => x.id !== reviewing?.id);
    cascade();
    await saveAll();
    nextReview();
  });

  $('#rv-later').addEventListener('click', () => {
    if (reviewing) snoozed.set(reviewing.id, Date.now() + 60 * 60 * 1000); // 1 h
    nextReview();
  });

  $('#rv-redate').addEventListener('click', () => {
    $('#rv-main').hidden = true;
    $('#rv-redate-box').hidden = false;
    $('#rv-error').hidden = true;
    $('#rv-date').value = addDays(todayStr(), 1);
    $('#rv-time').value = reviewing.time || '';
  });
  $('#rv-redate-cancel').addEventListener('click', () => { $('#rv-main').hidden = false; $('#rv-redate-box').hidden = true; });
  $('#rv-redate-ok').addEventListener('click', async () => {
    const d = $('#rv-date').value, err = $('#rv-error');
    const t = todayStr();
    if (!d) { err.textContent = 'Choisis une date.'; err.hidden = false; return; }
    if (d < t || (d === t && new Date().getHours() >= REVIEW_HOUR)) {
      err.textContent = 'Choisis une date à partir de demain.'; err.hidden = false; return;
    }
    const task = tasks.find(x => x.id === reviewing?.id);
    if (task) { task.date = d; task.time = $('#rv-time').value || null; await saveAll(); }
    nextReview();
  });

  // ================= Toast + annuler =================
  let toastTimer = null, toastSnap = null;
  function showToast(msg, snap) {
    const el = $('#toast'), bar = $('#toast-bar');
    $('#toast-msg').textContent = msg;
    toastSnap = snap || null;
    $('#toast-undo').hidden = !snap;
    el.hidden = false;
    bar.classList.remove('run'); void bar.offsetWidth; bar.classList.add('run');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 5000);
  }
  function hideToast() { $('#toast').hidden = true; toastSnap = null; }
  $('#toast-undo').addEventListener('click', async () => {
    if (!toastSnap) return;
    tasks = toastSnap;
    clearTimeout(toastTimer);
    hideToast();
    await saveAll();
    renderAll();
  });

  // ================= Menu : sauvegarde =================
  $('#btn-menu').addEventListener('click', () => openSheet($('#sheet-menu')));
  $('#m-close').addEventListener('click', () => closeSheet($('#sheet-menu')));

  $('#m-export').addEventListener('click', async () => {
    const data = JSON.stringify({ app: 'perfo', version: 1, exportedAt: new Date().toISOString(), tasks }, null, 2);
    const name = `perfo-sauvegarde-${todayStr()}.json`;
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Sauvegarde Perfo' });
        closeSheet($('#sheet-menu'));
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    closeSheet($('#sheet-menu'));
    showToast(`Sauvegarde exportée (${tasks.length} tâches)`);
  });

  $('#m-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      const list = Array.isArray(json) ? json : json.tasks;
      if (!Array.isArray(list)) throw new Error('format');
      const clean = list
        .filter(t => t && typeof t.title === 'string' && t.title.trim())
        .map((t, i) => ({
          id: typeof t.id === 'string' ? t.id : uid(),
          title: t.title.trim().slice(0, 140),
          prio: [1, 2, 3].includes(t.prio) ? t.prio : 0,
          order: Number.isFinite(t.order) ? t.order : i,
          date: /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null,
          time: /^\d{2}:\d{2}$/.test(t.time) ? t.time : null,
          createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
        }))
        .filter(t => t.prio || t.date);
      if (!confirm(`Remplacer tes ${tasks.length} tâches actuelles par les ${clean.length} de la sauvegarde ?`)) return;
      const snap = clone(tasks);
      tasks = clean;
      await saveAll();
      closeSheet($('#sheet-menu'));
      renderAll();
      showToast(`${clean.length} tâches importées`, snap);
      checkReview();
    } catch {
      alert("Ce fichier n'est pas une sauvegarde Perfo valide.");
    }
  });

  // ================= Démarrage =================
  async function init() {
    db = await openDB();
    tasks = await loadAll();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    history.replaceState({ v: 'home' }, '');
    renderAll();
    checkReview();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { renderAll(); checkReview(); }
    });
    // passage de minuit / de 20 h pendant que l'app est ouverte
    let lastDay = todayStr();
    setInterval(() => {
      if (todayStr() !== lastDay) { lastDay = todayStr(); renderAll(); }
      checkReview();
    }, 60 * 1000);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  init().catch(err => {
    console.error(err);
    alert("Impossible d'ouvrir le stockage local. Vérifie que le navigateur n'est pas en navigation privée.");
  });
})();
