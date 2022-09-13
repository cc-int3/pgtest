
import knex from 'knex';
import config from './knexfile';

import { createCipheriv, randomBytes } from 'crypto';
import { accessSync, constants as fsConstants, createWriteStream, readFile, unlink, promises} from 'fs';
import { Transform, Writable } from 'stream';
import { createGzip } from 'zlib';
import { backupTable } from './const';

let exit_after_db = false;

const CIPHER = 'aes-256-ctr';
const DBG_CLEAR  = false;

interface ArchiveHeader {
    /**
     * Archive file format specifier.
     */
    archiveVersion: 1;
    /**
     * Version of the database (ie. migration level).
     */
    dbVersion: string;
    /**
     * Infrastructure version.
     */
    version: string;
    /**
     * Date of archive creation.
     */
    date: string;
    /**
     * Database encryption password.
     */
    secret: string;
}
export const KnexDB = knex(config.development);

/**
 * Get the secret key.
 */
export function getEncKey(): Buffer {

    return Buffer.alloc(32).fill('1234567890123456789012');
    //if (key.length !== 32) {
}

function getVersion(): Promise<string> {

    return promises.readFile('../package.json')
        .then((pkg) => JSON.parse(pkg.toString()).version)
        .catch((err) => {
            console.log('could not read package.json');
        });
}

export interface DumpArgs {
    /**
     * Directory where archive should be written.
     *
     * The directory must exist.
     */
    path: string;
    /**
     * The set of optional tables to include in the archive.
     */
    with: ('audit' | 'oauth' | 'timings')[];
}

class JsonTransform extends Transform {

    records = 0;

    constructor() {
        super({
            objectMode: true,
            transform: (chunk, encoding, cb) => {
                //console.log('transform');
                this.records++;
                cb(null, `\n${JSON.stringify(chunk)}`);
            }
        });
    }
}

export function dump() {

    const today = new Date();
    const headers: ArchiveHeader = {
        archiveVersion: 1,
        // version and dbVersion will be populated later
        dbVersion: '',
        version: '',
        date: today.toISOString(),
        secret: getEncKey().toString('base64')
    };
    const tables = ['backup'];
    const filename = 'dbackup.gz'

    const key = randomBytes(32);
    const iv = randomBytes(16);
    const compress = createGzip();
    const encrypt = createCipheriv(CIPHER, key, iv);
    const file = createWriteStream(filename);
    //console.log( compress, encrypt );
    let head: Writable;

    return new Promise<void>((resolve, reject) => {

        const errHandler = (stream, err) => {
            console.log( err );
            compress.close();
            file.close();
            encrypt.end();
            promises.unlink(filename)
            .catch((uerr) => console.log(uerr))
            .then(() => reject(console.log(` ${err} error in ${stream} while writing archive`)));
        };

        const flushComplete = new Promise<void>((res) => {
            encrypt.on('end', () => file.close());
            file.on('close', () => res());
        });

        compress.on('error', (err) => errHandler('compress', err));
        encrypt.on('error', (err) => errHandler('encrypt', err));
        file.on('error', (err) => errHandler('file', err));

        if (DBG_CLEAR) {
            head = file;
        } else {
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
                        const transformComplete = new Promise<void>((res, rej) => {
                            transform.once('end', () => {
                                transform.unpipe(head);
                                res();
                            });
                            transform.once('error', (err) => rej);
                        });

                        return KnexDB(backupTable)
                            .select('*')
                            .from(table)
                            .stream((stream) => {
                                console.log('stream! ' + stream);
                                stream.on('close', () =>{console.log(process.memoryUsage());transform.end()});
                                stream.pipe(transform).pipe(head, { end: false });
                            })
                            //.then( () => keypress() )
                            .then(() => transformComplete)
                            .catch((err)=>{
                                console.log('failed seltect');
                            })
                    })
                    .then(() => {
                        console.log(`\t${transform.records} rows written`);
                        return nextTable();
                    });
            }
        };

        // write the encrypted headers and then begin processing the tables
        const p = Promise.all([getVersion(), KnexDB.migrate.currentVersion()])
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
        if( !exit_after_db){
            process.exit(0);
        }
    });
}

const keypress = async () => {
    console.log( 'press any key');
    process.stdin.setRawMode(true)
    return new Promise( (resolve ) => process.stdin.once('data', () => {
        process.stdin.setRawMode(false);
        resolve(1);
    }));
  }


function pwrite(stream: Writable, chunk: string | Buffer): Promise<void> {

    //console.log('pwrite ' + chunk);
    return new Promise<void>((resolve, reject) => {
        const doWrite = () => stream.write(chunk, (err) => err ? reject(err) : resolve());
        if (!doWrite()) {
            stream.once('writable', () => doWrite());
        }
    });
}

async function fillDb(){
    exit_after_db = true;
    for ( let i = 0;i < 1024 * 1024; ++i){
        await KnexDB(backupTable)
            .insert({data: Buffer.alloc(1024).fill(randomBytes(1024))});
    }
    process.exit(0);
}

//fillDb();
dump();