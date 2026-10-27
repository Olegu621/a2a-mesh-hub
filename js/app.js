/**
 * Joint Notes — Application Logic (js/app.js)
 * Implemented & Extended by side-b (Antigravity) & side-a (ZCode)
 * 
 * Features:
 * - Full CRUD for notes (create, read, update, delete)
 * - Integration with window.NotesStorage
 * - Pinned notes support (stick to top)
 * - Multi-criteria sorting (updated, created, alphabetical)
 * - Real-time search query filtering (by title, content, tags)
 * - Color tag filtering & color palette selection
 * - Live character and word counter
 * - Soft delete with Undo Toast notification
 * - Copy note to clipboard with 1 click
 * - JSON Export and Import (two-way sync / backup)
 * - Keyboard shortcuts: Ctrl+Enter (save), Esc (cancel), / (search)
 * - Theme toggle (Light / Dark mode) with persistence
 */

(function () {
  'use strict';

  // State
  let currentFilterColor = 'all';
  let searchQuery = '';
  let currentSort = 'updated-desc';
  let editingNoteId = null;
  let lastDeletedNote = null;
  let undoTimeout = null;

  // DOM Elements cache
  let dom = {};

  function initDom() {
    dom = {
      app: document.getElementById('app'),
      noteForm: document.getElementById('note-form'),
      noteTitle: document.getElementById('note-title') || document.getElementById('note-input') || document.querySelector('input[name="title"]'),
      noteContent: document.getElementById('note-content') || document.querySelector('textarea[name="content"]'),
      noteTags: document.getElementById('note-tags') || document.querySelector('input[name="tags"]'),
      colorPicker: document.getElementById('color-picker') || document.querySelector('.color-picker'),
      searchInput: document.getElementById('search-input'),
      sortSelect: document.getElementById('sort-select'),
      notesList: document.getElementById('notes-list') || document.getElementById('notes-container'),
      themeToggle: document.getElementById('theme-toggle'),
      exportBtn: document.getElementById('export-btn'),
      importBtn: document.getElementById('import-btn'),
      importFileInput: document.getElementById('import-file-input'),
      charCounter: document.getElementById('char-counter'),
      statsBadge: document.getElementById('stats-badge'),
      toastContainer: document.getElementById('toast-container'),
      cancelEditBtn: document.getElementById('cancel-edit-btn'),
      submitBtn: document.getElementById('note-submit-btn') || (document.getElementById('note-form') ? document.getElementById('note-form').querySelector('button[type="submit"]') : null)
    };
  }

  // Toast Notification System
  function showToast(message, options = {}) {
    let container = dom.toastContainer;
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
      dom.toastContainer = container;
    }

    const toast = document.createElement('div');
    toast.className = 'toast';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    if (options.actionText && typeof options.onAction === 'function') {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'toast-btn';
      actionBtn.textContent = options.actionText;
      actionBtn.addEventListener('click', () => {
        options.onAction();
        toast.remove();
      });
      toast.appendChild(actionBtn);
    }

    container.appendChild(toast);

    const duration = options.duration || 4500;
    setTimeout(() => {
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(15px)';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // Fallback in-memory storage adapter
  const fallbackStorage = {
    _key: 'joint_notes_data',
    _read() {
      try {
        return JSON.parse(localStorage.getItem(this._key)) || [];
      } catch (_) {
        return [];
      }
    },
    _write(notes) {
      localStorage.setItem(this._key, JSON.stringify(notes));
    },
    getAll() {
      return this._read();
    },
    get(id) {
      return this._read().find(n => String(n.id) === String(id)) || null;
    },
    create(data) {
      const notes = this._read();
      const newNote = {
        id: 'note-' + Date.now().toString(36),
        title: data.title || 'Без названия',
        content: data.content || '',
        color: data.color || 'default',
        tags: Array.isArray(data.tags) ? data.tags : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
        pinned: Boolean(data.pinned),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      notes.unshift(newNote);
      this._write(notes);
      return newNote;
    },
    update(id, fields) {
      const notes = this._read();
      const idx = notes.findIndex(n => String(n.id) === String(id));
      if (idx === -1) return null;
      notes[idx] = {
        ...notes[idx],
        ...fields,
        updatedAt: new Date().toISOString()
      };
      this._write(notes);
      return notes[idx];
    },
    togglePin(id) {
      const note = this.get(id);
      if (!note) return null;
      return this.update(id, { pinned: !note.pinned });
    },
    delete(id) {
      const notes = this._read();
      const target = notes.find(n => String(n.id) === String(id));
      if (!target) return false;
      this._write(notes.filter(n => String(n.id) !== String(id)));
      return target;
    },
    restore(note) {
      if (!note) return;
      const notes = this._read();
      notes.unshift(note);
      this._write(notes);
      return note;
    },
    exportJSON() {
      return JSON.stringify(this._read(), null, 2);
    },
    importJSON(str) {
      try {
        const arr = JSON.parse(str);
        if (!Array.isArray(arr)) return { success: false, error: 'Not array' };
        this._write(arr);
        return { success: true, count: arr.length };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };

  function getStorage() {
    return window.NotesStorage || fallbackStorage;
  }

  // Theme Management
  function initTheme() {
    const savedTheme = localStorage.getItem('joint-notes-theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-mode');
      document.documentElement.setAttribute('data-theme', 'dark');
    }
    updateThemeToggleLabel();
  }

  function toggleTheme() {
    const isDark = document.body.classList.toggle('dark-mode');
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    localStorage.setItem('joint-notes-theme', isDark ? 'dark' : 'light');
    updateThemeToggleLabel();
  }

  function updateThemeToggleLabel() {
    if (dom.themeToggle) {
      const isDark = document.body.classList.contains('dark-mode');
      dom.themeToggle.textContent = isDark ? '☀️ Светлая' : '🌙 Тёмная';
      dom.themeToggle.setAttribute('title', isDark ? 'Переключить на светлую тему' : 'Переключить на тёмную тему');
    }
  }

  // Live Character and Word Counter
  function updateCharCounter() {
    if (!dom.charCounter) return;
    const content = dom.noteContent ? dom.noteContent.value : '';
    const chars = content.length;
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    dom.charCounter.textContent = `${chars} симв. · ${words} слов`;
  }

  // Escape HTML helper
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Highlight search text helper
  function highlightText(text, query) {
    if (!text) return '';
    const safe = escapeHTML(text);
    if (!query || !query.trim()) return safe;
    const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${q})`, 'gi');
    return safe.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  // Rich content formatting: todo checkboxes and clickable links
  function formatRichContent(content, query) {
    if (!content) return '';
    const lines = String(content).split('\n');
    const formattedLines = lines.map((line, idx) => {
      // Todo checklist item
      const todoMatch = line.match(/^(\s*(?:-\s*)?\[([ xX])\]\s*)(.*)$/);
      if (todoMatch) {
        const isChecked = todoMatch[2].toLowerCase() === 'x';
        const taskText = todoMatch[3];
        const highlighted = highlightText(taskText, query);
        return `<label class="todo-line ${isChecked ? 'done' : ''}"><input type="checkbox" class="todo-checkbox" data-line="${idx}" ${isChecked ? 'checked' : ''}><span>${highlighted}</span></label>`;
      }

      // Normal line with auto-linking URLs
      let formatted = highlightText(line, query);
      formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="note-link">$1</a>');
      return formatted;
    });

    return formattedLines.join('<br>');
  }

  // Format date helper
  function formatDate(isoString) {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      return isoString;
    }
  }

  // Sorting comparator
  function sortNotes(notes, sortMode) {
    const sorted = [...notes];
    sorted.sort((a, b) => {
      // Pinned notes always come first
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      switch (sortMode) {
        case 'created-desc':
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        case 'created-asc':
          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
        case 'title-asc':
          return (a.title || '').localeCompare(b.title || '', 'ru');
        case 'updated-desc':
        default:
          return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
      }
    });
    return sorted;
  }

  // Render notes list
  function renderNotes() {
    if (!dom.notesList) return;

    const storage = getStorage();
    let allNotes = [];
    try {
      allNotes = storage.getAll() || [];
    } catch (e) {
      console.error('Ошибка при получении заметок:', e);
    }

    let notes = [...allNotes];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      notes = notes.filter(note => {
        const titleMatch = (note.title || '').toLowerCase().includes(q);
        const contentMatch = (note.content || '').toLowerCase().includes(q);
        const tagsMatch = Array.isArray(note.tags)
          ? note.tags.some(t => t.toLowerCase().includes(q))
          : String(note.tags || '').toLowerCase().includes(q);
        return titleMatch || contentMatch || tagsMatch;
      });
    }

    // Filter by color
    if (currentFilterColor !== 'all') {
      notes = notes.filter(note => (note.color || 'default') === currentFilterColor);
    }

    // Apply sorting
    notes = sortNotes(notes, currentSort);

    // Update Stats Badge
    if (dom.statsBadge) {
      const pinnedCount = allNotes.filter(n => n.pinned).length;
      let text = `Заметок: ${allNotes.length}`;
      if (pinnedCount > 0) text += ` (📌 ${pinnedCount} закр.)`;
      if (searchQuery || currentFilterColor !== 'all') {
        text += ` · Найдено по фильтрам: ${notes.length}`;
      }
      dom.statsBadge.textContent = text;
    }

    // Ensure notes grid class exists
    if (!dom.notesList.classList.contains('notes-grid')) {
      dom.notesList.classList.add('notes-grid');
    }

    if (notes.length === 0) {
      dom.notesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p><strong>Заметок не найдено</strong></p>
          <p class="subtitle">${searchQuery || currentFilterColor !== 'all' ? 'Попробуйте сбросить поисковый запрос или фильтр' : 'Создайте свою первую заметку с помощью формы выше'}</p>
        </div>
      `;
      return;
    }

    dom.notesList.innerHTML = notes.map(note => {
      const color = note.color || 'default';
      const isPinned = Boolean(note.pinned);
      const tags = Array.isArray(note.tags) ? note.tags : (note.tags ? String(note.tags).split(',').map(s => s.trim()) : []);
      const tagsHtml = tags.map(t => `<span class="note-tag" data-tag="${escapeHTML(t)}">#${highlightText(t, searchQuery)}</span>`).join(' ');
      const dateStr = formatDate(note.updatedAt || note.createdAt);
      const titleHtml = highlightText(note.title || 'Без названия', searchQuery);
      const contentHtml = formatRichContent(note.content || '', searchQuery);

      return `
        <article class="note-card color-${escapeHTML(color)} ${isPinned ? 'is-pinned' : ''}" data-id="${escapeHTML(note.id)}">
          <div class="note-header">
            <div class="note-title-wrap">
              ${isPinned ? '<span class="pin-indicator" title="Закреплено">📌</span>' : ''}
              <h3 class="note-title">${titleHtml}</h3>
            </div>
            <div class="note-card-actions">
              <button class="action-icon-btn btn-pin ${isPinned ? 'active' : ''}" title="${isPinned ? 'Открепить' : 'Закрепить наверху'}" aria-label="Закрепить">${isPinned ? '📌' : '📍'}</button>
              <button class="action-icon-btn btn-copy" title="Скопировать текст" aria-label="Скопировать">📋</button>
              <button class="action-icon-btn btn-edit" title="Редактировать" aria-label="Редактировать">✏️</button>
              <button class="action-icon-btn delete btn-delete" title="Удалить" aria-label="Удалить">🗑️</button>
            </div>
          </div>
          <div class="note-content">${contentHtml}</div>
          ${tags.length ? `<div class="note-tags">${tagsHtml}</div>` : ''}
          <div class="note-footer">
            <time datetime="${escapeHTML(note.createdAt || '')}">${dateStr}</time>
            <span class="note-color-badge" title="Цвет: ${escapeHTML(color)}">${getColorEmoji(color)}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function getColorEmoji(color) {
    switch (color) {
      case 'yellow': return '🟡';
      case 'green': return '🟢';
      case 'blue': return '🔵';
      case 'pink': return '🌸';
      case 'purple': return '🟣';
      default: return '⚪';
    }
  }

  // Get selected color from form
  function getSelectedColor() {
    const checkedRadio = document.querySelector('input[name="note-color"]:checked');
    if (checkedRadio) return checkedRadio.value;
    const activeColorOpt = document.querySelector('.color-option.active');
    if (activeColorOpt && activeColorOpt.dataset.color) return activeColorOpt.dataset.color;
    return 'default';
  }

  // Set selected color in form
  function setSelectedColor(color) {
    const radio = document.querySelector(`input[name="note-color"][value="${color}"]`);
    if (radio) {
      radio.checked = true;
    }
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.toggle('active', opt.dataset.color === color);
    });
  }

  // Handle Note Form Submit
  function handleFormSubmit(e) {
    if (e) e.preventDefault();

    const title = (dom.noteTitle ? dom.noteTitle.value : '').trim();
    const content = (dom.noteContent ? dom.noteContent.value : '').trim();

    if (!title && !content) {
      showToast('⚠️ Введите заголовок или текст заметки');
      return;
    }

    const color = getSelectedColor();
    const rawTags = dom.noteTags ? dom.noteTags.value : '';
    const tags = rawTags
      ? rawTags.split(/[,\s]+/).map(t => t.replace(/^#/, '').trim()).filter(Boolean)
      : [];

    const storage = getStorage();

    if (editingNoteId) {
      // Update existing
      storage.update(editingNoteId, {
        title,
        content,
        color,
        tags
      });
      showToast('✓ Заметка обновлена!');
      cancelEdit();
    } else {
      // Create new
      storage.create({
        title,
        content,
        color,
        tags
      });
      showToast('✓ Заметка добавлена!');
      resetForm();
    }

    renderNotes();
  }

  // Enter Edit Mode
  function startEdit(noteId) {
    const storage = getStorage();
    const note = storage.get(noteId);
    if (!note) return;

    editingNoteId = noteId;

    if (dom.noteTitle) dom.noteTitle.value = note.title || '';
    if (dom.noteContent) dom.noteContent.value = note.content || '';

    if (dom.noteTags) {
      dom.noteTags.value = Array.isArray(note.tags) ? note.tags.join(', ') : (note.tags || '');
    }

    setSelectedColor(note.color || 'default');
    updateCharCounter();

    if (dom.submitBtn) dom.submitBtn.textContent = 'Сохранить изменения';

    if (dom.cancelEditBtn) {
      dom.cancelEditBtn.style.display = 'inline-flex';
    } else if (dom.noteForm) {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'cancel-edit-btn';
      cancelBtn.className = 'btn btn-danger';
      cancelBtn.textContent = 'Отмена';
      cancelBtn.onclick = cancelEdit;
      dom.noteForm.querySelector('.form-action-group')?.prepend(cancelBtn) || dom.noteForm.appendChild(cancelBtn);
      dom.cancelEditBtn = cancelBtn;
    }

    if (dom.noteForm) {
      dom.noteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (dom.noteTitle) dom.noteTitle.focus();
    }
  }

  // Cancel Edit Mode
  function cancelEdit() {
    editingNoteId = null;
    resetForm();
    if (dom.submitBtn) dom.submitBtn.textContent = 'Добавить';
    if (dom.cancelEditBtn) dom.cancelEditBtn.style.display = 'none';
  }

  // Reset form inputs
  function resetForm() {
    if (dom.noteTitle) dom.noteTitle.value = '';
    if (dom.noteContent) dom.noteContent.value = '';
    if (dom.noteTags) dom.noteTags.value = '';
    setSelectedColor('default');
    updateCharCounter();
  }

  // Toggle Pin
  function togglePinNote(noteId) {
    const storage = getStorage();
    if (typeof storage.togglePin === 'function') {
      const res = storage.togglePin(noteId);
      if (res) {
        showToast(res.pinned ? '📌 Заметка закреплена вверху' : '📍 Заметка откреплена');
        renderNotes();
      }
    }
  }

  // Copy Note to Clipboard
  function copyNote(noteId) {
    const storage = getStorage();
    const note = storage.get(noteId);
    if (!note) return;

    const fullText = `${note.title ? note.title + '\n\n' : ''}${note.content || ''}`.trim();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('📋 Заметка скопирована в буфер обмена');
      }).catch(() => {
        fallbackCopy(fullText);
      });
    } else {
      fallbackCopy(fullText);
    }
  }

  function fallbackCopy(text) {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToast('📋 Заметка скопирована в буфер обмена');
  }

  // Delete note with soft undo
  function deleteNote(noteId) {
    const storage = getStorage();
    const deleted = storage.delete(noteId);
    if (!deleted) return;

    lastDeletedNote = deleted;
    if (editingNoteId === noteId) {
      cancelEdit();
    }
    renderNotes();

    showToast('🗑️ Заметка удалена', {
      actionText: 'Отменить',
      duration: 6000,
      onAction: () => {
        if (lastDeletedNote && typeof storage.restore === 'function') {
          storage.restore(lastDeletedNote);
          renderNotes();
          showToast('✓ Заметка восстановлена!');
          lastDeletedNote = null;
        }
      }
    });
  }

  // Export notes to JSON
  function exportNotes() {
    const storage = getStorage();
    let jsonStr = '';
    if (typeof storage.exportJSON === 'function') {
      jsonStr = storage.exportJSON();
    } else {
      jsonStr = JSON.stringify(storage.getAll() || [], null, 2);
    }

    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `joint-notes-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 Файл бэкапа успешно экспортирован!');
  }

  // Import notes from JSON
  function triggerImport() {
    if (dom.importFileInput) {
      dom.importFileInput.click();
    }
  }

  function handleFileImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      const content = event.target.result;
      const storage = getStorage();
      if (typeof storage.importJSON === 'function') {
        const res = storage.importJSON(content);
        if (res.success) {
          showToast(`✓ Успешно импортировано ${res.count} заметок!`);
          renderNotes();
        } else {
          showToast(`⚠️ Ошибка импорта: ${res.error || 'неверный формат'}`);
        }
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset for re-selecting same file
  }

  // Toggle Todo checkbox in note content
  function toggleTodoLine(noteId, lineIdx) {
    const storage = getStorage();
    const note = storage.get(noteId);
    if (!note || !note.content) return;
    const lines = note.content.split('\n');
    if (lineIdx < 0 || lineIdx >= lines.length) return;

    const line = lines[lineIdx];
    const match = line.match(/^(\s*(?:-\s*)?\[)([ xX])(\]\s*.*)$/);
    if (match) {
      const isCurrentlyChecked = match[2].toLowerCase() === 'x';
      lines[lineIdx] = `${match[1]}${isCurrentlyChecked ? ' ' : 'x'}${match[3]}`;
      storage.update(noteId, { content: lines.join('\n') });
      renderNotes();
    }
  }

  // Delegated event listener for notes list
  function setupListDelegation() {
    if (!dom.notesList) return;

    dom.notesList.addEventListener('click', function (e) {
      const card = e.target.closest('.note-card');
      if (!card) return;
      const noteId = card.dataset.id;

      if (e.target.classList.contains('todo-checkbox')) {
        e.stopPropagation();
        const lineIdx = parseInt(e.target.dataset.line, 10);
        toggleTodoLine(noteId, lineIdx);
        return;
      }

      if (e.target.closest('.btn-delete')) {
        e.stopPropagation();
        deleteNote(noteId);
      } else if (e.target.closest('.btn-edit')) {
        e.stopPropagation();
        startEdit(noteId);
      } else if (e.target.closest('.btn-pin') || e.target.closest('.pin-indicator')) {
        e.stopPropagation();
        togglePinNote(noteId);
      } else if (e.target.closest('.btn-copy')) {
        e.stopPropagation();
        copyNote(noteId);
      } else if (e.target.closest('.note-tag')) {
        e.stopPropagation();
        const tag = e.target.dataset.tag;
        if (tag && dom.searchInput) {
          dom.searchInput.value = tag;
          searchQuery = tag;
          renderNotes();
          dom.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }

  // Filter chips setup
  function setupColorFilters() {
    const filterContainer = document.querySelector('.color-filter-chips');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', function (e) {
      const chip = e.target.closest('.chip-filter');
      if (!chip) return;
      const color = chip.dataset.color || 'all';
      currentFilterColor = color;

      filterContainer.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      renderNotes();
    });
  }

  // Keyboard Shortcuts
  function setupShortcuts() {
    window.addEventListener('keydown', function (e) {
      // Ctrl+Enter or Cmd+Enter to submit form from any input
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const activeEl = document.activeElement;
        if (dom.noteForm && (dom.noteForm.contains(activeEl) || activeEl === document.body)) {
          e.preventDefault();
          handleFormSubmit();
        }
      }

      // Escape to cancel edit
      if (e.key === 'Escape' && editingNoteId) {
        cancelEdit();
      }

      // '/' to focus search input (if not currently focused in an input)
      if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        if (dom.searchInput) {
          e.preventDefault();
          dom.searchInput.focus();
        }
      }
    });
  }

  // Initialize event listeners
  function initEvents() {
    if (dom.noteForm) {
      dom.noteForm.addEventListener('submit', handleFormSubmit);
    }

    if (dom.noteContent) {
      dom.noteContent.addEventListener('input', updateCharCounter);
    }

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value;
        renderNotes();
      });
    }

    if (dom.sortSelect) {
      dom.sortSelect.addEventListener('change', function (e) {
        currentSort = e.target.value;
        renderNotes();
      });
    }

    if (dom.themeToggle) {
      dom.themeToggle.addEventListener('click', toggleTheme);
    }

    if (dom.exportBtn) {
      dom.exportBtn.addEventListener('click', exportNotes);
    }

    if (dom.importBtn) {
      dom.importBtn.addEventListener('click', triggerImport);
    }

    if (dom.importFileInput) {
      dom.importFileInput.addEventListener('change', handleFileImport);
    }

    if (dom.cancelEditBtn) {
      dom.cancelEditBtn.addEventListener('click', cancelEdit);
    }

    // Color options in form
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.addEventListener('click', function () {
        const color = this.dataset.color;
        if (color) setSelectedColor(color);
      });
    });

    setupListDelegation();
    setupColorFilters();
    setupShortcuts();
  }

  // Main init
  function init() {
    initDom();
    initTheme();
    initEvents();
    updateCharCounter();
    renderNotes();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose to window for testing / integration
  window.JointNotesApp = {
    renderNotes,
    initDom,
    getStorage,
    showToast
  };

})();
