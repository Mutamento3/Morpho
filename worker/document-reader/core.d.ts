export function allowedResource(raw: string): boolean;
export function validateShare(raw: string): string;
export function assemblePages(pages: Map<number,{top:number;height:number;text:string}>, bottom:boolean,height:number): {text:string;pages:number;complete:boolean};
