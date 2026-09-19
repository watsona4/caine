"use strict";

function timestamp() {
  return new Date().toISOString();
}

function log(...args) {
  console.log(`[${timestamp()}]`, ...args);
}

module.exports = { log };
