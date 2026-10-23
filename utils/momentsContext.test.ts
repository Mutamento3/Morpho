import { describe, expect, it } from 'vitest';
import { selectMomentsRecentChat } from './momentsContext';

const now = 1800000000000;
const row = (timestamp: number, content = '下班去买一杯咖啡') => ({ role: 'user', type: 'text', content, timestamp });
describe('朋友圈当天聊天素材', () => {
    it('排除一天前、未来和无时间消息，不回填旧记录', () => {
        expect(selectMomentsRecentChat([row(now-86400000), row(now-86400001), row(now+1), row(NaN)], now)).toEqual([]);
        expect(selectMomentsRecentChat([row(now-86399999)], now)).toHaveLength(1);
    });
    it('跳过空白、标记、纯表情、简单应答与系统消息', () => {
        const rows = ['', '  ', '[[动作]]', '😊', '嗯嗯', '好的！', '收到'].map(text => row(now-1, text));
        rows.push({...row(now-1), role:'system'}, {...row(now-1), type:'image'});
        expect(selectMomentsRecentChat(rows,now)).toEqual([]);
    });
    it('按时间排序仅保留最新五条，不使用补发时刻之后的聊天', () => {
        const rows=Array.from({length:8},(_,i)=>row(now-i*1000));
        expect(selectMomentsRecentChat(rows,now)).toEqual(rows.slice(0,5).reverse());
        expect(selectMomentsRecentChat(rows,now,now-5000)).toEqual(rows.slice(5).reverse());
    });
    it('保留当日旅行小卡，但空正文和旧小卡不作为素材', () => {
        const card={...row(now-1,''),type:'travel_card',metadata:{travelCard:{body:'城墙下的风很大'}}};
        expect(selectMomentsRecentChat([card,{...card,timestamp:now-86400000}],now)).toEqual([card]);
    });
});
