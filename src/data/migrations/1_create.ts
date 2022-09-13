//
// From ``cloud-proxy/dist/`` run
// npx knex --esm migrate:latest

import {backupTable} from '../../const';

exports.up = function(knex:any) {
  return knex.schema
    .dropTableIfExists(backupTable)
    .createTable(backupTable, (tble:any) => {
        tble.increments('id');
        tble.binary('data');
    })
};

exports.down = function(knex: any) {
  return knex.schema
    .dropTableIfExists(backupTable)
};
