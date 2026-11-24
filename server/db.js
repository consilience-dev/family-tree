import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {createHash} from 'node:crypto';
import {readFile,mkdir,readdir} from 'node:fs/promises';
export async function database({url=process.env.DATABASE_URL,path=process.env.DATA_DIR||'.data/postgres'}={}){
  if(!url && path!==':memory:') await mkdir(path,{recursive:true});
  const engine=url?new pg.Pool({connectionString:url,max:8}):new PGlite(path===':memory:'?undefined:path);
  let tail=Promise.resolve();
  const lock=async fn=>{let release;const prior=tail;tail=new Promise(r=>release=r);await prior;try{return await fn();}finally{release();}};
  const tx=fn=>lock(async()=>{const c=url?await engine.connect():engine;try{await c.query('BEGIN');const query=(s,p=[])=>c.query(s,p);query.exec=s=>url?c.query(s):c.exec(s);const result=await fn(query);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{if(url)c.release();}});
  await lock(()=>engine.query('SELECT 1'));
  await lock(()=>engine.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz DEFAULT now())'));
  const directory=new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(directory)).filter(f=>f.endsWith('.sql')).sort()){
    const sql=await readFile(new URL(file,directory),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
    await tx(async q=>{
      // Serializes migrations across separate PostgreSQL web/worker processes.
      await q("SELECT pg_advisory_xact_lock(71298340)");
      const previous=(await q('SELECT checksum FROM schema_migrations WHERE name=$1',[file])).rows[0];
      if(previous){if(previous.checksum!==checksum)throw new Error(`Migration ${file} has changed after application; add a new migration instead.`);return;}
      await q.exec(sql);await q('INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)',[file,checksum]);
    });
  }
  return {q:(sql,p=[])=>lock(()=>engine.query(sql,p)),tx,close:()=>engine.end?engine.end():engine.close()};
}
