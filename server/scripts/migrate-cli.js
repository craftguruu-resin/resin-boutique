"use strict";

require("dotenv").config();
var migrate = require("../db/migrate.js").migrate;

migrate(function (err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log("Database schema ready.");
  process.exit(0);
});
