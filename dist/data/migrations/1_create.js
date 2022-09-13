"use strict";
//
// From ``cloud-proxy/dist/`` run
// npx knex --esm migrate:latest
Object.defineProperty(exports, "__esModule", { value: true });
const const_1 = require("../../const");
exports.up = function (knex) {
    return knex.schema
        .dropTableIfExists(const_1.backupTable)
        .createTable(const_1.backupTable, (tble) => {
        tble.increments('id');
        tble.binary('data');
    });
};
exports.down = function (knex) {
    return knex.schema
        .dropTableIfExists(const_1.backupTable);
};
//# sourceMappingURL=1_create.js.map