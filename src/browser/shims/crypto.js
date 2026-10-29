import hash from '../../../vendor/hash.js?v=e9968bcba1cb9548';
export function createHash(algorithm){
  if(algorithm!=='sha256')throw Error('Unsupported digest');
  const value=hash.sha256();return {update(input){value.update(input);return this;},digest(format){return value.digest(format);}};
}
export function randomUUID(){return globalThis.crypto.randomUUID();}
