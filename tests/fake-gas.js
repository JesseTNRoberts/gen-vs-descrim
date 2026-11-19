// A small in-memory stand-in for the Google Apps Script services Code.gs uses,
// so the real Code.gs can run under node (tests and the local dev server).
const fs = require('fs'), vm = require('vm'), path = require('path');

function makeSheet(rows) {
  return {
    rows,
    appendRow(r) { rows.push(r.map((v) => (typeof v === 'string' && v[0] === "'") ? v.slice(1) : v)); },
    getDataRange() { return { getValues: () => rows.map((r) => r.slice()) }; },
    getLastRow() { return rows.length; },
    getRange(r, c, nr, nc) {
      return {
        getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
        setValues: (vals) => vals.forEach((v, i) => {
          rows[r - 1 + i] = v.map((x) => (typeof x === 'string' && x[0] === "'") ? x.slice(1) : x);
        })
      };
    },
    setFrozenRows() {}
  };
}

function loadCodeGs(file) {
  const sheets = {}, cache = {}, props = {};
  const ss = {
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet([]))
  };
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (k in cache ? cache[k] : null),
        getAll: (ks) => { const o = {}; ks.forEach((k) => { if (k in cache) o[k] = cache[k]; }); return o; },
        putAll: (obj) => { Object.assign(cache, obj); },
        put: (k, v) => { if (String(v).length > 100000) throw new Error('cache value too big'); cache[k] = String(v); },
        remove: (k) => { delete cache[k]; }
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { if (String(v).length > 9000) throw new Error('property too big'); props[k] = String(v); }
      })
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ text: t, setMimeType() { return this; } }) },
    JSON, Math, String, Number, Object, Array, Date
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file || path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
  return {
    ctx, sheets, cache, props,
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text),
    get: (params) => JSON.parse(ctx.doGet({ parameter: params }).text),
    dropCache: () => { for (const k of Object.keys(cache)) delete cache[k]; }
  };
}

module.exports = { loadCodeGs };
