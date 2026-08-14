"use strict";

/**
 * Smoke tests for courier payload parsers (no live API).
 * Run: node server/shipment/test-courier-parse.js
 */

var assert = require("assert");
var bigship = require("./courier-bigship.js");
var delhivery = require("./courier-delhivery.js");

function testBigShipParse() {
  var payload = {
    success: true,
    data: {
      tracking_id: "13090318586270",
      tracking_type: "awb",
      current_status: "In Transit",
      courier_name: "Delhivery",
      estimated_delivery_date: "2026-08-20T00:00:00.000Z",
      tracking_events: [
        {
          scan_status: "Manifested",
          scan_datetime: "2026-08-14T10:00:00.000Z",
          scan_location: "Delhi",
        },
        {
          scan_status: "In Transit",
          scan_datetime: "2026-08-15T08:00:00.000Z",
          scan_location: "Mumbai",
        },
      ],
    },
  };
  var out = bigship.parseBigShipPayload("13090318586270", payload);
  assert.strictEqual(out.found, true);
  assert.strictEqual(out.courierName, "BigShip");
  assert.strictEqual(out.courierPartner, "Delhivery");
  assert.strictEqual(out.shipmentStatusCode, "in_transit");
  assert.ok(out.estimatedDeliveryDate);
  assert.strictEqual(out.history.length, 2);
  console.log("bigship parse: ok");
}

function testDelhiveryParse() {
  var payload = {
    ShipmentData: [
      {
        Shipment: {
          Status: { Status: "Delivered", StatusDateTime: "2026-08-16T12:00:00.000Z" },
          ExpectedDeliveryDate: "2026-08-16",
          DeliveryDate: "2026-08-16T12:00:00.000Z",
          Scans: [
            {
              ScanDetail: {
                Scan: "In Transit",
                ScanDateTime: "2026-08-15T08:00:00.000Z",
                ScannedLocation: "Hub",
              },
            },
          ],
        },
      },
    ],
  };
  var out = delhivery.parseDelhiveryPayload("1234567890123", payload);
  assert.strictEqual(out.found, true);
  assert.strictEqual(out.courierPartner, "Delhivery");
  assert.strictEqual(out.shipmentStatusCode, "delivered");
  console.log("delhivery parse: ok");
}

testBigShipParse();
testDelhiveryParse();
console.log("All courier parse tests passed.");
