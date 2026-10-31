import React from 'react';

export default function HalloweenOpeningNotice({ onAccept }: { onAccept: () => void }) {
    return <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="absolute inset-0 bg-[#211922]/75 backdrop-blur-md" />
        <section role="dialog" aria-modal="true" aria-labelledby="halloween-title" className="relative flex flex-col w-full max-w-sm overflow-hidden rounded-[28px] border border-orange-200/70 bg-[#fffaf2] shadow-2xl" style={{ maxHeight: 'calc(100dvh - 48px)' }}>
            <div className="overflow-y-auto min-h-0">
                <img src={`${import.meta.env.BASE_URL}events/halloween-2026.png`} alt="一起扮成吸血鬼和小幽灵的万圣节合影" className="block w-full h-auto" />
                <div className="px-6 pt-4 pb-3 text-[#493629]">
                    <p className="text-[9px] font-bold tracking-[0.25em] text-orange-600">MORPHO · HALLOWEEN 2026</p>
                    <h2 id="halloween-title" className="mt-2 text-xl font-bold">小可爱鬼们，万圣节快乐 🎃</h2>
                    <p className="mt-2 text-xs leading-6 text-[#806c5c]">今晚，把日常交给月亮，把一点点心跳和冒险留给你们。</p>
                    <div className="mt-4 space-y-3">
                        <div className="rounded-2xl border border-orange-200/70 bg-white/70 p-3.5">
                            <h3 className="text-sm font-semibold">和他一起，去故事里探险</h3>
                            <p className="mt-1.5 text-xs leading-6">打开「见面剧情」，和 char 一起游玩「探险笔记」或「生化危机」预设。是结伴探索，还是在微恐与悬疑里牵紧彼此？今晚的故事，由你们来写。</p>
                        </div>
                        <div className="rounded-2xl border border-orange-200/70 bg-white/70 p-3.5">
                            <h3 className="text-sm font-semibold">换上万圣节限定头像框</h3>
                            <p className="mt-1.5 text-xs leading-6">南瓜黑猫、幽灵巫师帽已经来到「气泡工坊 → 头像框 / 挂件」。给自己和他挑一款，调好大小与位置，保存主题后穿戴吧。</p>
                        </div>
                    </div>
                    <p className="mt-4 text-center text-xs leading-6">这是你和 Morpho 中的他，一起度过的一个万圣节～<br /><span className="text-orange-600">嗯～ o(*￣▽￣*)o</span></p>
                </div>
            </div>
            <div className="shrink-0 px-6 pt-2 pb-5">
                <button onClick={onAccept} className="w-full rounded-2xl bg-[#49332b] py-3 text-sm font-bold text-[#fff5e5] shadow-sm active:scale-[0.98]">收下糖果，去找他 🎃</button>
                <p className="mt-2 text-center text-[10px] text-[#998375]">限定活动至 11 月 2 日 · 确认后不再弹出</p>
            </div>
        </section>
    </div>;
}
