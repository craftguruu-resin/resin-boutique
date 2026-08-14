"use strict";

/**
 * Courier adapter contract (tracking-only providers).
 *
 * Each adapter in courier-registry.js should implement:
 *   id            - stable slug (e.g. "delhivery", "bigship")
 *   displayName   - vendor UI label
 *   isConfigured  - () => boolean
 *   fetchTracking - (waybill, opts?) => Promise<NormalizedTracking>
 *   validateAwb   - (waybill) => { ok, trackingNumber?, error? }
 *
 * NormalizedTracking shape (consumed by shipment-sync.js):
 *   ok, found, trackingNumber, courierName, shipmentStatus, shipmentStatusCode,
 *   trackingUrl, dispatchDate, estimatedDeliveryDate, actualDeliveryDate,
 *   history[], rawStatus, syncedAt, courierPartner?, error?
 *
 * Shared HTTP: courier-http.js (retry, timeout)
 * Shared logging: courier-logger.js
 */

module.exports = {
  ADAPTER_FIELDS: [
    "id",
    "displayName",
    "isConfigured",
    "fetchTracking",
    "validateAwb",
  ],
};
