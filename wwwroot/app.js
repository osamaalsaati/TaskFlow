const STORAGE_KEY = 'taskflow.board.v1';
const LEGACY_STORAGE_KEY = 'holooltech.task-board.v1';
const STATUSES = ['todo', 'progress', 'done'];
const PRIORITIES = {
  low: { label: 'أولوية منخفضة', className: 'priority-low' },
  medium: { label: 'أولوية متوسطة', className: 'priority-medium' },
  high: { label: 'أولوية عالية', className: 'priority-high' }
};

const sampleTasks = {
  todo: [
    { id: 'sample-1', title: 'تجهيز خطة العمل الأسبوعية', description: 'تحديد الأولويات وتوزيع المهام على الفريق.', priority: 'high', due: '' },
    { id: 'sample-2', title: 'مراجعة متطلبات المشروع', description: 'التأكد من اكتمال جميع المتطلبات قبل البدء.', priority: 'medium', due: '' }
  ],
  progress: [
    { id: 'sample-3', title: 'تصميم واجهة لوحة المهام', description: 'بناء تجربة واضحة ومتجاوبة مع جميع الشاشات.', priority: 'high', due: '' }
  ],
  done: [
    { id: 'sample-4', title: 'إعداد مساحة العمل', description: 'تجهيز بنية المشروع والملفات الأساسية.', priority: 'low', due: '' }
  ]
};

const elements = {
  lists: Object.fromEntries(STATUSES.map(status => [status, document.querySelector(`[data-list="${status}"]`)])),
  counts: Object.fromEntries(STATUSES.map(status => [status, document.querySelector(`[data-count="${status}"]`)])),
  totalCount: document.querySelector('#total-count'), activeCount: document.querySelector('#active-count'),
  doneCount: document.querySelector('#done-count'), progressPercent: document.querySelector('#progress-percent'),
  progressFill: document.querySelector('#progress-fill'), summary: document.querySelector('#task-summary'),
  search: document.querySelector('#search'), dialog: document.querySelector('#task-dialog'),
  form: document.querySelector('#task-form'), dialogTitle: document.querySelector('#dialog-title'),
  title: document.querySelector('#task-title'), description: document.querySelector('#task-description'),
  priority: document.querySelector('#task-priority'), due: document.querySelector('#task-due'),
  titleError: document.querySelector('#title-error'), saveButton: document.querySelector('#save-task'),
  toast: document.querySelector('#toast')
};

let board = loadBoard();
let editingId = null;
let draggedId = null;
let toastTimer;
let pointerDrag = null;

function loadBoard() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return structuredClone(sampleTasks);
    const parsed = JSON.parse(saved);
    return Object.fromEntries(STATUSES.map(status => [status,
      Array.isArray(parsed?.[status]) ? parsed[status].filter(isTask).map(cleanTask) : []
    ]));
  } catch {
    return structuredClone(sampleTasks);
  }
}

function isTask(value) {
  return value && typeof value.id === 'string' && typeof value.title === 'string';
}

function cleanTask(task) {
  return {
    id: task.id, title: task.title.slice(0, 120),
    description: typeof task.description === 'string' ? task.description.slice(0, 500) : '',
    priority: PRIORITIES[task.priority] ? task.priority : 'medium',
    due: /^\d{4}-\d{2}-\d{2}$/.test(task.due) ? task.due : ''
  };
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(board)); }
  catch { showToast('تعذر حفظ التغييرات على هذا الجهاز.', true); }
}

function allTasks() { return STATUSES.flatMap(status => board[status]); }

function findTask(id) {
  for (const status of STATUSES) {
    const index = board[status].findIndex(task => task.id === id);
    if (index !== -1) return { status, index, task: board[status][index] };
  }
  return null;
}

function render() {
  const query = elements.search.value.trim().toLocaleLowerCase('ar');
  for (const status of STATUSES) {
    const list = elements.lists[status];
    list.replaceChildren();
    const visible = board[status].filter(task => `${task.title} ${task.description}`.toLocaleLowerCase('ar').includes(query));
    for (const task of visible) list.append(createCard(task, status));
    if (visible.length === 0) {
      const empty = document.createElement('div');
      empty.className = `empty-state${query ? ' search-empty' : ''}`;
      empty.textContent = query ? 'لا توجد نتائج في هذه القائمة' : 'اسحب مهمة إلى هنا';
      list.append(empty);
    }
    elements.counts[status].textContent = board[status].length;
  }
  const total = allTasks().length;
  const done = board.done.length;
  const percent = total ? Math.round((done / total) * 100) : 0;
  elements.totalCount.textContent = total;
  elements.activeCount.textContent = board.progress.length;
  elements.doneCount.textContent = done;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
  elements.summary.textContent = `${total} ${total === 1 ? 'مهمة' : 'مهام'}`;
}

