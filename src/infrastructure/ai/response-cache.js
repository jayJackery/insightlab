import {readFile,writeFile,mkdir} from '../../browser/shims/fs.js?v=2c9b2e1b97170f03';
import {join} from '../../browser/shims/path.js?v=2c9b2e1b97170f03';
import {createHash} from '../../browser/shims/crypto.js?v=2c9b2e1b97170f03';
export const requestDigest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Same task, credentials scope, model, complete prompt, options and build only.
// Values stay backend-side in data; no credentials or prompts are written in metadata.
export function createResponseCache(directory){return {
 async read(key){if(!directory)return null;try{const raw=await readFile(join(directory,key+'.json'),'utf8');if(raw.length>5000000)return null;const entry=JSON.parse(raw);if(entry.key!==key||Date.now()-entry.savedAt>7*86400000||Date.now()<entry.savedAt||requestDigest(entry.value)!==entry.valueHash)return null;return entry.value;}catch{return null;}},
 async write(key,value){if(!directory)return;const raw=JSON.stringify({key,savedAt:Date.now(),valueHash:requestDigest(value),value});if(raw.length>5000000)return;try{await mkdir(directory,{recursive:true});await writeFile(join(directory,key+'.json'),raw,{flag:'w'});}catch{}},
};}
