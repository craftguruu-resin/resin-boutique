"use strict";

var poolMod = require("./db/pool.js");

function defaultHeroSettings() {
  return {
    displayMode: "carousel",
    carouselIntervalMs: 5000,
    singleSlideId: null,
    customHeroEnabled: true,
  };
}

function clampIntervalMs(v) {
  var n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 5000;
  return Math.min(60000, Math.max(1500, n));
}

/** Merge boolean custom-hero flag from PATCH body (Express may send string "false"). */
function patchCustomHeroEnabled(cur, patch) {
  if (!patch || !Object.prototype.hasOwnProperty.call(patch, "customHeroEnabled")) {
    return cur.customHeroEnabled !== false;
  }
  var v = patch.customHeroEnabled;
  if (v === false || v === 0 || String(v).toLowerCase() === "false") return false;
  if (v === true || v === 1 || String(v).toLowerCase() === "true") return true;
  return cur.customHeroEnabled !== false;
}

/**
 * @param {(err: Error|null, rows?: { id: number, image: string, animation: string, sortOrder: number }[]) => void} cb
 */
function listSlides(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, []);
    });
  }
  pool
    .query(
      "SELECT id, image_path AS image, animation, sort_order AS \"sortOrder\" FROM storefront_hero_slides ORDER BY sort_order ASC, id ASC"
    )
    .then(function (r) {
      cb(
        null,
        (r.rows || []).map(function (row) {
          return {
            id: row.id,
            image: String(row.image || "").trim(),
            animation: String(row.animation || "orbit").trim().slice(0, 40),
            sortOrder: row.sortOrder != null ? Number(row.sortOrder) : 0,
          };
        })
      );
    })
    .catch(cb);
}

/**
 * @param {(err: Error|null, settings?: { displayMode: string, carouselIntervalMs: number, singleSlideId: number|null }) => void} cb
 */
function getHeroSettings(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, defaultHeroSettings());
    });
  }
  pool
    .query(
      "SELECT display_mode, carousel_interval_ms, single_slide_id, custom_hero_enabled FROM storefront_hero_settings WHERE id = 1 LIMIT 1"
    )
    .then(function (r) {
      if (!r.rows || !r.rows.length) {
        return cb(null, defaultHeroSettings());
      }
      var row = r.rows[0];
      var mode = String(row.display_mode || "carousel").toLowerCase();
      var che = row.custom_hero_enabled;
      var customOn = che !== false && che !== 0 && String(che).toLowerCase() !== "false";
      cb(null, {
        displayMode: mode === "single" ? "single" : "carousel",
        carouselIntervalMs: clampIntervalMs(row.carousel_interval_ms),
        singleSlideId: row.single_slide_id != null ? Number(row.single_slide_id) : null,
        customHeroEnabled: customOn,
      });
    })
    .catch(function (e) {
      if (e && e.code === "42P01") {
        return cb(null, defaultHeroSettings());
      }
      cb(e);
    });
}

/**
 * @param {(err: Error|null, pack?: { slides: object[], heroSettings: object }) => void} cb
 */
function listSlidesWithSettings(cb) {
  listSlides(function (e1, slides) {
    if (e1) return cb(e1);
    getHeroSettings(function (e2, heroSettings) {
      if (e2) return cb(e2);
      cb(null, { slides: slides || [], heroSettings: heroSettings || defaultHeroSettings() });
    });
  });
}

/**
 * @param {{ displayMode?: string, carouselIntervalMs?: number, carouselIntervalSeconds?: number, singleSlideId?: number|null }} patch
 * @param {(err: Error|null, settings?: object) => void} cb
 */
