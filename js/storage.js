/* NotesStorage — хранилище заметок в localStorage.
 * Интерфейс согласован с side-b в комнате main:
 *   getAll(), get(id), create({title, content, color, tags}),
 *   update(id, fields), delete(id), exportJSON()
 * Note: { id, title, content, color, tags, createdAt, updatedAt }
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
        createdAt: now,
        updatedAt: now
      };
      var notes = readAll();
      notes.push(note);
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
          notes[i].updatedAt = new Date().toISOString();
          writeAll(notes);
          return Object.assign({}, notes[i]);
        }
      }
      return null;
    },

    delete: function (id) {
      var notes = readAll();
      var next = notes.filter(function (n) { return n.id !== id; });
      if (next.length === notes.length) return false;
      writeAll(next);
      return true;
    },

    exportJSON: function () {
      return JSON.stringify(readAll(), null, 2);
    }
  };

  window.NotesStorage = NotesStorage;
})();
