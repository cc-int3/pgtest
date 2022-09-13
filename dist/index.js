"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dump = exports.getEncKey = exports.KnexDB = void 0;
const knex_1 = __importDefault(require("knex"));
const knexfile_1 = __importDefault(require("./knexfile"));
const crypto_1 = require("crypto");
const fs_1 = require("fs");
const stream_1 = require("stream");
const zlib_1 = require("zlib");
const const_1 = require("./const");
let exit_after_db = false;
const CIPHER = 'aes-256-ctr';
const DBG_CLEAR = false;
exports.KnexDB = (0, knex_1.default)(knexfile_1.default.development);
/**
 * Get the secret key.
 */
function getEncKey() {
    return Buffer.alloc(32).fill('1234567890123456789012');
    //if (key.length !== 32) {
}
exports.getEncKey = getEncKey;
function getVersion() {
    return fs_1.promises.readFile('../package.json')
        .then((pkg) => JSON.parse(pkg.toString()).version)
        .catch((err) => {
        console.log('could not read package.json');
    });
}
class JsonTransform extends stream_1.Transform {
    constructor() {
        super({
            objectMode: true,
            transform: (chunk, encoding, cb) => {
                //console.log('transform');
                this.records++;
                cb(null, `\n${JSON.stringify(chunk)}`);
            }
        });
        this.records = 0;
    }
}
function dump() {
    const today = new Date();
    const headers = {
        archiveVersion: 1,
        // version and dbVersion will be populated later
        dbVersion: '',
        version: '',
        date: today.toISOString(),
        secret: getEncKey().toString('base64')
    };
    const tables = ['backup'];
    const filename = 'dbackup.gz';
    const key = (0, crypto_1.randomBytes)(32);
    const iv = (0, crypto_1.randomBytes)(16);
    const compress = (0, zlib_1.createGzip)();
    const encrypt = (0, crypto_1.createCipheriv)(CIPHER, key, iv);
    const file = (0, fs_1.createWriteStream)(filename);
    //console.log( compress, encrypt );
    let head;
    return new Promise((resolve, reject) => {
        const errHandler = (stream, err) => {
            console.log(err);
            compress.close();
            file.close();
            encrypt.end();
            fs_1.promises.unlink(filename)
                .catch((uerr) => console.log(uerr))
                .then(() => reject(console.log(` ${err} error in ${stream} while writing archive`)));
        };
        const flushComplete = new Promise((res) => {
            encrypt.on('end', () => file.close());
            file.on('close', () => res());
        });
        compress.on('error', (err) => errHandler('compress', err));
        encrypt.on('error', (err) => errHandler('encrypt', err));
        file.on('error', (err) => errHandler('file', err));
        if (DBG_CLEAR) {
            head = file;
        }
        else {
            head = compress;
            compress
                .pipe(encrypt, { end: true })
                //head = encrypt;
                //encrypt
                .pipe(file, { end: true });
        }
        let table_i = 0;
        const nextTable = () => {
            if (table_i < tables.length) {
                const table = tables[table_i++];
                console.log(`Backing up ${table}...`);
                const transform = new JsonTransform();
                // write table header
                return pwrite(head, `\n!${table}`)
                    .then(() => {
                    const transformComplete = new Promise((res, rej) => {
                        transform.once('end', () => {
                            transform.unpipe(head);
                            res();
                        });
                        transform.once('error', (err) => rej);
                    });
                    return (0, exports.KnexDB)(const_1.backupTable)
                        .select('*')
                        .from(table)
                        .stream((stream) => {
                        console.log('stream! ' + stream);
                        stream.on('close', () => { console.log(process.memoryUsage()); transform.end(); });
                        stream.pipe(transform).pipe(head, { end: false });
                    })
                        //.then( () => keypress() )
                        .then(() => transformComplete)
                        .catch((err) => {
                        console.log('failed seltect');
                    });
                })
                    .then(() => {
                    console.log(`\t${transform.records} rows written`);
                    return nextTable();
                });
            }
        };
        // write the encrypted headers and then begin processing the tables
        const p = Promise.all([getVersion(), exports.KnexDB.migrate.currentVersion()])
            .then(([ver, dbVer]) => {
            headers.version = ver;
            headers.dbVersion = dbVer;
            return pwrite(head, `!!headers\n${JSON.stringify(headers)}`);
        })
            // start processing tables
            .then(() => nextTable())
            // flush everything down the pipes
            .then(() => head.end())
            // wait for the flush to complete
            .then(() => flushComplete);
        resolve(p);
    })
        .then(() => {
        console.log('\nDone!\n');
        console.log(`Archive   : ${filename}`);
        console.log(`Password  : "${Buffer.concat([key, iv]).toString('base64')}"`);
        console.log('Important : be sure to store this password securely as it is the only way to access the archive. Never transmit this password by email or other unsecure means.');
        if (!exit_after_db) {
            process.exit(0);
        }
    });
}
exports.dump = dump;
const keypress = async () => {
    console.log('press any key');
    process.stdin.setRawMode(true);
    return new Promise((resolve) => process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        resolve(1);
    }));
};
function pwrite(stream, chunk) {
    //console.log('pwrite ' + chunk);
    return new Promise((resolve, reject) => {
        const doWrite = () => stream.write(chunk, (err) => err ? reject(err) : resolve());
        if (!doWrite()) {
            stream.once('writable', () => doWrite());
        }
    });
}
async function fillDb() {
    exit_after_db = true;
    for (let i = 0; i < 1024 * 1024; ++i) {
        await (0, exports.KnexDB)(const_1.backupTable)
            .insert({ data: Buffer.alloc(1024).fill((0, crypto_1.randomBytes)(1024)) });
    }
    process.exit(0);
}
//fillDb();
dump();
//# sourceMappingURL=index.js.map