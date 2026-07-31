"use strict";

/** Canonical shipment status codes stored in DB (shipment_status_code). */
var STATUS = {
  ORDER_CREATED: "order_created",
  PICKUP_SCHEDULED: "pickup_scheduled",
  PICKED_UP: "picked_up",
  IN_TRANSIT: "in_transit",
  REACHED_HUB: "reached_hub",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  DELIVERY_ATTEMPTED: "delivery_attempted",
  RETURNED: "returned",
  CANCELLED: "cancelled",
  LOST: "lost",
  UNDELIVERED: "undelivered",
};

var LABELS = {
  order_created: "Order Created",
  pickup_scheduled: "Pickup Scheduled",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  reached_hub: "Reached Hub",
  out_for_delivery: "Out For Delivery",
  delivered: "Delivered",
  delivery_attempted: "Delivery Attempted",
  returned: "Returned",
  cancelled: "Cancelled",
  lost: "Lost",
  undelivered: "Undelivered",
};

/** Progress timeline steps (happy path). Side states overlay on current step. */
var TIMELINE_STEPS = [
  STATUS.ORDER_CREATED,
  STATUS.PICKUP_SCHEDULED,
  STATUS.PICKED_UP,
  STATUS.IN_TRANSIT,
  STATUS.REACHED_HUB,
  STATUS.OUT_FOR_DELIVERY,
  STATUS.DELIVERED,
];

var TERMINAL_CODES = {
  delivered: 1,
  returned: 1,
  cancelled: 1,
  lost: 1,
  undelivered: 1,
};

var STEP_RANK = {};
TIMELINE_STEPS.forEach(function (code, i) {
  STEP_RANK[code] = i;
});

