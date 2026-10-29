/** Shared only in this running app. Never persisted or placed in an export/backup. */
let current: { token: string; source: string; at: number } | undefined;
export function rememberCloudflareToken(token: string, source: string) {
 current = token.trim() ? {token:token.trim(),source,at:Date.now()} : undefined;
}
export function getSharedCloudflareToken() {
 if (current && Date.now()-current.at>30*60*1000) current=undefined;
 return current ? {...current} : undefined;
}
export function forgetCloudflareToken(){ current=undefined; }