function saveHeroSettings(patch, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  getHeroSettings(function (e0, cur) {
    if (e0) return cb(e0);
    cur = cur || defaultHeroSettings();
    var displayMode = cur.displayMode;
    if (patch && patch.displayMode != null) {
      displayMode = String(patch.displayMode).toLowerCase() === "single" ? "single" : "carousel";
    }
    var carouselIntervalMs = cur.carouselIntervalMs;
    if (patch && patch.carouselIntervalMs != null) {
      carouselIntervalMs = clampIntervalMs(patch.carouselIntervalMs);
    } else if (patch && patch.carouselIntervalSeconds != null) {
      carouselIntervalMs = clampIntervalMs(Number(patch.carouselIntervalSeconds) * 1000);
    }
    var singleSlideId = cur.singleSlideId;
    if (patch && Object.prototype.hasOwnProperty.call(patch, "singleSlideId")) {
      var raw = patch.singleSlideId;
      if (raw == null || raw === "") {
        singleSlideId = null;
      } else {
        var n = Number(raw);
        singleSlideId = Number.isFinite(n) && n >= 1 ? Math.floor(n) : null;
      }
    }
    if (displayMode === "carousel") {
      singleSlideId = null;
    }

    var customHeroEnabled = patchCustomHeroEnabled(cur, patch);

    function upsert(finalSlideId) {
      pool
        .query(
          "INSERT INTO storefront_hero_settings (id, display_mode, carousel_interval_ms, single_slide_id, custom_hero_enabled) " +
            "VALUES (1, $1, $2, $3, $4) " +
            "ON CONFLICT (id) DO UPDATE SET " +
            "display_mode = EXCLUDED.display_mode, " +
            "carousel_interval_ms = EXCLUDED.carousel_interval_ms, " +
            "single_slide_id = EXCLUDED.single_slide_id, " +
            "custom_hero_enabled = EXCLUDED.custom_hero_enabled, " +
            "updated_at = now()",
          [displayMode, carouselIntervalMs, finalSlideId, customHeroEnabled]
        )
        .then(function () {
          getHeroSettings(cb);
        })
        .catch(cb);
    }

    if (displayMode === "single") {
      if (singleSlideId == null) {
        return cb(new Error("Pick a slide for fixed hero mode"));
      }
      return pool
        .query("SELECT id FROM storefront_hero_slides WHERE id = $1 LIMIT 1", [singleSlideId])
        .then(function (r) {
          if (!r.rows || !r.rows.length) {
            return cb(new Error("Slide not found"));
          }
          upsert(singleSlideId);
        })
        .catch(cb);
    }

    upsert(null);
  });
}

/**
 * @param {{ imagePath: string, animation?: string, sortOrder?: number }} opts
 * @param {(err: Error|null, row?: object) => void} cb
 */
function insertSlide(opts, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var img = String((opts && opts.imagePath) || "").trim();
  if (!img) {
    return process.nextTick(function () {
      cb(new Error("imagePath required"));
    });
  }
  if (img.length > 8192) {
    return process.nextTick(function () {
      cb(new Error("image path or URL is too long"));
    });
  }
  var anim = String((opts && opts.animation) || "orbit")
    .trim()
    .slice(0, 40);
  var ord = Math.max(0, Math.floor(Number((opts && opts.sortOrder) || 0)));
  pool
    .query(
      "INSERT INTO storefront_hero_slides (image_path, animation, sort_order) VALUES ($1, $2, $3) RETURNING id, image_path AS image, animation, sort_order AS \"sortOrder\"",
      [img, anim, ord]
    )
    .then(function (r) {
      cb(null, r.rows[0]);
    })
    .catch(cb);
}

function nextHeroSortStart(cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(null, 0);
    });
  }
  pool
    .query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM storefront_hero_slides")
    .then(function (r) {
      var n = Math.floor(Number((r.rows[0] && r.rows[0].n) || 0));
      cb(null, n);
    })
    .catch(cb);
}

/**
 * @param {string[]} urls
 * @param {string} animation
 * @param {(err: Error|null, rows?: object[]) => void} cb
 */
function insertSlidesFromUrls(urls, animation, cb) {
  var list = (urls || [])
    .map(function (u) {
      return String(u || "").trim();
    })
    .filter(Boolean);
  if (!list.length) {
    return process.nextTick(function () {
      cb(new Error("At least one image URL is required"));
    });
  }
  if (list.length > 25) {
    return process.nextTick(function () {
      cb(new Error("Maximum 25 URLs per request"));
    });
  }
  var anim = String(animation || "slide")
    .trim()
    .slice(0, 40);
  nextHeroSortStart(function (eSort, sort0) {
    if (eSort) return cb(eSort);
    var created = [];
    var order = sort0;
    var i = 0;
    function step() {
      if (i >= list.length) {
        return cb(null, created);
      }
      var u = list[i];
      i += 1;
      insertSlide({ imagePath: u, animation: anim, sortOrder: order }, function (insErr, row) {
        if (insErr) return cb(insErr);
        created.push(row);
        order += 1;
        step();
      });
    }
    step();
  });
}

function deleteSlide(id, cb) {
  var pool = poolMod.getPool();
  if (!pool) {
    return process.nextTick(function () {
      cb(new Error("Database not configured"));
    });
  }
  var nid = Number(id);
  if (!Number.isFinite(nid) || nid < 1) {
    return process.nextTick(function () {
      cb(new Error("Invalid id"));
    });
  }
  pool
    .query("DELETE FROM storefront_hero_slides WHERE id = $1 RETURNING id", [nid])
    .then(function (r) {
      if (!r.rowCount) {
        return cb(new Error("Not found"));
      }
      cb(null);
    })
    .catch(cb);
}

module.exports = {
  listSlides: listSlides,
  listSlidesWithSettings: listSlidesWithSettings,
  getHeroSettings: getHeroSettings,
  saveHeroSettings: saveHeroSettings,
  insertSlide: insertSlide,
  insertSlidesFromUrls: insertSlidesFromUrls,
  nextHeroSortStart: nextHeroSortStart,
  deleteSlide: deleteSlide,
};
