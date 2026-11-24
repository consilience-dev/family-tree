import {z} from 'zod';
import {id,member,within,fail} from './security.js';

const uuid=z.string().uuid();
const contributors=['owner','editor'];

export function registerArchiveConnections(app,db,base) {
 app.patch(base,async(req,res)=>{
  const {name}=z.object({name:z.string().trim().min(1).max(160)}).parse(req.body);
  await db.tx(async q=>{
   await member(q,req.params.family,req.user.id,contributors);
   await q('UPDATE families SET name=$2 WHERE id=$1',[req.params.family,name]);
  });
  res.json({ok:true});
 });
 app.get(base+'/people-options',async(req,res)=>{
  res.json((await db.q('SELECT id,name,birth_name FROM people WHERE family_id=$1 ORDER BY name,id',[req.params.family])).rows);
 });
 app.get(base+'/connections',async(req,res)=>{
  const rows=await db.q(`SELECT c.id, here.id AS person_id,here.name AS person_name,
      other.id AS other_person,other.name AS other_name,f.id AS other_family,f.name AS archive_name
    FROM archive_connections c
    JOIN people here ON here.family_id=$1 AND here.id IN(c.person_a,c.person_b)
    JOIN people other ON other.id IN(c.person_a,c.person_b) AND other.id<>here.id
    JOIN families f ON f.id=other.family_id
    JOIN memberships remote ON remote.family_id=f.id AND remote.account_id=$2
    JOIN memberships local ON local.family_id=here.family_id AND local.account_id=$2
    WHERE c.family_a=$1 OR c.family_b=$1 ORDER BY f.name,here.name`,[req.params.family,req.user.id]);
  res.json(rows.rows);
 });
 app.post(base+'/connections',async(req,res)=>{
  const input=z.union([
   z.object({person_id:uuid,other_family:uuid,other_person:uuid}).strict(),
   z.object({person_id:uuid,other_family:uuid,create_profile:z.literal(true)}).strict()
  ]).parse(req.body);
  const {person_id,other_family}=input,family=req.params.family;
  if(family===other_family)fail(400,'Choose a different archive.');
  const connection=await db.tx(async q=>{
   const families=[family,other_family].sort();
   for(const f of families)await member(q,f,req.user.id,contributors);
   // Serialize confirmations, including retries made from the other archive.
   await q('SELECT pg_advisory_xact_lock(hashtext($1))',[families.join('/')]);
   const person=await within(q,'people',family,person_id,true);
   const otherId=input.other_person||id();
   const pair=family===families[0]?[family,person_id,other_family,otherId]:[other_family,otherId,family,person_id];
   const existing=(await q(`SELECT id,person_a,person_b FROM archive_connections WHERE family_a=$1 AND family_b=$3
    AND (person_a=$2 OR person_b=$4)`,pair)).rows[0];
   if(existing){
    if(input.create_profile||(existing.person_a===pair[1]&&existing.person_b===pair[3]))return existing.id;
    fail(409,'One profile already has a different connection in this archive.');
   }
   if(input.create_profile){
    await q('INSERT INTO people(id,family_id,name) VALUES($1,$2,$3)',[otherId,other_family,person.name]);
   }else{
    const other=await within(q,'people',other_family,otherId,true);
    if(person.linked_account_id && other.linked_account_id && person.linked_account_id!==other.linked_account_id)
     fail(409,'These profiles are claimed by different people.');
   }
   const key=id();
   await q('INSERT INTO archive_connections(id,family_a,person_a,family_b,person_b,confirmed_by) VALUES($1,$2,$3,$4,$5,$6)',[key,...pair,req.user.id]);
   return key;
  });
  res.json({id:connection});
 });
 app.delete(base+'/connections/:connection',async(req,res)=>{
  await db.tx(async q=>{
   await member(q,req.params.family,req.user.id,contributors);
   const row=(await q('SELECT * FROM archive_connections WHERE id=$1 AND (family_a=$2 OR family_b=$2) FOR UPDATE',[uuid.parse(req.params.connection),req.params.family])).rows[0];
   if(!row)fail(404,'Connection unavailable.');
   await member(q,row.family_a===req.params.family?row.family_b:row.family_a,req.user.id,contributors);
   await q('DELETE FROM archive_connections WHERE id=$1',[row.id]);
  });
  res.json({ok:true});
 });
}
