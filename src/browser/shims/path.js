export const join=(...parts)=>parts.join('/').replace(/\/+/g,'/');
export const dirname=value=>value.slice(0,value.lastIndexOf('/'))||'.';
