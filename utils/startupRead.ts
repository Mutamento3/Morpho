/** Only retry reads: a timed-out write must never be replayed here. */
export async function startupRead<T>(read: () => Promise<T>, timeoutMs = 15000): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                Promise.resolve().then(read),
                new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('本地数据读取超时')), timeoutMs); }),
            ]);
        } catch (error) {
            lastError = error;
        } finally {
            clearTimeout(timer);
        }
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw lastError;
}
