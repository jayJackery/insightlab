import {readVirtualFile,saveVirtualFile,removeVirtualFile} from '../storage.js?v=8e1e00bb1d41da9f';
export async function readFile(path){return readVirtualFile(path);}
export async function writeFile(path,value,options){saveVirtualFile(path,value,options);}
export async function mkdir(){}
export async function access(path){readVirtualFile(path);}
export async function rename(from,to){saveVirtualFile(to,readVirtualFile(from));removeVirtualFile(from);}