function createCard(task, status) {
  const card = document.createElement('article');
  card.className = `task-card${status === 'done' ? ' is-done' : ''}`;
  card.dataset.id = task.id;
  card.setAttribute('aria-label', task.title);

  const top = document.createElement('div'); top.className = 'task-card-top';
  const tag = document.createElement('span'); tag.className = `task-tag ${PRIORITIES[task.priority].className}`;
  tag.textContent = PRIORITIES[task.priority].label;
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const edit = actionButton('✎', 'تعديل المهمة', 'edit-button');
  edit.addEventListener('click', () => openDialog(task.id));
  const remove = actionButton('×', 'حذف المهمة', 'delete-button');
  remove.addEventListener('click', () => deleteTask(task.id));
  const handle = actionButton('⠿', 'اسحب المهمة لتغيير مكانها. بلوحة المفاتيح: مسافة ثم الأسهم ثم مسافة للإفلات', 'drag-handle');
  handle.addEventListener('keydown', event => keyboardDrag(event, task.id));
  actions.append(edit, remove, handle); top.append(tag, actions);

  const title = document.createElement('h4'); title.className = 'task-title'; title.textContent = task.title;
  const description = document.createElement('p'); description.className = 'task-description';
  description.textContent = task.description || 'بدون وصف';
  const footer = document.createElement('div'); footer.className = 'task-footer';
  const number = document.createElement('span'); number.className = 'task-number';
  number.textContent = `#${String(allTasks().findIndex(item => item.id === task.id) + 1).padStart(2, '0')}`;
  const due = document.createElement('span'); due.className = 'due-date';
  if (task.due) {
    due.textContent = `◷ ${formatDate(task.due)}`;
    if (task.due < localDate() && status !== 'done') due.classList.add('overdue');
  } else due.textContent = 'بدون موعد';
  footer.append(due, number);
  card.append(top, title, description, footer);
  card.addEventListener('pointerdown', event => startPointerDrag(event, task.id, card));
  return card;
}

function actionButton(symbol, label, className) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `card-button ${className}`;
  button.textContent = symbol; button.setAttribute('aria-label', label);
  return button;
}

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(date);
}

function openDialog(id = null) {
  editingId = id;
  elements.form.reset(); elements.titleError.textContent = '';
  const found = id ? findTask(id) : null;
  elements.dialogTitle.textContent = found ? 'تعديل المهمة' : 'مهمة جديدة';
  elements.saveButton.textContent = found ? 'حفظ التعديلات' : 'إضافة المهمة';
  if (found) {
    elements.title.value = found.task.title;
    elements.description.value = found.task.description;
    elements.priority.value = found.task.priority;
    elements.due.value = found.task.due;
  }
  elements.dialog.showModal();
  elements.title.focus();
}

function closeDialog() { elements.dialog.close(); editingId = null; }

function saveTask(event) {
  event.preventDefault();
  const title = elements.title.value.trim();
  if (!title) { elements.titleError.textContent = 'أدخل عنوانًا للمهمة.'; elements.title.focus(); return; }
  elements.titleError.textContent = '';
  const value = { title, description: elements.description.value.trim(), priority: elements.priority.value, due: elements.due.value };
  const wasEditing = Boolean(editingId);
  if (wasEditing) {
    const found = findTask(editingId);
    if (found) Object.assign(found.task, value);
  } else {
    board.todo.unshift({ id: crypto.randomUUID?.() || `task-${Date.now()}-${Math.random()}`, ...value });
  }
  persist(); render(); closeDialog(); showToast(wasEditing ? 'تم حفظ التعديلات.' : 'تمت إضافة المهمة.');
}

function deleteTask(id) {
  const found = findTask(id);
  if (!found || !confirm(`هل تريد حذف «${found.task.title}»؟`)) return;
  board[found.status].splice(found.index, 1);
  persist(); render(); showToast('تم حذف المهمة.');
}

function moveTask(id, status, index) {
  const found = findTask(id);
  if (!found || !STATUSES.includes(status)) return;
  board[found.status].splice(found.index, 1);
  board[status].splice(Math.max(0, Math.min(index, board[status].length)), 0, found.task);
  persist(); render(); showToast('تم تحديث ترتيب المهام.');
}

