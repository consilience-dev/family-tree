import {scryptSync,randomBytes,createHash,timingSafeEqual,randomUUID} from 'node:crypto';
export const id=()=>randomUUID();
export const token=()=>randomBytes(32).toString('base64url');
export const hash=s=>createHash('sha256').update(s).digest('hex');
export function password(s){const salt=randomBytes(16).toString('hex');return salt+':'+scryptSync(s,salt,64).toString('hex');}
export function verify(s,stored){try{const [salt,p]=stored.split(':');return timingSafeEqual(Buffer.from(p,'hex'),scryptSync(s,salt,64));}catch{return false;}}
export function fail(status,message){const e=new Error(message);e.status=status;throw e;}
export async function member(q,family,user,roles=['owner','editor','viewer']){const r=(await q('SELECT role FROM memberships WHERE family_id=$1 AND account_id=$2',[family,user])).rows[0];if(!r||!roles.includes(r.role))fail(403,'This family is private, or your role does not allow this action.');return r.role;}
export async function within(q,table,family,key,lock=false){const r=(await q(`SELECT * FROM ${table} WHERE family_id=$1 AND id=$2${lock?' FOR UPDATE':''}`,[family,key])).rows[0];if(!r)fail(404,'Record not found in this family.');return r;}
