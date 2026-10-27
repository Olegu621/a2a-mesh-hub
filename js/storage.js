/* NotesStorage — хранилище заметок в localStorage.
 * Расширенная версия: поддержка pinned, importJSON, restore (undo delete).
 * Note: { id, title, content, color, tags, pinned, createdAt, updatedAt }
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'joint-notes:notes';

  function readAll() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeAll(notes) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function uid() {
    return 'note-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var NotesStorage = {
    getAll: function () {
      return readAll().slice();
    },

    get: function (id) {
      var found = readAll().filter(function (n) { return n.id === id; })[0];
      return found ? Object.assign({}, found) : null;
    },

    create: function (data) {
      data = data || {};
      var now = new Date().toISOString();
      var note = {
        id: uid(),
        title: String(data.title || 'Без названия'),
        content: String(data.content || ''),
        color: String(data.color || 'default'),
        tags: Array.isArray(data.tags) ? data.tags.slice() : [],
        pinned: Boolean(data.pinned),
        createdAt: now,
        updatedAt: now
      };
      var notes = readAll();
      notes.unshift(note);
      writeAll(notes);
      return Object.assign({}, note);
    },

    update: function (id, fields) {
      var notes = readAll();
      for (var i = 0; i < notes.length; i++) {
        if (notes[i].id === id) {
          var f = fields || {};
          if (f.title !== undefined) notes[i].title = String(f.title);
          if (f.content !== undefined) notes[i].content = String(f.content);
          if (f.color !== undefined) notes[i].color = String(f.color);
          if (f.tags !== undefined) notes[i].tags = Array.isArray(f.tags) ? f.tags.slice() : [];
          if (f.pinned !== undefined) notes[i].pinned = Boolean(f.pinned);
          notes[i].updatedAt = new Date().toISOString();
          writeAll(notes);
          return Object.assign({}, notes[i]);
        }
      }
      return null;
    },

    togglePin: function (id) {
      var note = this.get(id);
      if (!note) return null;
      return this.update(id, { pinned: !note.pinned });
    },

    delete: function (id) {
      var notes = readAll();
      var target = null;
      var next = [];
      for (var i = 0; i < notes.length; i++) {
        if (notes[i].id === id) {
          target = notes[i];
        } else {
          next.push(notes[i]);
        }
      }
      if (!target) return false;
      writeAll(next);
      return target; // return deleted note object so it can be restored if needed
    },

    restore: function (note) {
      if (!note || !note.id) return null;
      var notes = readAll();
      var exists = notes.some(function (n) { return n.id === note.id; });
      if (!exists) {
        notes.unshift(note);
        writeAll(notes);
      }
      return note;
    },

    exportJSON: function () {
      return JSON.stringify(readAll(), null, 2);
    },

    importJSON: function (jsonString, mode) {
      try {
        var parsed = JSON.parse(jsonString);
        if (!Array.isArray(parsed)) {
          throw new Error('Файл должен содержать массив заметок');
        }
        var current = (mode === 'replace') ? [] : readAll();
        var existingIds = new Set(current.map(function (n) { return n.id; }));
        var count = 0;

        for (var i = 0; i < parsed.length; i++) {
          var item = parsed[i];
          if (!item || typeof item !== 'object') continue;
          var newId = (item.id && !existingIds.has(item.id)) ? item.id : uid();
          var validated = {
            id: newId,
            title: String(item.title || 'Без названия'),
            content: String(item.content || ''),
            color: String(item.color || 'default'),
            tags: Array.isArray(item.tags) ? item.tags : [],
            pinned: Boolean(item.pinned),
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
          };
          current.unshift(validated);
          existingIds.add(newId);
          count++;
        }

        writeAll(current);
        return { success: true, count: count };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }
  };

  window.NotesStorage = NotesStorage;
})();
