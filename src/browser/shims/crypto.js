import hash from '../../../vendor/hash.js?v=2c9b2e1b97170f03';
export function createHash(algorithm){
  if(algorithm!=='sha256')throw Error('Unsupported digest');
  const value=hash.sha256();return {update(input){value.update(input);return this;},digest(format){return value.digest(format);}};
}
export function randomUUID(){return globalThis.crypto.randomUUID();}
