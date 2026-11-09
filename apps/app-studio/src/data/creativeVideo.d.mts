export const SEARCH_VIDEO: { width:number;height:number;fps:number;duration:number };
export function validateVideoBytes(input?: { locale?:string;data?:string }): Buffer;
export function validateCreativeVideo(input: { locale:string;data:string }): Promise<{ bytes:Buffer;width:number;height:number;fps:number;duration:number }>;
export function renderSearchVideo(input: { locale:string;data:string;layers:Record<string,string> }): Promise<Buffer>;
