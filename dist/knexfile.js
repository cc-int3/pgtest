"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    development: {
        client: 'pg',
        connection: {
            host: '127.0.0.1',
            user: 'postgres',
            password: 'postgres',
            database: 'backup',
            charset: 'utf8'
        },
        migrations: {
            directory: __dirname + '/data/migrations',
        },
        seeds: {
            directory: __dirname + '/data/seeds'
        }
    }
};
//# sourceMappingURL=knexfile.js.map