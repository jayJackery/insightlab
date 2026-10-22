export class Buffer extends Uint8Array {
  static from(value){return new Buffer(typeof value==='string'?new TextEncoder().encode(value):value);}
  static alloc(size){return new Buffer(size);}
  static concat(parts){const result=Buffer.alloc(parts.reduce((n,part)=>n+part.length,0));let offset=0;for(const part of parts){result.set(part,offset);offset+=part.length;}return result;}
  writeUInt32LE(value,offset){new DataView(this.buffer,this.byteOffset,this.byteLength).setUint32(offset,value,true);}
  writeUInt16LE(value,offset){new DataView(this.buffer,this.byteOffset,this.byteLength).setUint16(offset,value,true);}
}
