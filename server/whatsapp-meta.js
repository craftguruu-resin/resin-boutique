"use strict";

var GRAPH_BASE = "https://graph.facebook.com/";

function graphUrl(version) {
  var v = (version || "v21.0").replace(/^\/+/, "");
  return GRAPH_BASE + v;
}

/**
 * @param {object} opts
 * @param {string} opts.token
 * @param {string} opts.phoneNumberId
 * @param {string} opts.graphVersion
 * @param {Buffer} opts.buffer
 * @param {string} opts.mime e.g. image/jpeg or application/pdf
 * @param {string} opts.filename
 * @returns {Promise<string>} media id
 */
function uploadMedia(opts) {
  var fd = new FormData();
  fd.append("messaging_product", "whatsapp");
  fd.append("type", opts.mime);
  var blob = new Blob([opts.buffer], { type: opts.mime });
  fd.append("file", blob, opts.filename);

  return fetch(graphUrl(opts.graphVersion) + "/" + opts.phoneNumberId + "/media", {
    method: "POST",
    headers: { Authorization: "Bearer " + opts.token },
    body: fd,
  }).then(function (res) {
    return res.json().then(function (j) {
      if (!res.ok) {
        var err = new Error("WhatsApp media upload failed");
        err.detail = j;
        throw err;
      }
      return j.id;
    });
  });
}

/**
 * @param {object} opts
 * @param {string} opts.toDigits country + number, no +
 * @param {string} opts.mediaId
 * @param {string} [opts.caption] max 1024
 */
function sendImageMessage(opts) {
  var cap = opts.caption ? String(opts.caption).slice(0, 1024) : undefined;
  var body = {
    messaging_product: "whatsapp",
    to: opts.toDigits,
    type: "image",
    image: { id: opts.mediaId },
  };
  if (cap) body.image.caption = cap;

  return fetch(graphUrl(opts.graphVersion) + "/" + opts.phoneNumberId + "/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + opts.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(function (res) {
    return res.json().then(function (j) {
      if (!res.ok) {
        var err = new Error("WhatsApp send image failed");
        err.detail = j;
        throw err;
      }
      return j;
    });
  });
}

function sendDocumentMessage(opts) {
  var body = {
    messaging_product: "whatsapp",
    to: opts.toDigits,
    type: "document",
    document: {
      id: opts.mediaId,
      filename: opts.filename || "Craftguru-order-bill.pdf",
    },
  };
  if (opts.caption) body.document.caption = String(opts.caption).slice(0, 1024);

  return fetch(graphUrl(opts.graphVersion) + "/" + opts.phoneNumberId + "/messages", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + opts.token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  }).then(function (res) {
    return res.json().then(function (j) {
      if (!res.ok) {
        var err = new Error("WhatsApp send document failed");
        err.detail = j;
        throw err;
      }
      return j;
    });
  });
}

module.exports = {
  uploadMedia,
  sendImageMessage,
  sendDocumentMessage,
};
