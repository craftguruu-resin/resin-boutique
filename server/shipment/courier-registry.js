"use strict";

var delhivery = require("./courier-delhivery.js");
var bigship = require("./courier-bigship.js");

var COURIERS = {
  delhivery: delhivery,
  bigship: bigship,
};

var ALIASES = {
  "blue dart": "bluedart",
  bluedart: "bluedart",
  dtdc: "dtdc",
  delhivery: "delhivery",
  bigship: "bigship",
  "big ship": "bigship",
};

function normalizeCourierId(name) {
  var s = String(name || "BigShip")
    .trim()
    .toLowerCase();
  if (ALIASES[s]) return ALIASES[s];
  return s.replace(/\s+/g, "");
}

function getCourier(name) {
  var id = normalizeCourierId(name);
  if (COURIERS[id]) return COURIERS[id];
  return bigship;
}

function listCouriers() {
  return Object.keys(COURIERS).map(function (id) {
    var c = COURIERS[id];
    return {
      id: id,
      displayName: c.displayName,
      configured: typeof c.isConfigured === "function" ? c.isConfigured() : false,
    };
  });
}

function anyCourierConfigured() {
  return listCouriers().some(function (c) {
    return c.configured;
  });
}

/**
 * Fetch tracking from the appropriate courier adapter.
 * @param {string} courierName
 * @param {string} trackingNumber
 * @returns {Promise<object>}
 */
function fetchTracking(courierName, trackingNumber) {
  var courier = getCourier(courierName);
  if (typeof courier.fetchTracking === "function") {
    return courier.fetchTracking(trackingNumber);
  }
  return Promise.reject(new Error("Courier adapter not implemented: " + String(courierName || "")));
}

function validateTracking(courierName, trackingNumber) {
  var courier = getCourier(courierName);
  if (typeof courier.validateAwb === "function") return courier.validateAwb(trackingNumber);
  var shipmentStatus = require("./shipment-status.js");
  return shipmentStatus.validateTrackingNumber(trackingNumber, courierName);
}

module.exports = {
  getCourier: getCourier,
  listCouriers: listCouriers,
  anyCourierConfigured: anyCourierConfigured,
  fetchTracking: fetchTracking,
  validateTracking: validateTracking,
  normalizeCourierId: normalizeCourierId,
};