function normalizeCourierStatusText(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Map Delhivery (or generic courier) status text to canonical code.
 * @param {string} raw
 * @returns {string}
 */
function mapCourierStatusToCode(raw) {
  var s = normalizeCourierStatusText(raw);
  if (!s) return STATUS.ORDER_CREATED;

  if (/\bdelivered\b/.test(s) && !/undelivered|not delivered|attempted/.test(s)) return STATUS.DELIVERED;
  if (/undelivered|not delivered/.test(s)) return STATUS.UNDELIVERED;
  if (/delivery attempted|attempted delivery|pending.*delivery/.test(s)) return STATUS.DELIVERY_ATTEMPTED;
  if (/out for delivery|dispatched for delivery|ofd\b/.test(s)) return STATUS.OUT_FOR_DELIVERY;
  if (/reached hub|at destination|destination hub|arrived at hub/.test(s)) return STATUS.REACHED_HUB;
  if (/in transit|transit|line haul|connected|forwarded/.test(s)) return STATUS.IN_TRANSIT;
  if (/picked up|pickup complete|collected from/.test(s)) return STATUS.PICKED_UP;
  if (/pickup scheduled|pickup pending|scheduled for pickup|manifested for pickup/.test(s)) return STATUS.PICKUP_SCHEDULED;
  if (/returned|rto|return to origin|reverse/.test(s)) return STATUS.RETURNED;
  if (/cancelled|canceled|shipment cancelled/.test(s)) return STATUS.CANCELLED;
  if (/\blost\b|missing/.test(s)) return STATUS.LOST;
  if (/manifested|order created|booked|shipment created|pending pickup|awaiting pickup/.test(s)) return STATUS.ORDER_CREATED;

  return STATUS.IN_TRANSIT;
}

function statusLabel(code) {
  return LABELS[code] || LABELS.order_created;
}

function isTerminalStatus(code) {
  return !!TERMINAL_CODES[String(code || "").toLowerCase()];
}

function isActiveStatus(code) {
  return !isTerminalStatus(code);
}

/**
 * Build visual timeline for UI from history + current status.
 * @param {string} currentCode
 * @param {object[]} history - { statusCode, statusLabel, at, source? }
 * @returns {object[]}
 */
function buildTimeline(currentCode, history) {
  var code = String(currentCode || STATUS.ORDER_CREATED).toLowerCase();
  var curRank = STEP_RANK[code];
  if (curRank == null) {
    if (code === STATUS.DELIVERY_ATTEMPTED) curRank = STEP_RANK[STATUS.OUT_FOR_DELIVERY];
    else if (code === STATUS.RETURNED || code === STATUS.CANCELLED || code === STATUS.LOST || code === STATUS.UNDELIVERED) {
      curRank = STEP_RANK[STATUS.OUT_FOR_DELIVERY];
    } else curRank = 0;
  }

  var tsByCode = {};
  (history || []).forEach(function (h) {
    var c = String(h.statusCode || h.code || "").toLowerCase();
    if (!c) return;
    var at = h.at || h.timestamp || h.scanDateTime || null;
    if (at && (!tsByCode[c] || new Date(at) < new Date(tsByCode[c]))) tsByCode[c] = at;
    if (at && (!tsByCode[c] || new Date(at) > new Date(tsByCode[c]))) {
      if (!tsByCode[c]) tsByCode[c] = at;
    }
  });
  (history || []).forEach(function (h) {
    var c = String(h.statusCode || h.code || "").toLowerCase();
    if (!c) return;
    var at = h.at || h.timestamp || h.scanDateTime || null;
    if (at) tsByCode[c] = at;
  });

  var steps = TIMELINE_STEPS.map(function (stepCode, idx) {
    var state = "upcoming";
    if (idx < curRank) state = "complete";
    else if (idx === curRank) state = "current";
    else if (code === STATUS.DELIVERED && stepCode === STATUS.DELIVERED) state = "current";

    if (code === STATUS.DELIVERED && idx <= STEP_RANK[STATUS.DELIVERED]) state = "complete";

    return {
      code: stepCode,
      label: statusLabel(stepCode),
      state: state,
      timestamp: tsByCode[stepCode] || null,
    };
  });

  var side = null;
  if (
    code === STATUS.DELIVERY_ATTEMPTED ||
    code === STATUS.RETURNED ||
    code === STATUS.CANCELLED ||
    code === STATUS.LOST ||
    code === STATUS.UNDELIVERED
  ) {
    side = {
      code: code,
      label: statusLabel(code),
      state: "alert",
      timestamp: tsByCode[code] || null,
    };
  }

  return { steps: steps, alert: side, currentCode: code, currentLabel: statusLabel(code) };
}

/** AWB / tracking number format validation (Delhivery default). */
function validateTrackingNumber(trackingNumber, courierName) {
  var awb = String(trackingNumber || "").trim();
  if (!awb) return { ok: false, error: "Tracking ID / AWB is required." };
  if (awb.length < 8 || awb.length > 24) {
    return { ok: false, error: "Tracking ID must be 8–24 characters." };
  }
  if (!/^[A-Za-z0-9]+$/.test(awb)) {
    return { ok: false, error: "Tracking ID may only contain letters and numbers." };
  }
  var courier = String(courierName || "Delhivery").trim();
  if (/delhivery/i.test(courier) && !/^[0-9]{10,16}$/.test(awb) && !/^[A-Z0-9]{10,16}$/i.test(awb)) {
    return { ok: false, error: "Delhivery AWB is usually 10–16 alphanumeric digits." };
  }
  return { ok: true, trackingNumber: awb };
}

function defaultTrackingUrl(courierName, trackingNumber) {
  var awb = String(trackingNumber || "").trim();
  if (!awb) return "";
  if (/delhivery/i.test(String(courierName || ""))) {
    return "https://www.delhivery.com/track/package/" + encodeURIComponent(awb);
  }
  return "";
}

module.exports = {
  STATUS: STATUS,
  LABELS: LABELS,
  TIMELINE_STEPS: TIMELINE_STEPS,
  mapCourierStatusToCode: mapCourierStatusToCode,
  statusLabel: statusLabel,
  isTerminalStatus: isTerminalStatus,
  isActiveStatus: isActiveStatus,
  buildTimeline: buildTimeline,
  validateTrackingNumber: validateTrackingNumber,
  defaultTrackingUrl: defaultTrackingUrl,
};
