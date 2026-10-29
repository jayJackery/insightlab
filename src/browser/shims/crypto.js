import hash from '../../../vendor/hash.js?v=983914e21674fb3e';
export function createHash(algorithm){
  if(algorithm!=='sha256')throw Error('Unsupported digest');
  const value=hash.sha256();return {update(input){value.update(input);return this;},digest(format){return value.digest(format);}};
}
export function randomUUID(){return globalThis.crypto.randomUUID();}
