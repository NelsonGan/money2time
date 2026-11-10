import type { LocaleModule } from './types';

/**
 * Thai — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const th: LocaleModule = {
  meta: { code: 'th', flag: '🇹🇭', label: 'ไทย' },

  phone: {
    s1:  { h: 'ทุกรายการ\nคือชั่วโมง', hl: 'คือชั่วโมง', sh: 'บัญชีของคุณบอกทั้งเงินและเวลา', she: '⏳', price: '$10.10', time: '23m', timeSub: 'ทำงาน' },
    s2:  { h: 'เงินทั้งหมด\nที่เดียวจบ', hl: 'ที่เดียวจบ', sh: 'มูลค่าสุทธิ เงินออม เครดิต ครบในจอเดียว', she: '💚', netWorth: '$55,931', netWorthLabel: 'มูลค่าสุทธิ', checking: 'บัญชีใช้จ่าย', checkingSub: 'ทุกวัน', checkingValue: '$31,079', savings: 'ออมดอกเบี้ยสูง', savingsSub: 'เป้าหมาย', savingsValue: '$15,004' },
    s3:  { h: 'เห็นทุกวัน\nในพริบตา', hl: 'ในพริบตา', sh: 'ปฏิทินภาพรวมการใช้จ่ายของคุณ', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'ใช้วันนี้', amount: '$76.55', food: 'อาหาร', shopping: 'ช้อปปิ้ง', transport: 'เดินทาง' },
    s4:  { h: 'เงินคุณ\nไปไหนหมด?', hl: 'ไปไหนหมด?', sh: 'กราฟสวยงามแยกให้เห็นทุกอย่าง', she: '🥧', home: 'บ้าน  59%', travel: 'อาหาร  22%', food: 'เดินทาง  9%', total: 'รายจ่ายรวม', totalValue: '$2,899.22' },
    s5:  { h: 'ทุกดอลลาร์\nคือเวลาคุณ', hl: 'คือเวลาคุณ', sh: 'ดูว่าคุณทำงานนานแค่ไหนเพื่อมัน', she: '⏰', time: '112h 24m', timeLabel: 'เดือนนี้', money: '$2,899.22' },
    s6:  { h: 'ออมได้\nกี่เปอร์เซ็นต์?', hl: 'กี่เปอร์เซ็นต์?', sh: 'วัดผลทุกเดือน สร้างนิสัยการออม', she: '📊', healthy: '20%+ ถือว่าดี', income: 'รายรับ', expense: 'รายจ่าย', saved: 'ออมได้' },
    s7:  { h: 'บันทึก\nในไม่กี่วินาที', hl: 'ในไม่กี่วินาที', sh: 'เพิ่มรายการเร็วจากหน้าหลัก', she: '⚡', saved: 'บันทึกแล้ว!', quick: 'เพิ่มด่วน', mood: '~15m ของงาน' },
    s8:  { h: 'หาร\nบิล', hl: 'บิล', sh: 'หารบิล อารมณ์ โน้ต คุณเลือกเอง', she: '✍️', splitBill: 'หารบิล', mood: 'อารมณ์', note: 'โน้ต' },
    s9:  { h: 'จริงๆ แล้ว\nคุณได้เท่าไหร่?', hl: 'คุณได้เท่าไหร่?', sh: 'อัตราต่อชั่วโมงรายเดือน อัปเดตเสมอ', she: '💡', rate: '$25.79', perHour: 'ต่อชั่วโมง', revealed: 'อัตราล่าสุด', current: 'May 2026 — ปัจจุบัน' },
    s10: { h: 'คุมค่าสมัคร\nสมาชิกได้', hl: 'สมาชิกได้', sh: 'ค่าเช่า สมาชิก บิลรายเดือน', she: '🔁', total: '$1,556.99 / เดือน', rent: 'ค่าเช่าห้อง', gym: 'สมาชิกยิม', streaming: 'แพ็กสตรีมมิ่ง' },
    s11: { h: 'ปรับแต่ง\nได้ดั่งใจ', hl: 'ได้ดั่งใจ', sh: 'ปรับแต่งทุกมุมของแอป', she: '⚙️', display: 'การแสดงผล', hourly: 'ค่าต่อชั่วโมง', categories: 'หมวดหมู่' },
    s12: { h: 'เลือกสไตล์\nของคุณ', hl: 'ของคุณ', sh: 'ภาษา สกุลเงิน และธีม ตามใจคุณ', she: '🎨', language: 'ไทย (th)', currency: 'USD ($)', theme: 'สว่าง · เซจ' },
    s13: { h: 'นำเข้าได้\nในแตะเดียว', hl: 'ในแตะเดียว', sh: 'AI อ่านสเตทเมนต์ คุณแค่ยืนยัน', she: '🤖', aiPowered: 'ขับเคลื่อนด้วย AI', oneTap: 'คัดลอกคำสั่ง', pasteJSON: 'วาง JSON' },
    s14: { h: 'พิมพ์ แตะ\nเสร็จ', hl: 'เสร็จ', sh: 'คีย์บอร์ดคือทางที่เร็วที่สุด', she: '⌨️', type: 'กาแฟ 6.50', tap: '↵', done: '0m ในการบันทึก', category: 'อัตโนมัติ · อาหาร / กาแฟ' },
    s16: { h: 'ตั้งงบ\nแล้วอยู่ในกรอบ', hl: 'แล้วอยู่ในกรอบ', sh: 'ทุกหมวด เห็นครบทุกอย่าง', she: '🎯', ring: '80%', left: 'เหลือ $730.85', budgeted: 'ใช้จ่ายในงบ', unbudgeted: 'ใช้จ่ายนอกงบ' },
  },

  feature: {
    titleA: 'ทุกดอลลาร์ที่คุณจ่าย',
    titleB: { pre: 'คือ ', hl: 'ชั่วโมง', post: ' ของชีวิตคุณ' },
    sub: 'ดูอัตราต่อชั่วโมงที่แท้จริงของคุณ',
  },

  landing: {
    titleA: 'กาแฟ $5 ของคุณ เพิ่งแลกไปกับ',
    titleB: '12 นาทีของชีวิต',
    subtitle: 'ดูราคาที่แท้จริงเป็นเวลาของทุกการใช้จ่าย',
  },
};

export default th;