const placeholder = document.createElement('div'); placeholder.className = 'drop-placeholder';
function placePlaceholder(list, clientY) {
  if (!list) return;
  const cards = [...list.querySelectorAll('.task-card:not(.dragging)')];
  const before = cards.find(card => clientY < card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2);
  list.insertBefore(placeholder, before || null);
  document.querySelectorAll('.column').forEach(column => column.classList.toggle('drop-target', column.contains(list)));
}

function dropAtPlaceholder() {
  const list = placeholder.parentElement;
  if (!list || !draggedId) return;
  const index = [...list.children].filter(child => child.classList.contains('task-card') && child !== document.querySelector(`.task-card.dragging`)).filter(card => card.compareDocumentPosition(placeholder) & Node.DOCUMENT_POSITION_FOLLOWING).length;
  moveTask(draggedId, list.dataset.list, index);
}

function cleanupDrag() {
  placeholder.remove();
  document.querySelectorAll('.column').forEach(column => column.classList.remove('drop-target'));
  document.querySelectorAll('.task-card.dragging').forEach(card => card.classList.remove('dragging'));
  draggedId = null;
}

function startPointerDrag(event, id, card) {
  if (elements.search.value.trim() || event.button !== 0) return;
  if (event.target.closest('button') && !event.target.closest('.drag-handle')) return;
  if (event.pointerType !== 'mouse' && !event.target.closest('.drag-handle')) return;
  event.preventDefault();
  event.currentTarget.setPointerCapture(event.pointerId);
  pointerDrag = { id, card, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ghost: null };
  draggedId = id;
}

document.addEventListener('pointermove', event => {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  const drag = pointerDrag;
  if (!drag.ghost && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 8) return;
  if (!drag.ghost) {
    drag.ghost = drag.card.cloneNode(true);
    drag.ghost.className = 'task-card drag-ghost';
    document.body.append(drag.ghost);
    drag.card.classList.add('dragging');
    document.body.classList.add('touch-dragging');
  }
  drag.ghost.style.left = `${event.clientX - 130}px`;
  drag.ghost.style.top = `${event.clientY - 28}px`;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.task-list');
  if (target) placePlaceholder(target, event.clientY);
});

function finishPointerDrag(event) {
  if (!pointerDrag || event.pointerId !== pointerDrag.pointerId) return;
  if (event.type === 'pointerup' && pointerDrag.ghost) dropAtPlaceholder();
  pointerDrag.ghost?.remove(); pointerDrag = null;
  document.body.classList.remove('touch-dragging');
  cleanupDrag();
}
document.addEventListener('pointerup', finishPointerDrag);
document.addEventListener('pointercancel', finishPointerDrag);

function keyboardDrag(event, id) {
  if (elements.search.value.trim()) return;
  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault();
    if (draggedId === id) { draggedId = null; showToast('تم إفلات المهمة.'); }
    else { draggedId = id; showToast('استخدم الأسهم لنقل المهمة، ثم مسافة للإفلات.'); }
    return;
  }
  if (draggedId !== id) return;
  const found = findTask(id);
  if (!found) return;
  const statusIndex = STATUSES.indexOf(found.status);
  let status = found.status, index = found.index;
  if (event.key === 'ArrowLeft') { status = STATUSES[Math.min(2, statusIndex + 1)]; index = board[status].length; }
  else if (event.key === 'ArrowRight') { status = STATUSES[Math.max(0, statusIndex - 1)]; index = board[status].length; }
  else if (event.key === 'ArrowUp') index = Math.max(0, found.index - 1);
  else if (event.key === 'ArrowDown') index = Math.min(board[status].length - 1, found.index + 1);
  else if (event.key === 'Escape') { draggedId = null; showToast('تم إلغاء السحب.'); return; }
  else return;
  event.preventDefault();
  moveTask(id, status, index);
  draggedId = id;
  [...document.querySelectorAll('.task-card')].find(card => card.dataset.id === id)?.querySelector('.drag-handle')?.focus();
}

function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.classList.add('visible');
  toastTimer = setTimeout(() => elements.toast.classList.remove('visible'), 3000);
}

document.querySelector('#add-task').addEventListener('click', () => openDialog());
document.querySelector('#close-dialog').addEventListener('click', closeDialog);
document.querySelector('#cancel-dialog').addEventListener('click', closeDialog);
elements.dialog.addEventListener('click', event => { if (event.target === elements.dialog) closeDialog(); });
elements.dialog.addEventListener('close', () => { editingId = null; });
elements.form.addEventListener('submit', saveTask);
elements.search.addEventListener('input', render);
document.querySelector('#year').textContent = new Date().getFullYear();
document.querySelector('#today').textContent = new Intl.DateTimeFormat('ar', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
render();
