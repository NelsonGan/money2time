import { DEFAULT_CATEGORY_EMOJIS } from '~/constants/appDefaults';

// Patterns are tried in order; first match wins.
// Every emoji here MUST also exist in DEFAULT_CATEGORY_EMOJIS so that the
// suggestion is always selectable in the picker.
const CATEGORY_EMOJI_PATTERNS: { emoji: string; pattern: RegExp }[] = [
  {
    emoji: '🏠',
    pattern:
      /(housing|rent|mortgage|apartment|accomm?odation|lodging|household|home\b|residence|dwelling|condo|hoa|property\s*tax|hotel|airbnb|resort|motel|hostel|inn\b|bnb|lodge|furniture|chair|desk|sofa|couch|table|ikea|home.?decor|decor|shelf|cabinet|bed|mattress|bedding|pillow|blanket|comforter|duvet|garden(ing)?|plant|flower|landscape|lawn|mowing|fertilizer|soil|mulch|houseplant|succulent|terrarium|repair|maintenance|fix\b|handyman|plumber|electrician|mechanic|bath|shower|toiletry|sauna|hot.?tub|onsen|water\b|drinking|bottled.?water|mineral.?water|sparkling.?water|trash|garbage|waste|recycling|dump.?fee|住房|租金|房租|住宿|公寓|房屋|家|物业|酒店|旅馆|旅店|民宿|宾馆|家具|沙发|桌椅|家居|装饰|柜子|床|床垫|枕头|被子|花园|植物|花卉|园艺|草坪|肥料|盆栽|维修|保养|工具|沐浴|洗漱|桑拿|温泉|水|矿泉水|垃圾|环卫|垃圾费|污水)/i,
  },
  {
    emoji: '✈️',
    pattern:
      /(flight|airline|airfare|airplane|aviation|airport|jet\b|boarding|baggage|luggage\s*fee|机票|航班|飞机|航空|登机|行李)/i,
  },
  {
    emoji: '🧳',
    pattern:
      /(travel|trip|vacation|holiday|tour\b|getaway|excursion|cruise|itinerary|journey|sight.?seeing|旅行|旅游|假期|度假|出行|行程|游玩)/i,
  },
  {
    emoji: '🚗',
    pattern:
      /(car\b|auto(mobile|motive)?|vehicle|parking|garage|drive|driving|sedan|suv|registration|toll|carwash|car\s*wash|dmv|taxi|uber|lyft|cab\b|rideshare|ride.?hail|grab\b|didi|ola\b|transport(ation)?|transit|bus\b|train\b|subway|metro|commute|tram\b|ferry|monorail|\bbike\b|bicycle|\bcycling\b|cyclist|e.?bike|scooter|moped|petrol|gasoline|diesel|fuel|gas\b|lpg|propane|moving|relocation|movers|storage|packing|u.?haul|汽车|停车|车辆|车检|过路费|高速费|车险|洗车|出租|打车|网约车|滴滴|公交|地铁|交通|通勤|火车|巴士|公车|轨道|渡轮|高铁|自行车|单车|滑板车|电动车|摩托|燃油|汽油|柴油|加油|燃料|搬家|搬迁|仓储|搬运)/i,
  },
  {
    emoji: '🛒',
    pattern:
      /(grocer(y|ies)|supermarket|market\b|costco|walmart|target\b|kroger|aldi|safeway|trader\s*joe|whole\s*foods|produce|fruit|apple|banana|orange|berry|grape|melon|spice|seasoning|condiment|salt|pepper|sugar|oil\b|vinegar|sauce|超市|杂货|生鲜|菜市场|食材|超商|水果|苹果|香蕉|橙子|葡萄|蔬果|调料|香料|盐|胡椒|油|醋|糖)/i,
  },
  {
    emoji: '🍕',
    pattern: /(pizza|domino|papa\s*john|pizza\s*hut|披萨|比萨)/i,
  },
  {
    emoji: '☕',
    pattern:
      /(coffee|cafe|caf[eé]|starbucks|tea\b|latte|espresso|cappuccino|mocha|americano|boba|bubble.?tea|milk.?tea|matcha|咖啡|茶|奶茶|拿铁|美式|抹茶|珍珠)/i,
  },
  {
    emoji: '🍺',
    pattern:
      /(beer|alcohol|bar\b|pub|brewery|liquor|booze|ale\b|lager|ipa|draft|draught|wine|vineyard|sommelier|champagne|prosecco|cabernet|merlot|whisk(e)?y|whiskey|bourbon|cognac|sake|drink|beverage|soda|juice|smoothie|lemonade|energy.?drink|cola|coke\b|pepsi|啤酒|酒吧|酒水|精酿|葡萄酒|红酒|白酒|香槟|威士忌|清酒|饮料|果汁|汽水|可乐|饮品)/i,
  },
  {
    emoji: '🍔',
    pattern:
      /(food|dining|restaurant|lunch|dinner|breakfast|brunch|meal|eat(ing|out)?|takeaway|takeout|delivery|burger|fast.?food|mcdonald|kfc|sushi|sashimi|nigiri|japanese.*food|japanese.*restaurant|ramen|udon|izakaya|mexican|taco|burrito|quesadilla|nachos|taqueria|italian|pasta|lasagna|risotto|gnocchi|spaghetti|salad|veg(an|etable|gie)|healthy.*food|plant.?based|meat|butcher|steak|bbq|barbeque|barbecue|pork|lamb|beef|grill\b|fish(ing)?|seafood|salmon|tuna|fishmonger|chicken|poultry|turkey|duck\b|egg\b|eggs|diner|cafeteria|canteen|food.?court|cake|dessert|sweet|candy|chocolate|cookie|biscuit|brownie|pudding|cupcake|ice.?cream|gelato|sorbet|sherbet|frozen.?yog(h)?urt|bread|bakery|pastry|croissant|bagel|donut|doughnut|bun\b|cooking|kitchen|cookware|meal.?kit|recipe|hello.?fresh|blue.?apron|餐饮|餐食|饭|外卖|就餐|汉堡|快餐|饭店|寿司|刺身|日料|拉面|乌冬|日本料理|居酒屋|玉米卷|墨西哥|意大利|意面|千层面|沙拉|蔬菜|素食|健康餐|肉|烧烤|牛排|猪肉|羊肉|牛肉|海鲜|鱼|三文鱼|金枪鱼|海产|鸡|火鸡|鸭|蛋|食堂|餐厅|美食广场|蛋糕|甜品|糖果|巧克力|饼干|布丁|甜点|冰淇淋|雪糕|冰激凌|冰品|面包|烘焙|糕点|包子|馒头|甜甜圈|烹饪|厨房|厨具|烹饪课)/i,
  },
  {
    emoji: '🏥',
    pattern:
      /(health|medical|doctor|hospital|clinic|dentist|dental|surgery|treatment|therapy|copay|deductible|checkup|check.?up|医疗|医院|医生|牙医|看病|体检|治疗|手术|诊所)/i,
  },
  {
    emoji: '💊',
    pattern:
      /(medicine|pharmacy|drug|prescription|vitamin|supplement|药|药店|药品|维生素|补品|处方)/i,
  },
  {
    emoji: '👶',
    pattern:
      /(baby|kid\b|child(ren)?|infant|toddler|daycare|nursery|preschool|kindergarten|diaper|nappy|formula|stroller|crib|playgroup|family|household.*member|parents?|sibling|spouse|husband|wife|relatives?|婴儿|孩子|小孩|儿童|托儿|尿布|奶粉|婴儿车|幼儿园|家庭|家人|父母|配偶|亲戚|兄弟姐妹)/i,
  },
  {
    emoji: '🐶',
    pattern:
      /(\bpet\b|dog|puppy|cat\b|kitten|kitty|feline|vet\b|veterinar(y|ian)|kennel|pet.?care|pet.?food|宠物|狗|猫|兽医|宠物医院|狗粮|猫粮|猫咪)/i,
  },
  {
    emoji: '🏋️',
    pattern:
      /(gym|fitness|workout|exercise|training|yoga|pilates|crossfit|peloton|trainer|swim(ming)?|pool\b|aquatic|sport|football|soccer|basketball|tennis|baseball|hockey|cricket|golf|badminton|volleyball|rugby|健身|锻炼|瑜伽|健身房|训练|游泳|泳池|运动|球类|高尔夫|羽毛球|排球|网球|棒球|足球|篮球)/i,
  },
  {
    emoji: '🎮',
    pattern:
      /(\bgame|gaming|console|xbox|playstation|nintendo|switch\b|steam|epic\s*games|board.?game|hobby|hobbies|recreation|leisure|游戏|游戏机|主机|爱好|休闲|娱乐|兴趣)/i,
  },
  {
    emoji: '🎬',
    pattern:
      /(movie|cinema|theater|theatre|film|imax|amc|tv\b|television|streaming|netflix|youtube|hulu|disney|prime.?video|hbo|paramount|peacock|apple.?tv|music|spotify|apple.?music|itunes|soundcloud|deezer|tidal|pandora|audible|podcast|concert|gig\b|album|photo(graphy)?|camera|photographer|art\b|paint(ing)?|craft|drawing|sketch|pottery|ceramic|calligraphy|museum|gallery|院线|电影|影院|电视|流媒体|视频会员|影视|视频|音乐|演唱会|唱片|播客|有声书|摄影|相机|摄影师|艺术|绘画|手工|陶艺|书法|美术馆)/i,
  },
  {
    emoji: '📚',
    pattern:
      /(book|reading|literature|library|novel|ebook|kindle|audiobook|textbook|news(paper)?|magazine|publication|journal|书籍|阅读|图书|电子书|教科书|新闻|报纸|杂志|报刊)/i,
  },
  {
    emoji: '🎓',
    pattern:
      /(education|school|college|university|tuition|course|class\b|learning|study|workshop|seminar|mooc|coursera|udemy|stationery|pen\b|pencil|notebook|paper\b|calculator|教育|学费|学校|课程|培训|网课|讲座|文具|学习用品|笔|本子|纸张)/i,
  },
  {
    emoji: '👕',
    pattern:
      /(cloth(ing|es)|apparel|fashion|wardrobe|outfit|t.?shirt|shirt|jeans|dress|jacket|coat|sweater|hoodie|shoe|sneaker|footwear|boot|heel|sandal|slipper|\bbag\b|handbag|purse|backpack|tote|satchel|wallet|jewel(ry|lery)|ring\b|necklace|bracelet|earring|gold|silver|diamond|pearl|wedding|marriage|beauty|cosmetic|makeup|skincare|spa\b|nail|manicure|pedicure|perfume|fragrance|mask\b|hair(cut)?|barber|salon|stylist|dye|lotion|cream|serum|moisturizer|sunscreen|衣服|服装|服饰|时尚|衣物|牛仔裤|外套|毛衣|衬衫|鞋|球鞋|高跟鞋|凉鞋|拖鞋|包|背包|手袋|钱包|行李袋|珠宝|首饰|婚礼|婚庆|戒指|项链|手镯|耳环|黄金|银饰|钻石|美容|化妆|护肤|面膜|指甲|香水|彩妆|理发|发型|美发|染发|护肤品|乳液|防晒|精华)/i,
  },
  {
    emoji: '💡',
    pattern:
      /(utility|utilities|electricity|electric|power.*bill|water.*bill|sewage|sewer|council.?tax|heating|gas\s*bill|furnace|cooling|aircon|a\/c|air.?conditioning|heat.?pump|fan\b|公用事业|水电|电费|水费|公共事业|供暖|燃气费|暖气|空调|制冷|风扇)/i,
  },
  {
    emoji: '📱',
    pattern:
      /(phone|mobile|cell(ular|phone)?|smartphone|sim\s*card|prepaid|internet|wifi|broadband|isp|telecom|fiber|fibre|ethernet|software|tech\b|computer|laptop|electronics|gadget|app\b|saas|hardware|cloud.?service|aws|gcp|azure|github|gitlab|手机|话费|电话费|宽带|网费|电信|光纤|网络费|软件|电脑|电子产品|数码|硬件)/i,
  },
  {
    emoji: '🔁',
    pattern:
      /(subscription|recurring|membership|monthly.?fee|annual.?fee|订阅|会员|月费|年费|续费|包月|包年)/i,
  },
  {
    emoji: '💰',
    pattern:
      /(salary|wage|paycheck|payroll|earning|compensation|bonus|commission|freelance|side.?hustle|saving|goal|target|emergency.?fund|sinking.?fund|工资|薪水|薪资|收入|奖金|提成|佣金|储蓄|目标|紧急基金)/i,
  },
  {
    emoji: '📈',
    pattern:
      /(invest(ment)?|stock|equity|dividend|portfolio|crypto|bitcoin|trading|mutual.?fund|etf|bond|401k|ira\b|roth|retirement|投资|股票|基金|分红|理财|加密货币|退休)/i,
  },
  {
    emoji: '🏦',
    pattern:
      /(bank(ing)?|finance|loan|deposit|interest|savings.?account|checking|insurance|premium|coverage|deductible|policy|credit.?card|debit.?card|card.?payment|visa\b|mastercard|amex|american.?express|paypal|transfer|withdraw|atm|cash\b|wire|remittance|venmo|zelle|cashapp|bill.?pay|银行|金融|贷款|存款|利息|储蓄|活期|定期|保险|保费|车险|寿险|医保|信用卡|借记卡|刷卡|信用卡账单|转账|提现|取款|汇款|微信转账|支付宝)/i,
  },
  {
    emoji: '🧾',
    pattern:
      /(\btax\b|\bfees?\b|invoice|bill\b|charge|levy|surcharge|vat\b|gst\b|hst\b|sales.?tax|income.?tax|refund|reimburs(e|ement)|cashback|rebate|return\b|deposit.?return|coin|change\b|spare.?change|tip.?jar|税|费用|账单|发票|增值税|所得税|营业税|手续费|退款|报销|返现|退还|退货|零钱|硬币|小费|杂币)/i,
  },
  {
    emoji: '🛍️',
    pattern:
      /(shopping|shop\b|store|mall|retail|amazon|ebay|taobao|jd\.com|aliexpress|shein|temu|online.?shop|购物|商场|店铺|淘宝|京东|网购)/i,
  },
  {
    emoji: '🎁',
    pattern:
      /(gift|present\b|donation|charity|tip\b|red.?packet|hongbao|ang.?pao|lai.?see|fundraiser|party|celebration|birthday|anniversary|reunion|gathering|prom|baby.?shower|ticket|event|show|festival|admission|entrance|exhibition|fair\b|礼物|礼品|捐赠|红包|打赏|礼金|慈善|庆祝|派对|生日|纪念日|聚会|庆典|门票|演出|活动|节日|入场|展览|展会)/i,
  },
  {
    emoji: '💼',
    pattern:
      /(work|business|office|job|career|workspace|equipment|supplies|coworking|wework|regus|virtual.?office|calendar|schedule|booking|reservation|appointment|工作|办公|商务|办公用品|办公室|联合办公|预约|预订|行事历)/i,
  },
  {
    emoji: '🧼',
    pattern:
      /(cleaning|laundry|detergent|soap|hygiene|maid|housekeeping|清洁|洗衣|卫生|家政|清洁工)/i,
  },
];

if (process.env.NODE_ENV !== 'production') {
  for (const { emoji } of CATEGORY_EMOJI_PATTERNS) {
    if (!DEFAULT_CATEGORY_EMOJIS.includes(emoji)) {
      console.warn(`categoryEmojiMatcher: ${emoji} is not in DEFAULT_CATEGORY_EMOJIS`);
    }
  }
}

export function suggestCategoryEmoji(name: string): string | null {
  const trimmed = name?.trim() ?? '';
  if (!trimmed) return null;
  for (const { emoji, pattern } of CATEGORY_EMOJI_PATTERNS) {
    if (pattern.test(trimmed)) return emoji;
  }
  return null;
}
