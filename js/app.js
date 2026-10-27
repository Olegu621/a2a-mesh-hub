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
  let currentFilterPriority = 'all';
  let searchQuery = '';
  let currentSort = 'updated-desc';
  let editingNoteId = null;
  let lastDeletedNote = null;
  let undoTimeout = null;
  let selectedPriority = 'normal';

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
      prioritySelector: document.getElementById('priority-selector'),
      tagCloud: document.getElementById('tag-cloud'),
      searchInput: document.getElementById('search-input'),
      sortSelect: document.getElementById('sort-select'),
      notesList: document.getElementById('notes-list') || document.getElementById('notes-container'),
      themeToggle: document.getElementById('theme-toggle'),
      soundToggle: document.getElementById('sound-toggle'),
      exportBtn: document.getElementById('export-btn'),
      exportMdBtn: document.getElementById('export-md-btn'),
      importBtn: document.getElementById('import-btn'),
      importFileInput: document.getElementById('import-file-input'),
      charCounter: document.getElementById('char-counter'),
      statsBadge: document.getElementById('stats-badge'),
      toastContainer: document.getElementById('toast-container'),
      tabWrite: document.getElementById('tab-write'),
      tabPreview: document.getElementById('tab-preview'),
      previewPane: document.getElementById('note-preview-pane'),
      toolbar: document.querySelector('.markdown-toolbar'),
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

  // Web Audio API Synthesizer (zero assets, pure tactile sound fx)
  const audio = {
    ctx: null,
    enabled: localStorage.getItem('joint-notes:sound') !== 'false',
    init() {
      if (!this.ctx && typeof AudioContext !== 'undefined') {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) {}
      }
    },
    play(freq, type = 'sine', duration = 0.12, gainVal = 0.08) {
      if (!this.enabled) return;
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (_) {}
    },
    pop() {
      this.play(520, 'sine', 0.12, 0.09);
      setTimeout(() => this.play(780, 'sine', 0.15, 0.08), 50);
    },
    check() {
      this.play(640, 'triangle', 0.08, 0.06);
    },
    pin() {
      this.play(880, 'sine', 0.09, 0.06);
      setTimeout(() => this.play(1174, 'sine', 0.12, 0.05), 60);
    },
    delete() {
      this.play(240, 'sine', 0.1, 0.07);
    },
    toggle() {
      this.enabled = !this.enabled;
      localStorage.setItem('joint-notes:sound', String(this.enabled));
      if (this.enabled) this.pop();
      return this.enabled;
    }
  };

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
        priority: (data.priority === 'high' || data.priority === 'low') ? data.priority : 'normal',
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
    reorder(fromId, toId) {
      const notes = this._read();
      const fromIndex = notes.findIndex(n => String(n.id) === String(fromId));
      const toIndex = notes.findIndex(n => String(n.id) === String(toId));
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false;
      const moved = notes.splice(fromIndex, 1)[0];
      notes.splice(toIndex, 0, moved);
      this._write(notes);
      return true;
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

  // Rich content formatting: Markdown, code blocks, todo checklists, hashtags and clickable links
  function formatRichContent(content, query) {
    if (!content) return '';

    // Handle fenced code blocks ```lang\ncode\n``` first
    const codeBlocks = [];
    let text = String(content).replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function (match, lang, code) {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang, code });
      return `__CODE_BLOCK_${idx}__`;
    });

    const lines = text.split('\n');
    const formattedLines = lines.map((line, idx) => {
      // Todo checklist item (- [ ] or - [x])
      const todoMatch = line.match(/^(\s*(?:-\s*)?\[([ xX])\]\s*)(.*)$/);
      if (todoMatch) {
        const isChecked = todoMatch[2].toLowerCase() === 'x';
        const taskText = formatInlineMarkdown(todoMatch[3], query);
        return `<label class="todo-line ${isChecked ? 'done' : ''}"><input type="checkbox" class="todo-checkbox" data-line="${idx}" ${isChecked ? 'checked' : ''}><span>${taskText}</span></label>`;
      }

      // Headers: # ## ###
      const headerMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const hText = formatInlineMarkdown(headerMatch[2], query);
        return `<h${level}>${hText}</h${level}>`;
      }

      // Blockquotes: > quote
      const quoteMatch = line.match(/^>\s+(.*)$/);
      if (quoteMatch) {
        return `<blockquote>${formatInlineMarkdown(quoteMatch[1], query)}</blockquote>`;
      }

      return formatInlineMarkdown(line, query);
    });

    let result = formattedLines.join('<br>');

    // Restore code blocks safely with copy capability
    codeBlocks.forEach((b, idx) => {
      const safeCode = escapeHTML(b.code.trim());
      const blockHtml = `<pre><code>${safeCode}</code></pre>`;
      result = result.replace(`__CODE_BLOCK_${idx}__`, blockHtml);
    });

    return result;
  }

  // Format inline Markdown elements
  function formatInlineMarkdown(text, query) {
    if (!text) return '';
    let res = escapeHTML(text);

    // Inline code `code`
    res = res.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

    // Bold **text** or __text__
    res = res.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    res = res.replace(/__([^_]+)__/g, '<strong>$1</strong>');

    // Italic *text* or _text_
    res = res.replace(/(^|[^*])\*([^*]+)\*([^*]|$)/g, '$1<em>$2</em>$3');

    // Strikethrough ~~text~~
    res = res.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // Hashtags #tag
    res = res.replace(/(^|\s)#([a-zA-Zа-яА-ЯёЁ0-9_-]+)/g, '$1<span class="note-hashtag" data-tag="$2">#$2</span>');

    // Auto-link URLs
    res = res.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="note-link">$1</a>');

    // Search query highlight
    if (query && query.trim()) {
      const cleanQ = query.trim().replace(/^#/, '');
      if (cleanQ) {
        const qEsc = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(?![^<]*>)(${qEsc})`, 'gi');
        res = res.replace(regex, '<mark class="search-highlight">$1</mark>');
      }
    }

    return res;
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
        case 'priority-desc':
          const pOrder = { high: 3, normal: 2, low: 1 };
          const pA = pOrder[a.priority || 'normal'] || 2;
          const pB = pOrder[b.priority || 'normal'] || 2;
          if (pA !== pB) return pB - pA;
          return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
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

  // Render dynamic tag cloud
  function renderTagCloud(allNotes) {
    if (!dom.tagCloud) return;
    const tagCounts = {};
    for (const n of allNotes) {
      const tags = Array.isArray(n.tags) ? n.tags : (n.tags ? String(n.tags).split(/[,\s]+/) : []);
      for (let t of tags) {
        t = t.replace(/^#/, '').trim();
        if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
      }
      const matches = (n.content || '').match(/#([a-zA-Zа-яА-ЯёЁ0-9_-]+)/g);
      if (matches) {
        for (let m of matches) {
          const t = m.slice(1).trim();
          if (t) tagCounts[t] = (tagCounts[t] || 0) + 1;
        }
      }
    }

    const tagKeys = Object.keys(tagCounts).sort((a, b) => tagCounts[b] - tagCounts[a]);
    if (!tagKeys.length) {
      dom.tagCloud.innerHTML = '';
      return;
    }

    const currentTag = searchQuery.startsWith('#') ? searchQuery.slice(1).toLowerCase() : searchQuery.toLowerCase();

    dom.tagCloud.innerHTML = tagKeys.slice(0, 16).map(tag => {
      const isActive = currentTag === tag.toLowerCase();
      return `<button type="button" class="tag-cloud-item ${isActive ? 'active' : ''}" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)} <span class="tag-cloud-count">(${tagCounts[tag]})</span></button>`;
    }).join('');
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

    // Always update tag cloud with full collection
    renderTagCloud(allNotes);

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

    // Filter by priority
    if (currentFilterPriority !== 'all') {
      notes = notes.filter(note => (note.priority || 'normal') === currentFilterPriority);
    }

    // Apply sorting
    notes = sortNotes(notes, currentSort);

    // Update Stats Badge
    if (dom.statsBadge) {
      const pinnedCount = allNotes.filter(n => n.pinned).length;
      let text = `Заметок: ${allNotes.length}`;
      if (pinnedCount > 0) text += ` (📌 ${pinnedCount} закр.)`;
      if (searchQuery || currentFilterColor !== 'all' || currentFilterPriority !== 'all') {
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
          <p class="subtitle">${searchQuery || currentFilterColor !== 'all' || currentFilterPriority !== 'all' ? 'Попробуйте сбросить поисковый запрос или фильтр' : 'Создайте свою первую заметку с помощью формы выше'}</p>
        </div>
      `;
      return;
    }

    dom.notesList.innerHTML = notes.map(note => {
      const color = note.color || 'default';
      const priority = note.priority || 'normal';
      const pLabel = priority === 'high' ? '🔥 Срочно' : (priority === 'low' ? '💤 Низкий' : '⚡ Обычный');
      const isPinned = Boolean(note.pinned);
      const tags = Array.isArray(note.tags) ? note.tags : (note.tags ? String(note.tags).split(',').map(s => s.trim()) : []);
      const tagsHtml = tags.map(t => `<span class="note-tag" data-tag="${escapeHTML(t)}">#${highlightText(t, searchQuery)}</span>`).join(' ');
      const dateStr = formatDate(note.updatedAt || note.createdAt);
      const titleHtml = highlightText(note.title || 'Без названия', searchQuery);
      const contentHtml = formatRichContent(note.content || '', searchQuery);

      const words = (note.content || '').trim().split(/\s+/).filter(Boolean).length;
      const readMin = Math.max(1, Math.ceil(words / 140));
      const readHtml = words > 15 ? `<span class="reading-time-badge" title="Примерное время чтения: ${readMin} мин">⏱️ ${readMin} мин</span>` : '';

      return `
        <article class="note-card color-${escapeHTML(color)} priority-${escapeHTML(priority)} ${isPinned ? 'is-pinned' : ''}" data-id="${escapeHTML(note.id)}" draggable="true">
          <div class="note-header">
            <div class="note-title-wrap">
              ${isPinned ? '<span class="pin-indicator" title="Закреплено">📌</span>' : ''}
              <span class="priority-badge ${escapeHTML(priority)}" title="Приоритет: ${pLabel}">${pLabel}</span>
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
            <div style="display:flex;align-items:center;">
              <time datetime="${escapeHTML(note.createdAt || '')}">${dateStr}</time>
              ${readHtml}
            </div>
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

  // Get selected priority from form
  function getSelectedPriority() {
    const checkedRadio = document.querySelector('input[name="note-priority"]:checked');
    if (checkedRadio && (checkedRadio.value === 'high' || checkedRadio.value === 'low' || checkedRadio.value === 'normal')) {
      return checkedRadio.value;
    }
    const activeOpt = document.querySelector('.priority-opt.active');
    if (activeOpt) {
      if (activeOpt.classList.contains('priority-high')) return 'high';
      if (activeOpt.classList.contains('priority-low')) return 'low';
      return 'normal';
    }
    return selectedPriority || 'normal';
  }

  // Set selected priority in form
  function setSelectedPriority(priority) {
    selectedPriority = (priority === 'high' || priority === 'low') ? priority : 'normal';
    document.querySelectorAll('.priority-opt').forEach(opt => {
      const input = opt.querySelector('input');
      const val = input ? input.value : (opt.classList.contains('priority-high') ? 'high' : (opt.classList.contains('priority-low') ? 'low' : 'normal'));
      const isActive = val === selectedPriority;
      opt.classList.toggle('active', isActive);
      if (input) input.checked = isActive;
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
    const priority = getSelectedPriority();
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
        priority,
        tags
      });
      audio.pop();
      broadcastChange('update');
      showToast('✓ Заметка обновлена!');
      cancelEdit();
    } else {
      // Create new
      storage.create({
        title,
        content,
        color,
        priority,
        tags
      });
      audio.pop();
      broadcastChange('create');
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
    setSelectedPriority(note.priority || 'normal');
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
    setSelectedPriority('normal');
    updateCharCounter();
  }

  // Toggle Pin
  function togglePinNote(noteId) {
    const storage = getStorage();
    if (typeof storage.togglePin === 'function') {
      const res = storage.togglePin(noteId);
      if (res) {
        audio.pin();
        broadcastChange('pin');
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
        audio.pop();
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
    audio.pop();
    showToast('📋 Заметка скопирована в буфер обмена');
  }

  // Delete note with soft undo
  function deleteNote(noteId) {
    const storage = getStorage();
    const deleted = storage.delete(noteId);
    if (!deleted) return;

    audio.delete();
    broadcastChange('delete');
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
          audio.pop();
          broadcastChange('restore');
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
    audio.pop();
    showToast('📥 Файл JSON успешно экспортирован!');
  }

  // Export notes to Markdown
  function exportNotesMarkdown() {
    const storage = getStorage();
    let mdStr = '';
    if (typeof storage.exportMarkdown === 'function') {
      mdStr = storage.exportMarkdown();
    } else {
      const all = storage.getAll() || [];
      mdStr = '# Joint Notes Backup\n\n' + all.map(n => `## ${n.title}\n\n${n.content}\n\n---\n`).join('\n');
    }

    const blob = new Blob([mdStr], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `joint-notes-export-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    audio.pop();
    showToast('📝 Заметки экспортированы в Markdown!');
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
          audio.pop();
          broadcastChange('import');
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
      audio.check();
      broadcastChange('todo');
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
        const tag = e.target.closest('.note-tag').dataset.tag;
        if (tag && dom.searchInput) {
          const cleanTag = tag.startsWith('#') ? tag : '#' + tag;
          dom.searchInput.value = cleanTag;
          searchQuery = cleanTag;
          audio.check();
          renderNotes();
          dom.searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (e.target.closest('.note-hashtag')) {
        e.stopPropagation();
        const tag = e.target.closest('.note-hashtag').dataset.tag;
        if (tag && dom.searchInput) {
          const cleanTag = '#' + tag;
          dom.searchInput.value = cleanTag;
          searchQuery = cleanTag;
          audio.check();
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
      audio.check();
      renderNotes();
    });
  }

  // Priority filter chips setup
  function setupPriorityFilters() {
    const filterContainer = document.querySelector('.priority-filter-chips');
    if (!filterContainer) return;

    filterContainer.addEventListener('click', function (e) {
      const chip = e.target.closest('.chip-filter');
      if (!chip) return;
      const priority = chip.dataset.priority || 'all';
      currentFilterPriority = priority;

      filterContainer.querySelectorAll('.chip-filter').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      audio.check();
      renderNotes();
    });
  }

  // Tag Cloud setup
  function setupTagCloud() {
    if (!dom.tagCloud) return;

    dom.tagCloud.addEventListener('click', function (e) {
      const item = e.target.closest('.tag-cloud-item');
      if (!item) return;
      const tag = item.dataset.tag;
      if (!tag) return;

      const tagQuery = '#' + tag;
      if (searchQuery.toLowerCase() === tagQuery.toLowerCase()) {
        searchQuery = '';
        if (dom.searchInput) dom.searchInput.value = '';
      } else {
        searchQuery = tagQuery;
        if (dom.searchInput) dom.searchInput.value = tagQuery;
      }
      audio.check();
      renderNotes();
    });
  }

  // Priority Selector in form
  function setupPrioritySelector() {
    const sel = dom.prioritySelector || document.getElementById('priority-selector');
    if (!sel) return;

    sel.addEventListener('click', function (e) {
      const opt = e.target.closest('.priority-opt');
      if (!opt) return;
      const input = opt.querySelector('input');
      const val = input ? input.value : (opt.classList.contains('priority-high') ? 'high' : (opt.classList.contains('priority-low') ? 'low' : 'normal'));
      setSelectedPriority(val);
      audio.check();
    });

    document.querySelectorAll('input[name="note-priority"]').forEach(radio => {
      radio.addEventListener('change', function () {
        if (this.checked) {
          setSelectedPriority(this.value);
          audio.check();
        }
      });
    });
  }

  // Sound Toggle button
  function setupSoundToggle() {
    if (!dom.soundToggle) return;
    function updateBtn() {
      dom.soundToggle.textContent = audio.enabled ? '🔊 Звук: Вкл' : '🔇 Звук: Выкл';
      dom.soundToggle.setAttribute('title', audio.enabled ? 'Выключить звуки интерфейса' : 'Включить звуки интерфейса');
    }
    updateBtn();
    dom.soundToggle.addEventListener('click', function () {
      audio.toggle();
      updateBtn();
    });
  }

  // HTML5 Drag-and-Drop reordering
  function setupDragAndDrop() {
    if (!dom.notesList) return;

    let draggedId = null;

    dom.notesList.addEventListener('dragstart', function (e) {
      const card = e.target.closest('.note-card');
      if (!card) return;
      if (['BUTTON', 'INPUT', 'TEXTAREA', 'A'].includes(e.target.tagName) || e.target.closest('.action-icon-btn')) {
        e.preventDefault();
        return;
      }
      draggedId = card.dataset.id;
      card.classList.add('dragging');
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedId);
      }
    });

    dom.notesList.addEventListener('dragend', function (e) {
      const card = e.target.closest('.note-card');
      if (card) card.classList.remove('dragging');
      document.querySelectorAll('.note-card.drag-over').forEach(c => c.classList.remove('drag-over'));
      draggedId = null;
    });

    dom.notesList.addEventListener('dragover', function (e) {
      e.preventDefault();
      const targetCard = e.target.closest('.note-card');
      if (!targetCard || targetCard.dataset.id === draggedId) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      document.querySelectorAll('.note-card.drag-over').forEach(c => {
        if (c !== targetCard) c.classList.remove('drag-over');
      });
      targetCard.classList.add('drag-over');
    });

    dom.notesList.addEventListener('dragleave', function (e) {
      const targetCard = e.target.closest('.note-card');
      if (targetCard && !targetCard.contains(e.relatedTarget)) {
        targetCard.classList.remove('drag-over');
      }
    });

    dom.notesList.addEventListener('drop', function (e) {
      e.preventDefault();
      const targetCard = e.target.closest('.note-card');
      if (!targetCard || !draggedId || targetCard.dataset.id === draggedId) return;

      const targetId = targetCard.dataset.id;
      const storage = getStorage();
      if (typeof storage.reorder === 'function') {
        const ok = storage.reorder(draggedId, targetId);
        if (ok) {
          audio.pop();
          broadcastChange('reorder');
          renderNotes();
          showToast('✓ Порядок заметок сохранён');
        }
      }
    });
  }

  // BroadcastChannel for instant zero-latency multi-tab sync
  let syncChannel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      syncChannel = new BroadcastChannel('joint-notes-sync');
    }
  } catch (_) {}

  function broadcastChange(action) {
    if (syncChannel) {
      try {
        syncChannel.postMessage({ type: 'notes-sync', action, ts: Date.now() });
      } catch (_) {}
    }
  }

  function setupBroadcastSync() {
    if (!syncChannel) return;
    syncChannel.onmessage = function (e) {
      if (e.data && e.data.type === 'notes-sync') {
        renderNotes();
        showToast('⚡ Заметки синхронизированы в реальном времени', { duration: 2000 });
      }
    };
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  }

  // Live multi-tab sync via window storage event
  function setupTabSync() {
    window.addEventListener('storage', function (e) {
      if (e.key === 'joint-notes:notes' || e.key === 'joint_notes_data') {
        renderNotes();
        showToast('⚡ Заметки синхронизированы из другой вкладки', { duration: 2500 });
      }
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

  // Markdown quick insertion helper
  function insertMarkdown(tool) {
    if (!dom.noteContent) return;
    const textarea = dom.noteContent;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const selText = textarea.value.substring(start, end);
    let before = '', after = '', placeholder = '';

    switch (tool) {
      case 'bold': before = '**'; after = '**'; placeholder = 'жирный текст'; break;
      case 'italic': before = '*'; after = '*'; placeholder = 'курсив'; break;
      case 'code': before = '`'; after = '`'; placeholder = 'код'; break;
      case 'todo': before = '- [ ] '; after = ''; placeholder = 'задача'; break;
      case 'quote': before = '> '; after = ''; placeholder = 'цитата'; break;
      case 'header': before = '### '; after = ''; placeholder = 'Заголовок'; break;
      case 'tag': before = '#'; after = ''; placeholder = 'метка'; break;
    }

    const replacement = selText ? (before + selText + after) : (before + placeholder + after);
    textarea.focus();
    if (typeof textarea.setRangeText === 'function') {
      textarea.setRangeText(replacement, start, end, 'select');
    } else {
      textarea.value = textarea.value.substring(0, start) + replacement + textarea.value.substring(end);
    }
    updateCharCounter();
    audio.check();
  }

  // Editor Tabs & Toolbar setup
  function setupEditorToolbarAndPreview() {
    if (dom.toolbar) {
      dom.toolbar.addEventListener('click', function (e) {
        const btn = e.target.closest('.md-tool-btn');
        if (!btn) return;
        const tool = btn.dataset.tool;
        if (tool) insertMarkdown(tool);
      });
    }

    if (dom.tabWrite && dom.tabPreview) {
      dom.tabWrite.addEventListener('click', function () {
        dom.tabWrite.classList.add('active');
        dom.tabPreview.classList.remove('active');
        if (dom.noteContent) dom.noteContent.style.display = 'block';
        if (dom.previewPane) dom.previewPane.style.display = 'none';
        if (dom.noteContent) dom.noteContent.focus();
      });

      dom.tabPreview.addEventListener('click', function () {
        dom.tabPreview.classList.add('active');
        dom.tabWrite.classList.remove('active');
        if (dom.noteContent) dom.noteContent.style.display = 'none';
        if (dom.previewPane) {
          dom.previewPane.style.display = 'block';
          const val = (dom.noteContent ? dom.noteContent.value : '').trim();
          dom.previewPane.innerHTML = val
            ? formatRichContent(val, '')
            : '<em style="color:var(--text-muted);font-size:0.85rem;">Предпросмотр пуст — начните писать заметку на вкладке «Правка»</em>';
        }
      });
    }
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

    if (dom.soundToggle) {
      setupSoundToggle();
    }

    if (dom.exportBtn) {
      dom.exportBtn.addEventListener('click', exportNotes);
    }

    if (dom.exportMdBtn) {
      dom.exportMdBtn.addEventListener('click', exportNotesMarkdown);
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

    setupPrioritySelector();
    setupEditorToolbarAndPreview();
    setupListDelegation();
    setupColorFilters();
    setupPriorityFilters();
    setupTagCloud();
    setupShortcuts();
    setupDragAndDrop();
    setupTabSync();
    setupBroadcastSync();
  }

  // Main init
  function init() {
    initDom();
    initTheme();
    initEvents();
    updateCharCounter();
    renderNotes();
    registerServiceWorker();
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
