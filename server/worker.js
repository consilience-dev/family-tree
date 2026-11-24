import {database} from './db.js';
import {runJob} from './extraction.js';
if(!process.env.DATABASE_URL)throw new Error('Separate workers require DATABASE_URL; embedded demo runs its worker inside the web server.');
const db=await database();
let stop=false;process.on('SIGTERM',()=>{stop=true;});
while(!stop){if(!await runJob(db))await new Promise(r=>setTimeout(r,2000));}
await db.close();
