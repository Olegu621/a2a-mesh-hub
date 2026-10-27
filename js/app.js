/**
 * Joint Notes — Application Logic (js/app.js)
 * Implemented by side-b (Antigravity)
 * 
 * Features:
 * - Full CRUD for notes (create, read, update, delete)
 * - Integration with window.NotesStorage
 * - Search query filtering (by title, content, tags)
 * - Color tag filtering & color palette selection
 * - Theme toggle (Light / Dark mode) with localStorage persistence
 * - Export notes to JSON file
 * - Resilient binding: supports standard elements & auto-enhances if needed
 */

(function () {
  'use strict';

  // State
  let currentFilterColor = 'all';
  let searchQuery = '';
  let editingNoteId = null;

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
      notesList: document.getElementById('notes-list') || document.getElementById('notes-container'),
      themeToggle: document.getElementById('theme-toggle'),
      exportBtn: document.getElementById('export-btn'),
      cancelEditBtn: document.getElementById('cancel-edit-btn'),
      submitBtn: document.getElementById('note-submit-btn') || (document.getElementById('note-form') ? document.getElementById('note-form').querySelector('button[type="submit"]') : null)
    };
  }

  // Fallback in-memory / storage adapter if NotesStorage is temporarily unavailable
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
        id: Date.now().toString(),
        title: data.title || '',
        content: data.content || '',
        color: data.color || 'default',
        tags: Array.isArray(data.tags) ? data.tags : (data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : []),
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
    delete(id) {
      const notes = this._read();
      const filtered = notes.filter(n => String(n.id) !== String(id));
      if (filtered.length === notes.length) return false;
      this._write(filtered);
      return true;
    },
    exportJSON() {
      return JSON.stringify(this._read(), null, 2);
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

  // Render notes
  function renderNotes() {
    if (!dom.notesList) return;

    const storage = getStorage();
    let notes = [];
    try {
      notes = storage.getAll() || [];
    } catch (e) {
      console.error('Ошибка при получении заметок:', e);
    }

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

    // Ensure notes grid class exists
    if (!dom.notesList.classList.contains('notes-grid')) {
      dom.notesList.classList.add('notes-grid');
    }

    if (notes.length === 0) {
      dom.notesList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📝</div>
          <p><strong>Заметок не найдено</strong></p>
          <p class="subtitle">${searchQuery ? 'Попробуйте изменить поисковый запрос' : 'Создайте свою первую заметку с помощью формы выше'}</p>
        </div>
      `;
      return;
    }

    dom.notesList.innerHTML = notes.map(note => {
      const color = note.color || 'default';
      const tags = Array.isArray(note.tags) ? note.tags : (note.tags ? String(note.tags).split(',').map(s => s.trim()) : []);
      const tagsHtml = tags.map(t => `<span class="note-tag">#${escapeHTML(t)}</span>`).join(' ');
      const dateStr = formatDate(note.updatedAt || note.createdAt);

      return `
        <article class="note-card color-${escapeHTML(color)}" data-id="${escapeHTML(note.id)}">
          <div class="note-header">
            <h3 class="note-title">${escapeHTML(note.title || 'Без названия')}</h3>
            <div class="note-card-actions">
              <button class="action-icon-btn btn-edit" title="Редактировать" aria-label="Редактировать">✏️</button>
              <button class="action-icon-btn delete btn-delete" title="Удалить" aria-label="Удалить">🗑️</button>
            </div>
          </div>
          <div class="note-content">${escapeHTML(note.content || '')}</div>
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
      alert('Пожалуйста, введите заголовок или текст заметки');
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
      cancelEdit();
    } else {
      // Create new
      storage.create({
        title,
        content,
        color,
        tags
      });
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

    if (dom.submitBtn) dom.submitBtn.textContent = 'Сохранить изменения';

    if (dom.cancelEditBtn) {
      dom.cancelEditBtn.style.display = 'inline-flex';
    } else if (dom.noteForm) {
      // Create cancel button if missing
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.id = 'cancel-edit-btn';
      cancelBtn.className = 'btn btn-danger';
      cancelBtn.textContent = 'Отмена';
      cancelBtn.onclick = cancelEdit;
      dom.noteForm.appendChild(cancelBtn);
      dom.cancelEditBtn = cancelBtn;
    }

    // Scroll smoothly to form
    if (dom.noteForm) {
      dom.noteForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (dom.noteTitle) dom.noteTitle.focus();
    }
  }

  // Cancel Edit Mode
  function cancelEdit() {
    editingNoteId = null;
    resetForm();
    if (dom.submitBtn) dom.submitBtn.textContent = 'Добавить заметку';
    if (dom.cancelEditBtn) dom.cancelEditBtn.style.display = 'none';
  }

  // Reset form inputs
  function resetForm() {
    if (dom.noteTitle) dom.noteTitle.value = '';
    if (dom.noteContent) dom.noteContent.value = '';
    if (dom.noteTags) dom.noteTags.value = '';
    setSelectedColor('default');
  }

  // Delete note
  function deleteNote(noteId) {
    if (confirm('Вы уверены, что хотите удалить эту заметку?')) {
      const storage = getStorage();
      storage.delete(noteId);
      if (editingNoteId === noteId) {
        cancelEdit();
      }
      renderNotes();
    }
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
  }

  // Delegated event listener for notes list
  function setupListDelegation() {
    if (!dom.notesList) return;

    dom.notesList.addEventListener('click', function (e) {
      const card = e.target.closest('.note-card');
      if (!card) return;
      const noteId = card.dataset.id;

      if (e.target.closest('.btn-delete')) {
        e.stopPropagation();
        deleteNote(noteId);
      } else if (e.target.closest('.btn-edit')) {
        e.stopPropagation();
        startEdit(noteId);
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

  // Initialize event listeners
  function initEvents() {
    if (dom.noteForm) {
      dom.noteForm.addEventListener('submit', handleFormSubmit);
    }

    if (dom.searchInput) {
      dom.searchInput.addEventListener('input', function (e) {
        searchQuery = e.target.value;
        renderNotes();
      });
    }

    if (dom.themeToggle) {
      dom.themeToggle.addEventListener('click', toggleTheme);
    }

    if (dom.exportBtn) {
      dom.exportBtn.addEventListener('click', exportNotes);
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
  }

  // Main init
  function init() {
    initDom();
    initTheme();
    initEvents();
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
    getStorage
  };

})();
