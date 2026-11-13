import type { LocaleModule } from './types';

/**
 * Vietnamese — translation of the English source. Numeric / currency / date
 * tokens are reused verbatim from English because every locale renders on top
 * of the English screenshots (the US-dollar amounts and English dates are
 * baked into the pixels).
 */
const vi: LocaleModule = {
  meta: { code: 'vi', flag: '🇻🇳', label: 'Tiếng Việt' },

  phone: {
    s1:  { h: 'Mỗi Dòng,\nLà Giờ.', hl: 'Là Giờ.', sh: 'Sổ chi tiêu nói bằng tiền và thời gian', she: '⏳', price: '$10.10', time: '23m', timeSub: 'làm việc' },
    s2:  { h: 'Tiền Của Bạn.\nMột Nơi.', hl: 'Một Nơi.', sh: 'Tài sản, tiết kiệm, tín dụng — trong tầm mắt', she: '💚', netWorth: '$55,931', netWorthLabel: 'Tài Sản', checking: 'Tài Khoản Ngày', checkingSub: 'Hằng ngày', checkingValue: '$31,079', savings: 'Tiết Kiệm Lãi Cao', savingsSub: 'Mục tiêu', savingsValue: '$15,004' },
    s3:  { h: 'Xem Mỗi Ngày\nTrong Nháy Mắt', hl: 'Trong Nháy Mắt', sh: 'Lịch trực quan cho chi tiêu của bạn', she: '🗓️', date: 'MAY 20', dateLabel: 'MAY', dateNumber: '20', transactions: 'Chi hôm nay', amount: '$76.55', food: 'Ăn uống', shopping: 'Mua sắm', transport: 'Đi lại' },
    s4:  { h: 'Tiền Của Bạn\nĐi Về Đâu?', hl: 'Đi Về Đâu?', sh: 'Biểu đồ đẹp phân tích tất cả', she: '🥧', home: 'Nhà ở  59%', travel: 'Ăn uống  22%', food: 'Đi lại  9%', total: 'Tổng Chi', totalValue: '$2,899.22' },
    s5:  { h: 'Mỗi Đồng Tiền\nLà Thời Gian', hl: 'Là Thời Gian', sh: 'Xem chính xác bạn làm bao lâu cho nó', she: '⏰', time: '112h 24m', timeLabel: 'tháng này', money: '$2,899.22' },
    s6:  { h: 'Bạn Tiết Kiệm\nBao Nhiêu?', hl: 'Bao Nhiêu?', sh: 'Theo dõi mỗi tháng. Tạo thói quen', she: '📊', healthy: '20%+ là tốt', income: 'Thu nhập', expense: 'Chi tiêu', saved: 'Tiết kiệm' },
    s7:  { h: 'Ghi Chi Tiêu\nTrong Giây Lát', hl: 'Trong Giây Lát', sh: 'Nhập nhanh ngay từ màn hình chính', she: '⚡', saved: 'Đã lưu!', quick: 'Thêm nhanh', mood: '~15m làm việc' },
    s8:  { h: 'Chia\nHóa Đơn', hl: 'Hóa Đơn', sh: 'Chia tiền, tâm trạng, ghi chú — tùy bạn', she: '✍️', splitBill: 'Chia tiền', mood: 'Tâm trạng', note: 'Ghi chú' },
    s9:  { h: 'Bạn Kiếm Được\nBao Nhiêu?', hl: 'Bao Nhiêu?', sh: 'Lương giờ theo tháng, luôn cập nhật', she: '💡', rate: '$25.79', perHour: 'mỗi giờ', revealed: 'Mức mới nhất', current: 'May 2026 — hiện tại' },
    s10: { h: 'Đăng Ký\nTrong Tầm Tay', hl: 'Trong Tầm Tay', sh: 'Thuê nhà, hội phí, hóa đơn định kỳ', she: '🔁', total: '$1,556.99 / tháng', rent: 'Tiền Thuê Nhà', gym: 'Hội Phí Gym', streaming: 'Gói Streaming' },
    s11: { h: 'Theo Ý\nBạn', hl: 'Bạn', sh: 'Tùy chỉnh mọi góc của ứng dụng', she: '⚙️', display: 'Hiển thị', hourly: 'Giá trị giờ', categories: 'Danh mục' },
    s12: { h: 'Chọn Phong\nCách', hl: 'Cách', sh: 'Ngôn ngữ, tiền tệ và giao diện — tùy bạn', she: '🎨', language: 'Tiếng Việt (vi)', currency: 'USD ($)', theme: 'Sáng · Xô thơm' },
    s13: { h: 'Nhập Liệu\nMột Chạm', hl: 'Một Chạm', sh: 'AI đọc sao kê. Bạn xác nhận', she: '🤖', aiPowered: 'Dùng AI', oneTap: 'Sao Chép', pasteJSON: 'Dán JSON' },
    s14: { h: 'Gõ.\nChạm. Xong.', hl: 'Xong.', sh: 'Bàn phím là cách nhanh nhất', she: '⌨️', type: 'Cà phê 6.50', tap: '↵', done: '0m để ghi', category: 'Tự động · Ăn uống / Cà phê' },
    s15: {
      h: 'Dữ liệu của bạn\nlà của bạn.', hl: 'là của bạn.',
      privacy: 'Riêng tư từ thiết kế', privacySub: 'Lưu trên điện thoại của bạn. Đồng bộ là tùy chọn.',
      noAds: 'Không quảng cáo', noAdsSub: 'Không phiền nhiễu. Chỉ có tài chính của bạn.',
      local: 'Ưu tiên cục bộ', localSub: 'Dùng được ngoại tuyến. Không cần tài khoản.',
      users: '70.000+ người dùng',
      inspiredPre: 'Lấy cảm hứng từ',
      bookSub: 'Tiền là năng lượng sống mà bạn đánh đổi',
      bookDesc: 'Cuốn cẩm nang tài chính cá nhân kinh điển. Trí tuệ thiết thực về tiền bạc, thời gian và cuộc sống.',
    },
    s16: { h: 'Đặt Ngân Sách.\nGiữ Đúng Hướng.', hl: 'Giữ Đúng Hướng.', sh: 'Mọi danh mục, luôn trong tầm mắt', she: '🎯', ring: '80%', left: 'còn $730.85', budgeted: 'Chi trong ngân sách', unbudgeted: 'Chi ngoài ngân sách' },
  },

  feature: {
    titleA: 'Mỗi đồng bạn tiêu',
    titleB: { pre: 'là ', hl: 'giờ', post: ' cuộc đời bạn.' },
    sub: 'Xem lương giờ thật của bạn',
  },

  landing: {
    titleA: 'Ly cà phê $5 vừa lấy mất',
    titleB: '12 phút cuộc đời.',
    subtitle: 'Xem giá thật bằng thời gian của mỗi lần mua.',
  },
};

export default vi;
