import {database} from './db.js';
import {createApp} from './app.js';
import {seed} from './seed.js';
import {runJob} from './extraction.js';
import express from 'express';
import {resolve} from 'node:path';
const db=await database();
const demo=process.env.DEMO_MODE!=='false'&&process.env.NODE_ENV!=='production';
if(demo)await seed(db);
const app=createApp(db,{demo});
if(process.env.NODE_ENV==='production'||process.env.STATIC_CLIENT==='true'){app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile('index.html',{root:resolve('dist')}));}
else {const {createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
let working=false;
const timer=setInterval(async()=>{if(working)return;working=true;try{await runJob(db);}catch(e){console.error('Worker:',e.message);}finally{working=false;}},2000);
const port=Number(process.env.PORT||3000);
const server=app.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Family Tree is running at ${process.env.APP_ORIGIN||'http://localhost:'+port} (${demo?'demo enabled':'private mode'})`));
async function close(){clearInterval(timer);server.close();await db.close();process.exit(0);}
process.on('SIGINT',close);process.on('SIGTERM',close);
