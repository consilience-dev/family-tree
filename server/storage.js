import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand} from '@aws-sdk/client-s3';
import {mkdir,writeFile,readFile,unlink} from 'node:fs/promises';
import {join} from 'node:path';
const root=process.env.RECORDING_DIR||'.data/recordings';
const bucket=process.env.S3_BUCKET;
const client=bucket?new S3Client({region:process.env.S3_REGION||'us-east-1',...(process.env.S3_ENDPOINT?{endpoint:process.env.S3_ENDPOINT,forcePathStyle:true}:{})}):null;
export async function put(key,data,mime){if(client)await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:data,ContentType:mime,ServerSideEncryption:'AES256'}));else {await mkdir(join(root,key.split('/')[0]),{recursive:true});await writeFile(join(root,key),data,{mode:0o600});}}
export async function get(key){if(client)return Buffer.from(await (await client.send(new GetObjectCommand({Bucket:bucket,Key:key}))).Body.transformToByteArray());return readFile(join(root,key));}
export async function remove(key){if(client)await client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}));else await unlink(join(root,key)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
