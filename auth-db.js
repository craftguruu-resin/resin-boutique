/**
 * Local IndexedDB for Craft Guru accounts (email as key).
 * OTP is sent by the API — see auth-home.js.
 */
(function (global) {
  "use strict";

  var DB_NAME = "craftguru_auth";
  var DB_VERSION = 2;
  var dbInstance = null;

  function openDb(callback) {
    if (dbInstance) return callback(null, dbInstance);
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = function () {
      callback(req.error || new Error("IDB open failed"));
    };
    req.onupgradeneeded = function (e) {
      var db = e.target.result;
      var old = e.oldVersion || 0;
      if (old < 2) {
        if (db.objectStoreNames.contains("users")) {
          db.deleteObjectStore("users");
        }
        if (!db.objectStoreNames.contains("accounts")) {
          db.createObjectStore("accounts", { keyPath: "email" });
        }
      }
    };
    req.onsuccess = function (e) {
      dbInstance = e.target.result;
      callback(null, dbInstance);
    };
  }

  function normalizeEmailKey(raw) {
    return String(raw || "")
      .trim()
      .toLowerCase();
  }

  function putUser(user, callback) {
    var em = normalizeEmailKey(user && user.email);
    if (!em || em.indexOf("@") < 1) {
      return callback(new Error("Valid email required"));
    }
    openDb(function (err, db) {
      if (err) return callback(err);
      try {
        var row = {
          email: em,
          name: user && user.name != null ? String(user.name).trim() : "",
          createdAt: (user && user.createdAt) || Date.now(),
        };
        var tx = db.transaction("accounts", "readwrite");
        tx.objectStore("accounts").put(row);
        tx.oncomplete = function () {
          callback(null);
        };
        tx.onerror = function () {
          callback(tx.error || new Error("put failed"));
        };
      } catch (e2) {
        callback(e2);
      }
    });
  }

  function getUser(email, callback) {
    var em = normalizeEmailKey(email);
    openDb(function (err, db) {
      if (err) return callback(err, null);
      if (!em) return callback(null, null);
      try {
        var tx = db.transaction("accounts", "readonly");
        var q = tx.objectStore("accounts").get(em);
        q.onsuccess = function () {
          callback(null, q.result || null);
        };
        q.onerror = function () {
          callback(q.error, null);
        };
      } catch (e2) {
        callback(e2, null);
      }
    });
  }

  var SESSION_KEY = "cg_session_email";
  var ORDERS_KEY = "cg_orders";

  function saveOrderForSession(order) {
    try {
      var email = localStorage.getItem(SESSION_KEY);
      if (!email || !order) return;
      var list = JSON.parse(localStorage.getItem(ORDERS_KEY) || "[]");
      list.unshift(Object.assign({ email: email, at: Date.now() }, order));
      localStorage.setItem(ORDERS_KEY, JSON.stringify(list.slice(0, 80)));
    } catch (_) {}
  }

  global.CRAFT_AUTH_DB = {
    putUser: putUser,
    getUser: getUser,
    openDb: openDb,
    saveOrderForSession: saveOrderForSession,
    SESSION_EMAIL_KEY: SESSION_KEY,
  };
})(typeof window !== "undefined" ? window : this);
