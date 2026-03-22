// Shopee Thailand Official Categories - Advanced Keyword Mapping with Context Analysis
// Updated: 2026
// Features: Negative keywords, phrase boosting, word order analysis, context scoring
// Improved accuracy for ambiguous products like "เก้าอี้แคมป์" (camping chair)

const fs = require('fs');
const path = require('path');

module.exports = {
  categories: {
    // === ELECTRONICS & TECH (High Priority - Check First) ===
    'โทรศัพท์มือถือและอุปกรณ์เสริม': {
      priority: 10,
      keywords: [
        'iphone', 'samsung galaxy', 'oppo', 'vivo', 'xiaomi', 'redmi', 'realme', 'honor', 'huawei', 'oneplus',
        'มือถือ', 'สมาร์ทโฟน', 'smartphone', 'โทรศัพท์', 'android', 'ios',
        'เคสโทรศัพท์', 'เคสมือถือ', 'ฟิล์มโทรศัพท์', 'ที่ชาร์จ', 'สายชาร์จ', 'powerbank', 'แบตสำรอง',
        'หัวชาร์จ', 'สาย data', 'ซิม', 'true', 'ais', 'dtac', 'magsafe', 'wireless charger',
        'เคสไอโฟน', 'เคสซัมซุง', ' Oppo', 'vivo', 'realme'
      ],
      negativeKeywords: ['tablet', 'แท็บเล็ต', 'ipad', 'คอมพิวเตอร์', 'notebook', 'laptop', 'แล็ปท็อป'],
      mustHaveWords: ['มือถือ', 'โทรศัพท์', 'สมาร์ทโฟน', 'iphone', 'samsung', 'oppo', 'vivo', 'xiaomi']
    },
    'แท็บเล็ต': {
      priority: 10,
      keywords: [
        'แท็บเล็ต', 'tablet', 'ipad', 'galaxy tab', 'xiaomi pad', 'lenovo tab',
        'เคสไอแพด', 'ฟิล์มไอแพด', 'ปากกาไอแพด', 'apple pencil', 'ipad air', 'ipad pro', 'ipad mini'
      ],
      negativeKeywords: ['มือถือ', 'โทรศัพท์', 'laptop', 'notebook', 'คอมพิวเตอร์']
    },
    'คอมพิวเตอร์และแล็ปท็อป': {
      priority: 10,
      keywords: [
        'notebook', 'laptop', 'macbook', 'desktop', 'คอม', 'คอมพิวเตอร์', 'pc', 'โน้ตบุ๊ค', 'แล็ปท็อป',
        'mouse', 'คีย์บอร์ด', 'keyboard', 'mechanical', 'monitor', 'จอคอม', 'จอภาพ',
        'ram', 'ssd', 'hdd', 'harddisk', 'flash drive', 'usb hub',
        'printer', 'ปริ้นเตอร์', 'เครื่องพิมพ์', 'สแกนเนอร์',
        'router', 'wifi', 'access point', 'lan', 'ethernet', 'network', 'modem',
        'cpu', 'gpu', 'vga', 'cardจอ', 'mainboard', 'psu', 'water cooling',
        'asus', 'acer', 'dell', 'hp', 'lenovo', 'msi', 'gigabyte'
      ],
      negativeKeywords: ['มือถือ', 'โทรศัพท์', 'tablet', 'แท็บเล็ต']
    },
    'เครื่องเสียง': {
      priority: 9,
      keywords: [
        'ลำโพง', 'speaker', 'bluetooth speaker', 'soundbar', 'subwoofer', 'home theater',
        'หูฟัง', 'headphone', 'earphone', 'earbuds', 'true wireless', 'gaming headset',
        'ไมค์', 'microphone', 'mic', 'คอนเดนเซอร์', 'wireless mic',
        'amplifier', 'amp', 'dac', 'audio interface', 'mixer', 'turntable', 'vinyl',
        'jbl', 'sony', 'bose', 'sennheiser', 'audio technica', 'edifier'
      ],
      negativeKeywords: ['instrument', 'กีตาร์', 'กลอง', 'เปียโน', 'ergonomic', 'เก้าอี้', 'โต๊ะ', 'เฟอร์นิเจอร์']
    },
    'เครื่องใช้ไฟฟ้าในบ้าน': {
      priority: 8,
      keywords: [
        'ตู้เย็น', 'refrigerator', 'แอร์', 'เครื่องปรับอากาศ', 'air conditioner',
        'พัดลม', 'fan', 'เครื่องฟอกอากาศ', 'air purifier', 'hepa',
        'เครื่องซักผ้า', 'washing machine', 'เครื่องอบผ้า', 'dryer',
        'เครื่องดูดฝุ่น', 'vacuum', 'robot vacuum', 'เตารีด', 'iron',
        'เตาอบ', 'oven', 'ไมโครเวฟ', 'microwave', 'หม้อทอด', 'air fryer',
        'หม้อหุงข้าว', 'rice cooker', 'เครื่องปั่น', 'blender', 'juicer',
        'เครื่องชงกาแฟ', 'coffee maker', 'espresso', 'กาต้มน้ำ', 'kettle', 'toaster',
        'panasonic', 'sharp', 'hitachi', 'electrolux', 'philips', 'xiaomi'
      ],
      negativeKeywords: ['outdoor', 'กลางแจ้ง', 'แคมป์ปิ้ง', 'camping']
    },
    'กล้องและอุปกรณ์ถ่ายภาพ': {
      priority: 9,
      keywords: [
        'กล้อง', 'camera', 'dslr', 'mirrorless', 'action camera', 'gopro', 'insta360',
        'กล้องวงจรปิด', 'cctv', 'security camera', 'ip camera',
        'เลนส์', 'lens', 'ขาตั้ง', 'tripod', 'gimbal', 'stabilizer',
        'memory card', 'sd card', 'flash', 'แฟลช', 'ring light', 'ไฟถ่ายภาพ',
        'canon', 'nikon', 'sony', 'fujifilm', 'olympus', 'panasonic', 'leica'
      ],
      negativeKeywords: ['ของเล่น', 'toy', 'เด็ก', 'kids']
    },
    'Gaming และอุปกรณ์เกม': {
      priority: 9,
      keywords: [
        'ps5', 'playstation', 'ps4', 'xbox', 'nintendo', 'switch', 'steam deck',
        'เกม', 'แผ่นเกม', 'ตลับเกม', 'digital code', 'psn', 'xbox live',
        'จอย', 'controller', 'gamepad', 'joystick', 'racing wheel',
        'gaming chair', 'เก้าอี้เกมมิ่ง', 'gaming desk', 'โต๊ะเกม',
        'rog', 'razer', 'logitech g', 'steelseries', 'corsair', 'hyperx',
        'เก้าอี้เกม', 'เก้าอี้เล่นเกม', 'โต๊ะเกมมิ่ง', 'อุปกรณ์เกม'
      ],
      negativeKeywords: ['เด็ก', 'kids', 'ของเล่นเด็ก', 'เฟอร์นิเจอร์สำนักงาน', 'โต๊ะทำงาน'],
      mustHaveWords: ['gaming', 'เกม', 'game', 'ps5', 'ps4', 'xbox', 'nintendo', 'geforce', 'rtx']
    },

    // === FASHION & ACCESSORIES ===
    'เสื้อผ้าผู้หญิง': {
      priority: 7,
      keywords: [
        'เสื้อผู้หญิง', 'blouse', 'top', 't-shirt', 'crop top', 'เสื้อยืดผู้หญิง',
        'เดรส', 'dress', 'กระโปรง', 'skirt',
        'กางเกงผู้หญิง', 'pants', 'trousers', 'jeans', 'leggings', 'shorts', 'ขาสั้นผู้หญิง',
        'จั๊มสูท', 'jumpsuit', 'romper', 'overalls',
        'ชุดชั้นในสตรี', 'bra', 'ชุดนอนหญิง', 'pajama', 'ชุดนอนผู้หญิง',
        'cardigan', 'sweater', 'hoodie', 'blazer', 'jacket', 'coat', 'เสื้อกันหนาวผู้หญิง',
        'สาวอวบ', 'plus size', 'big size', 'เสื้อเชิ้ตผู้หญิง', 'เสื้อแขนยาวผู้หญิง',
        'ชุดทำงานผู้หญิง', 'ชุดออกงาน', 'ชุดเดรส', 'เสื้อเกาะอก', 'เสื้อสายเดี่ยว',
        'เดรสยาว', 'เดรสสั้น', 'เดรสลาย', 'ชุดเดรส'
      ],
      negativeKeywords: ['ผู้ชาย', 'men', 'male', 'เด็ก', 'kids', 'เก้าอี้', 'โต๊ะ', 'เฟอร์นิเจอร์', 'รองเท้า', 'shoes', 'กระเป๋า', 'bag', 'วิตามิน', 'อาหารเสริม', 'ยา'],
      mustHaveWords: ['ผู้หญิง', 'สตรี', 'female', 'women', 'ladies', 'สาว', 'เดรส']
    },
    'เสื้อผ้าผู้ชาย': {
      priority: 7,
      keywords: [
        'เสื้อเชิ้ต', 'shirt', 'formal shirt', 'เสื้อโปโล', 'polo',
        'เสื้อยืด', 't-shirt', 'tee', 'เสื้อยืดผู้ชาย',
        'กางเกงผู้ชาย', 'pants', 'trousers', 'chinos', 'shorts', 'bermuda', 'ขาสั้นผู้ชาย',
        'jeans', 'ยีนส์', 'denim',
        'hoodie', 'sweatshirt', 'jacket', 'coat', 'เสื้อกันหนาวผู้ชาย',
        'ชุดชั้นในชาย', 'boxer', 'brief', 'ชุดนอนชาย', 'ชุดนอนผู้ชาย',
        'เสื้อกล้าม', 'tank top', 'เสื้อยืดคอกลม', 'เสื้อทำงานผู้ชาย'
      ],
      negativeKeywords: ['ผู้หญิง', 'women', 'female', 'ladies', 'เด็ก', 'kids', 'เก้าอี้', 'โต๊ะ', 'วิตามิน', 'อาหารเสริม', 'ยา'],
      mustHaveWords: ['ผู้ชาย', 'men', 'male', 'boys']
    },
    'กระเป๋า': {
      priority: 7,
      keywords: [
        'กระเป๋า', 'bag', 'handbag', 'shoulder bag', 'crossbody', 'sling bag', 'tote',
        'กระเป๋าสตางค์', 'wallet', 'purse', 'card holder',
        'กระเป๋าผ้า', 'canvas bag', 'eco bag', 'ถุงผ้า',
        'กระเป๋าเป้', 'backpack', 'rucksack',
        'กระเป๋าคาดอก', 'chest bag', 'waist bag', 'belt bag', 'fanny pack',
        'laptop bag', 'กระเป๋าโน้ตบุ๊ค', 'briefcase', 'messenger bag',
        'clutch', 'pouch', 'satchel', 'hobo bag', 'bucket bag'
      ],
      negativeKeywords: ['รองเท้า', 'shoes', 'เสื้อผ้า', 'dress', 'เสื้อ', 'กางเกง', 'เดินทาง', 'travel', 'suitcase', 'ล้อลาก', 'เดินป่า', 'hiking', 'camping', 'แคมป์'],
      mustHaveWords: ['กระเป๋า', 'bag', 'wallet', 'pouch', 'clutch']
    },
    'รองเท้าผู้หญิง': {
      priority: 7,
      keywords: [
        'รองเท้าผู้หญิง', 'รองเท้าสตรี', 'heels', 'high heels', 'pumps', 'wedges',
        'flats', 'ballet flats', 'loafers',
        'sneakers', 'รองเท้าผ้าใบสตรี', 'nike', 'adidas', 'converse', 'vans',
        'boots', 'ankle boots', 'knee high', 'chelsea boots',
        'sandals', 'slides', 'flip flops', 'mules', 'espadrille',
        'รองเท้าส้นสูง', 'รองเท้าคัทชู', 'รองเท้าบัลเล่ต์', 'รองเท้าแตะผู้หญิง'
      ],
      negativeKeywords: ['ผู้ชาย', 'men', 'male', 'เสื้อผ้า', 'bag', 'กระเป๋า', 'วิ่ง', 'running', 'marathon', 'กีฬา', 'sport'],
      mustHaveWords: ['รองเท้า', 'shoes', 'sneakers', 'boots', 'sandals', 'heels']
    },
    'รองเท้าผู้ชาย': {
      priority: 7,
      keywords: [
        'รองเท้าผู้ชาย', 'รองเท้าบุรุษ', 'sneakers', 'sport shoes', 'running shoes',
        'leather shoes', 'formal shoes', 'oxford', 'derby', 'brogues',
        'loafers', 'slip on',
        'boots', 'chelsea boots', 'combat boots', 'work boots', 'timberland',
        'sandals', 'slides', 'flip flops', 'crocs',
        'safety shoes', 'รองเท้าเซฟตี้', 'รองเท้าผ้าใบผู้ชาย', 'รองเท้ากีฬาผู้ชาย'
      ],
      negativeKeywords: ['ผู้หญิง', 'women', 'female', 'เสื้อผ้า', 'bag', 'กระเป๋า', 'วิ่ง', 'marathon'],
      mustHaveWords: ['รองเท้า', 'shoes', 'sneakers', 'boots', 'sandals']
    },
    'เครื่องประดับ': {
      priority: 6,
      keywords: [
        'แหวน', 'ring', 'jewelry',
        'สร้อยคอ', 'necklace', 'chain', 'pendant', 'choker',
        'ต่างหู', 'earrings', 'ear studs', 'hoops',
        'กำไล', 'bracelet', 'bangle', 'wristband',
        'เข็มขัด', 'belt', 'leather belt',
        'หมวก', 'hat', 'cap', 'beanie', 'bucket hat', 'beret',
        'ผ้าพันคอ', 'scarf', 'shawl',
        'จี้', 'brooch', 'pin', 'cufflinks', 'กำไลข้อมือ'
      ],
      negativeKeywords: ['นาฬิกา', 'watch', 'เสื้อผ้า', 'shoes', 'รองเท้า']
    },
    'นาฬิกาและแว่นตา': {
      priority: 7,
      keywords: [
        'นาฬิกา', 'watch', 'wristwatch', 'นาฬิกาข้อมือ',
        'smartwatch', 'smart watch', 'fitness tracker', 'apple watch', 'garmin',
        'casio', 'g-shock', 'baby-g', 'rolex', 'omega', 'seiko', 'citizen', 'fossil',
        'แว่น', 'glasses', 'spectacles', 'แว่นสายตา', 'optical',
        'แว่นกันแดด', 'sunglasses', 'rayban', 'aviator', 'polarized',
        'กรอบแว่น', 'frame', 'เลนส์แว่น', 'lens', 'สายนาฬิกา'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'กระเป๋า', 'เครื่องประดับ', 'เครื่องคิดเลข', 'calculator']
    },

    // === BEAUTY & HEALTH ===
    'ความงาม': {
      priority: 7,
      keywords: [
        'เครื่องสำอาง', 'cosmetics', 'makeup',
        'ลิป', 'lipstick', 'lip gloss', 'lip tint', 'lip balm', 'ลิปสติก',
        'รองพื้น', 'foundation', 'cushion', 'powder', 'แป้ง', 'bb cream', 'cc cream',
        'blush', 'ไฮไลท์', 'highlighter', 'contour', 'bronzer',
        'eyeshadow', 'มาสคาร่า', 'mascara', 'eyeliner', 'eyebrow', 'คิ้ว',
        'น้ำหอม', 'perfume', 'fragrance', 'cologne', 'body spray',
        'palette', 'เซตเครื่องสำอาง', 'makeup set', 'แปรงแต่งหน้า', 'ฟองน้ำ'
      ],
      negativeKeywords: ['สกินแคร์', 'skincare', 'ยา', 'medicine', 'อาหารเสริม']
    },
    'ผลิตภัณฑ์ดูแลผิว': {
      priority: 7,
      keywords: [
        'สกินแคร์', 'skincare', 'ดูแลผิว', 'บำรุงผิว',
        'เซรั่ม', 'serum', 'essence', 'ampoule', 'treatment',
        'ครีม', 'cream', 'moisturizer', 'lotion', 'gel', 'emulsion', 'eye cream',
        'กันแดด', 'sunscreen', 'sun protection', 'spf', 'sunblock',
        'สบู่', 'soap', 'cleanser', 'โฟมล้างหน้า', 'face wash', 'cleansing oil', 'micellar water',
        'โทนเนอร์', 'toner', 'mist', 'essence water',
        'มาส์ก', 'mask', 'sheet mask', 'sleeping mask', 'clay mask', 'peeling',
        'วิตามินซี', 'retinol', 'hyaluronic acid', 'niacinamide', 'aha', 'bha',
        'ทา', 'ผิวหน้า', 'ผิวตัว', 'บำรุงหน้า'
      ],
      negativeKeywords: ['เครื่องสำอาง', 'makeup', 'ยา', 'medicine', 'อาหารเสริม', 'กิน', 'รับประทาน', 'วิตามิน', 'vitamin', 'mg', 'tablet', 'เดินทาง', 'travel', 'เป้', 'backpack', 'หมอน', 'น้ำมันเครื่อง', 'engine oil'],
      mustHaveWords: ['สกินแคร์', 'skincare', 'เซรั่ม', 'serum', 'ครีม', 'cream', 'ทา', 'ผิว', 'กันแดด', 'spf']
    },
    'สุขภาพ': {
      priority: 7,
      keywords: [
        'อาหารเสริม', 'supplement', 'วิตามิน', 'vitamin', 'minerals', 'multivitamin',
        'คอลลาเจน', 'collagen', 'glutathione', 'โปรตีน', 'protein', 'เวย์', 'whey',
        'หน้ากากอนามัย', 'surgical mask', 'n95', 'kf94',
        'thermometer', 'ปรอทวัดไข้', 'เครื่องวัดไข้',
        'blood pressure', 'เครื่องวัดความดัน',
        'ยา', 'medicine', 'ยาแก้ปวด', 'painkiller', 'พารา',
        'สมุนไพร', 'herb', 'herbal', 'ยาหม่อง', 'balm',
        'wheelchair', 'ไม้เท้า', 'walker', 'อุปกรณ์การแพทย์',
        'probiotic', 'ไฟเบอร์', 'detox', 'ลดน้ำหนัก', 'เพิ่มน้ำหนัก',
        'วิตามินซี', 'vitamin c', 'vitamin b', 'vitamin d', 'zinc', 'magnesium', 'calcium',
        'mg', 'tablet', 'แคปซูล', 'เม็ด', 'กิน', 'รับประทาน'
      ],
      negativeKeywords: ['เครื่องสำอาง', 'makeup', 'สกินแคร์', 'skincare', 'ทา', 'ครีม', 'เซรั่ม', 'เสื้อผ้า', 'dress', 'เดรส', 'เสื้อ', 'หนังสือ', 'นิยาย', 'manga', 'การ์ตูน', 'เชิ้ต', 'เสื้อยืด', 'กางเกง', 'กระโปรง', 'ชุด', 'หมอน', 'travel', 'เดินทาง', 'น้ำผลไม้', 'juice', 'เครื่องดื่ม'],
      mustHaveWords: ['วิตามิน', 'vitamin', 'อาหารเสริม', 'supplement', 'ยา', 'medicine', 'mg', 'tablet', 'แคปซูล', 'คอลลาเจน', 'โปรตีน']
    },

    // === HOME & LIVING ===
    'บ้านและสวน': {
      priority: 6,
      keywords: [
        'สวน', 'garden', 'ต้นไม้', 'plant', 'กระถาง', 'pot', 'planter',
        'ดินปลูก', 'soil', 'ปุ๋ย', 'fertilizer', 'ยาฆ่าแมลง', 'pesticide',
        'อุปกรณ์ทำสวน', 'gardening tools', 'จอบ', 'เสียม', 'กรรไกรตัดกิ่ง',
        'สายยาง', 'hose', 'sprinkler', 'หัวฉีด', 'irrigation',
        'เมล็ดพันธุ์', 'seed', 'ต้นกล้า', 'ไม้ดอก', 'ไม้ประดับ', 'บอนไซ'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร']
    },
    'เครื่องใช้ในบ้าน': {
      priority: 6,
      keywords: [
        'จัดเก็บ', 'storage', 'กล่อง', 'box', 'ตะกร้า', 'basket', 'ชั้นวาง', 'rack', 'shelf', 'organizer',
        'ตู้', 'cabinet', 'drawer', 'wardrobe', 'closet', 'bookshelf',
        'ไม้แขวน', 'hanger', 'ที่แขวน', 'hook', 'clip',
        'ผ้าปูที่นอน', 'bed sheet', 'ผ้าห่ม', 'blanket', 'comforter', 'duvet',
        'หมอน', 'pillow', 'ที่นอน', 'mattress', 'topper',
        'มุ้ง', 'mosquito net', 'ม่าน', 'curtain', 'blinds', 'ผ้าม่าน',
        'พรม', 'rug', 'carpet', 'mat', 'floor mat', 'yoga mat',
        'โคมไฟ', 'lamp', 'light', 'led', 'bulb', 'ceiling light', 'table lamp',
        'เทียน', 'candle', 'diffuser', 'air freshener',
        'wall clock', 'นาฬิกาแขวน', 'alarm clock',
        'กระจก', 'mirror', 'vanity mirror',
        'เก้าอี้', 'chair', 'โต๊ะ', 'table', 'โซฟา', 'sofa', 'เฟอร์นิเจอร์', 'furniture',
        'ชั้นวางของ', 'ตู้เสื้อผ้า', 'โต๊ะทำงาน', 'โต๊ะเครื่องแป้ง',
        'กล่องจัดเก็บ', 'กล่องใส่ของ', 'ตะกร้าใส่ผ้า', 'ที่จัดระเบียบ'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร', 'เด็ก', 'kids', 'แคมป์ปิ้ง', 'camping', 'outdoor', 'เกมมิ่ง', 'gaming', 'เดินทาง', 'travel', 'หมอนรองคอ', 'neck pillow'],
      mustHaveWords: ['จัดเก็บ', 'storage', 'กล่อง', 'เก้าอี้', 'โต๊ะ', 'เฟอร์นิเจอร์', 'ตู้', 'ชั้นวาง', 'ผ้าปู', 'หมอน']
    },
    'อาหารและเครื่องดื่ม': {
      priority: 6,
      keywords: [
        'อาหาร', 'food', 'ขนม', 'snack', 'chips', 'cookie', 'คุกกี้', 'cracker',
        'เครื่องดื่ม', 'drink', 'beverage', 'ชา', 'tea', 'กาแฟ', 'coffee', 'น้ำผลไม้', 'juice',
        'health food', 'organic', 'ออร์แกนิค', 'คลีน', 'clean food', 'vegan',
        'อาหารแห้ง', 'dried food', 'อาหารกระป๋อง', 'canned food', 'instant food',
        'ซอส', 'sauce', 'เครื่องปรุง', 'seasoning', 'น้ำมัน', 'oil', 'น้ำปลา', 'soy sauce',
        'ขนมเค้ก', 'cake', 'เบเกอรี่', 'bakery', 'bread', 'ขนมปัง', 'pastry',
        'ช็อคโกแลต', 'chocolate', 'ลูกอม', 'candy', 'เยลลี่', 'jelly', 'gummy', 'ice cream',
        'ข้าว', 'rice', 'บะหมี่', 'noodle', 'มาม่า', 'instant noodle',
        'วิตามิน', 'water', 'functional drink', 'เครื่องดื่ม функциональный'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'สกินแคร์', 'ยา', 'อาหารเสริม', 'vitamin', 'tablet', 'mg', 'แคปซูล', 'น้ำมันเครื่อง', 'engine oil', 'น้ำมันเบรก', 'น้ำมันเกียร์'],
      mustHaveWords: ['อาหาร', 'food', 'ขนม', 'snack', 'เครื่องดื่ม', 'drink', 'juice', 'น้ำ']
    },
    'ของเล่น สินค้างานอดิเรก': {
      priority: 6,
      keywords: [
        'ของเล่น', 'toy', 'toys', 'ตุ๊กตา', 'doll', 'plush', 'teddy bear',
        'โมเดล', 'model', 'figure', 'action figure', 'nendoroid', 'funko',
        'เลโก้', 'lego', 'ตัวต่อ', 'building blocks', 'brick',
        'ของสะสม', 'collectible', 'card', 'trading card', 'pokemon card',
        'jigsaw', 'จิ๊กซอว์', 'puzzle', 'board game', 'บอร์ดเกม', 'monopoly', 'uno',
        'rc car', 'รถบังคับ', 'โดรน', 'drone', 'dji',
        'ศิลปะ', 'art', 'สี', 'paint', 'brush', 'พู่กัน', 'canvas', 'craft',
        'diy', 'handmade', 'งานฝีมือ', 'origami'
      ],
      negativeKeywords: ['อาหาร', 'food', 'เสื้อผ้า', 'shoes', 'เครื่องสำอาง']
    },

    // === BABY & KIDS ===
    'แม่และเด็ก': {
      priority: 8,
      keywords: [
        'เด็ก', 'baby', 'infant', 'toddler', 'เด็กเล็ก', 'เด็กอ่อน', 'newborn', 'คนท้อง',
        'รถเข็น', 'stroller', 'pram', 'buggy', 'car seat', 'คาร์ซีท', 'combi', 'chicco',
        'ผ้าอ้อม', 'diaper', 'nappy', 'แพมเพิส', 'pampers', 'merries', 'moony',
        'นมผง', 'formula', 'นมเด็ก', 'baby food', 'similac', 'enfamil',
        'ขวดนม', 'baby bottle', 'จุกนม', 'pacifier', 'pigeon',
        'ของเล่นเด็ก', 'baby toy', 'educational toy', 'fisher price',
        'เตียงเด็ก', 'crib', 'baby bed', 'เปล',
        'bathtub', 'อ่างอาบน้ำเด็ก', 'baby shampoo', 'baby lotion', 'johnson baby',
        'เป้อุ้ม', 'carrier', 'sling', 'ผ้าอุ้ม', 'ergobaby', 'hipseat',
        'เครื่องนึ่งขวดนม', 'ที่ดูดน้ำมูก', 'เครื่องอบขวดนม'
      ],
      negativeKeywords: ['เสื้อผ้าผู้หญิง', 'เสื้อผ้าผู้ชาย', 'เครื่องสำอาง', 'อาหารเสริมผู้ใหญ่']
    },
    'เสื้อผ้าเด็ก': {
      priority: 8,
      keywords: [
        'เสื้อผ้าเด็ก', 'kids clothes', 'children clothes', 'ชุดเด็ก',
        'เด็กแรกเกิด', 'newborn', 'baby wear', 'infant clothes',
        'เด็กผู้หญิง', 'girls', 'ชุดเด็กหญิง',
        'เด็กผู้ชาย', 'boys', 'ชุดเด็กชาย',
        'ชุดนอนเด็ก', 'kids pajama',
        'ชุดนักเรียน', 'school uniform', 'ชุดอนุบาล',
        'รองเท้าเด็ก', 'kids shoes', 'baby shoes',
        'ถุงเท้าเด็ก', 'kids socks', 'ชุดชั้นในเด็ก', 'เสื้อยืดเด็ก', 'กางเกงเด็ก',
        'ชุดเด็ก', 'เสื้อผ้าเด็กโต'
      ],
      negativeKeywords: ['ผู้หญิง', 'ผู้ชาย', 'women', 'men', 'adult', 'รถเข็น', 'ผ้าอ้อม', 'ขวดนม', 'จัดเก็บ', 'storage', 'กล่อง'],
      mustHaveWords: ['เด็ก', 'kids', 'children', 'ชุด', 'เสื้อผ้า', 'นักเรียน']
    },

    // === SPORTS & OUTDOORS ===
    'กีฬาและกิจกรรมกลางแจ้ง': {
      priority: 8,
      keywords: [
        'กีฬา', 'sport', 'sports', 'ออกกำลังกาย', 'exercise', 'fitness', 'workout', 'gym',
        'รองเท้ากีฬา', 'sport shoes', 'running shoes', 'basketball shoes', 'football', 'soccer',
        'ลูกบอล', 'ball', 'ฟุตบอล', 'บาสเกตบอล', 'วอลเลย์บอล',
        'badminton', 'ไม้แบด', 'racket', 'tennis', 'เทนนิส', 'ปิงปอง', 'table tennis',
        'โยคะ', 'yoga', 'pilates', 'เสื่อโยคะ', 'mat', 'ยางยืด', 'resistance band',
        'ดัมเบล', 'dumbbell', 'barbell', 'weight', 'kettlebell',
        'treadmill', 'ลู่วิ่ง', 'จักรยาน', 'bicycle', 'exercise bike',
        'แคมป์ปิ้ง', 'camping', 'เต็นท์', 'tent', 'ถุงนอน', 'sleeping bag',
        'ตกปลา', 'fishing', 'เบ็ด', 'rod', 'reel', 'lure',
        'ว่ายน้ำ', 'swimming', 'ชุดว่ายน้ำ', 'swimsuit', 'goggles', 'แว่นว่ายน้ำ',
        'มวย', 'boxing', 'นวม', 'gloves', 'กระสอบทราย', 'punching bag',
        'เก้าอี้แคมป์', 'เก้าอี้สนาม', 'เก้าอี้พับได้', 'โต๊ะแคมป์ปิ้ง', 'เปลสนาม',
        'outdoor', 'กลางแจ้ง', 'ปีนเขา', 'hiking', 'trekking', 'backpack',
        'วิ่ง', 'running', 'marathon', 'jogging', 'trail running',
        'จักรยานเสือภูเขา', 'mtb', 'cycling', 'bike',
        'สนาม', 'กลางแจ้ง', 'กิจกรรมกลางแจ้ง', 'เดินป่า'
      ],
      negativeKeywords: ['เสื้อผ้าผู้หญิง', 'เสื้อผ้าผู้ชาย', 'เครื่องสำอาง', 'อาหาร', 'เฟอร์นิเจอร์บ้าน', 'โต๊ะทำงาน', 'เก้าอี้ทำงาน', 'เก้าอี้เกม'],
      mustHaveWords: ['กีฬา', 'outdoor', 'camping', 'แคมป์', 'ออกกำลังกาย', 'fitness', 'วิ่ง', 'marathon', 'สนาม', 'เดินป่า']
    },
    'การเดินทางและกระเป๋าเดินทาง': {
      priority: 7,
      keywords: [
        'กระเป๋าเดินทาง', 'travel bag', 'suitcase', 'luggage', 'carry on',
        'ล้อลาก', 'trolley', 'spinner', 'hard case', 'soft case', 'samsonite',
        'travel backpack', 'เป้เดินทาง', 'rucksack', 'hiking bag', 'osprey', 'deuter',
        'hand carry', 'cabin bag', 'boarding bag', 'weekender',
        'briefcase', 'กระเป๋าเอกสาร', 'messenger',
        'travel accessories', 'อุปกรณ์เดินทาง', 'หมอนรองคอ', 'neck pillow', 'eye mask', 'earplug',
        'luggage tag', 'tag กระเป๋า', 'lock', 'กุญแจกระเป๋า', 'tsa lock', 'cover', 'ปลอกกระเป๋า',
        'american tourister', 'vip', 'waliz',
        '20 นิ้ว', '24 นิ้ว', '28 นิ้ว', 'inch', 'ขนาด', 'ล้อ', 'ลาก',
        'หมอนเดินทาง', 'ที่ปิดตา', 'ที่อุดหู', 'เป้เดินทาง'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร', 'เป้เดินป่า', 'hiking backpack', 'สกินแคร์', 'skincare', 'ทา', 'ผิว'],
      mustHaveWords: ['เดินทาง', 'travel', 'suitcase', 'luggage', 'ล้อลาก', 'inch', 'นิ้ว', 'หมอนรองคอ', 'osprey']
    },

    // === AUTOMOTIVE & PETS ===
    'ยานยนต์': {
      priority: 7,
      keywords: [
        'รถยนต์', 'car', 'auto', 'automotive', 'รถ', 'vehicle',
        'มอเตอร์ไซค์', 'motorcycle', 'bike', 'motor', 'scooter',
        'car accessories', 'อุปกรณ์ในรถยนต์', 'car charger', 'ที่ชาร์จในรถ', 'phone holder',
        'car perfume', 'น้ำหอมในรถ', 'air freshener', 'car hook', 'ที่แขวน',
        'floor mat', 'พรมปูพื้น', 'ยางปูพื้น', 'car mat',
        'film', 'tint', 'ฟิล์มกรองแสง', 'window film', '3m', 'llumar',
        'dash cam', 'กล้องติดรถ', 'car camera', 'blackvue', 'thinkware',
        'car audio', 'เครื่องเสียงรถยนต์', 'subwoofer', 'amplifier', 'pioneer',
        'tire', 'ยาง', 'tyre', 'wheel', 'ล้อ', 'rim', 'แม็ก',
        'engine oil', 'น้ำมันเครื่อง', 'lubricant', 'coolant', 'น้ำยาหล่อเย็น',
        'battery', 'แบตเตอรี่', 'accu', 'jump starter',
        'car care', 'ทำความสะอาดรถ', 'wax', 'polish', 'shampoo', 'microfiber',
        'helmet', 'หมวกกันน็อค', 'rain coat', 'เสื้อกันฝน',
        'mobil', 'mobil 1', 'castrol', 'shell', 'valvoline', 'petronas'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร', 'ของเล่น', 'อาหารคน', 'เครื่องดื่ม'],
      mustHaveWords: ['รถยนต์', 'car', 'motorcycle', 'น้ำมันเครื่อง', 'engine oil', 'ยาง', 'ล้อ', 'แบตเตอรี่', 'mobil', 'castrol']
    },
    'สัตว์เลี้ยง': {
      priority: 7,
      keywords: [
        'สัตว์เลี้ยง', 'pet', 'pets', 'animal',
        'สุนัข', 'dog', 'puppy', 'หมา',
        'แมว', 'cat', 'kitten',
        'pet food', 'อาหารสัตว์', 'dog food', 'อาหารสุนัข', 'cat food', 'อาหารแมว', 'royal canin', 'pedigree', 'whiskas',
        'pet snack', 'ขนมสัตว์', 'treats', 'jerhigh',
        'cat litter', 'ทรายแมว', 'กระบะทราย', 'litter box',
        'cage', 'กรง', 'kennel',
        'pet house', 'บ้านสัตว์', 'pet bed', 'ที่นอนสัตว์', 'cat tree', 'cat condo',
        'pet clothes', 'เสื้อผ้าสัตว์', 'ชุดสุนัข', 'ชุดแมว',
        'pet toy', 'ของเล่นสัตว์', 'ของเล่นสุนัข', 'ของเล่นแมว',
        'leash', 'สายจูง', 'collar', 'ปลอกคอ', 'harness', 'สายรัด',
        'shampoo', 'แชมพู', 'grooming', 'กรูมมิ่ง', 'clipper', 'ตัดเล็บ'
      ],
      negativeKeywords: ['เสื้อผ้าผู้หญิง', 'เสื้อผ้าผู้ชาย', 'เครื่องสำอาง', 'อาหารคน']
    },

    // === OTHERS ===
    'หนังสือและสื่อบันเทิง': {
      priority: 5,
      keywords: [
        'หนังสือ', 'book', 'books', 'นิยาย', 'novel', 'manga', 'การ์ตูน', 'comic', 'light novel',
        'kindle', 'reader', 'reading', 'อ่าน',
        'nft', 'digital art', 'crypto',
        'dvd', 'blu-ray', 'cd', 'แผ่น', 'movie', 'film', 'เพลง', 'music', 'album', 'vinyl', 'kpop',
        'เล่ม', 'ปก', 'สำนักพิมพ์', 'นักเขียน', 'วรรณกรรม', 'เรื่องสั้น', 'บทกวี', 'e-book',
        'one piece', 'naruto', 'dragon ball', 'anime', 'มังงะ', 'วันพีช', 'นารูโตะ'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร', 'vitamin', 'อาหารเสริม'],
      mustHaveWords: ['หนังสือ', 'นิยาย', 'manga', 'การ์ตูน', 'novel', 'เล่ม', 'ebook', 'e-book', 'one piece', 'มังงะ']
    },
    'ตั๋วและบัตรกำนัล': {
      priority: 5,
      keywords: [
        'ตั๋ว', 'ticket', 'tickets', 'บัตร', 'card', 'voucher', 'coupon',
        'gift card', 'บัตรกำนัล', 'gift voucher', 'e-gift card',
        'travel voucher', 'โรงแรม', 'hotel', 'ที่พัก', 'resort', 'booking', 'agoda',
        'flight ticket', 'ตั๋วเครื่องบิน', 'air ticket',
        'concert ticket', 'บัตรคอนเสิร์ต', 'event ticket', 'งานแสดง',
        'discount', 'ส่วนลด', 'promotion', 'deal', 'flash sale'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร']
    },
    'เครื่องเขียนและอุปกรณ์สำนักงาน': {
      priority: 6,
      keywords: [
        'เครื่องเขียน', 'stationery', 'pen', 'ปากกา', 'pencil', 'ดินสอ', 'ballpoint', 'gel pen', 'marker', 'highlighter',
        'สมุด', 'notebook', 'notepad', 'libretto', 'planner', 'diary', 'journal', 'bullet journal',
        'กระดาษ', 'paper', 'a4', 'print', 'photocopy', 'sticker', 'สติกเกอร์', 'label', 'washi tape',
        'scissors', 'กรรไกร', 'cutter', 'คัตเตอร์', 'knife', 'มีด', 'blade',
        'glue', 'กาว', 'tape', 'เทป', 'scotch tape', 'glue stick', 'hot glue',
        'folder', 'แฟ้ม', 'file', 'document', 'envelope', 'ซอง', 'pouch', 'binder',
        'calculator', 'เครื่องคิดเลข', 'stamp', 'ตรายาง', 'ink pad', 'หมึก',
        'whiteboard', 'กระดาน', 'marker', 'ปากกาไวท์บอร์ด', 'chalk', 'ชอล์ค',
        'organizer', 'ที่จัดเก็บ', 'box', 'กล่อง', 'tray', 'ถาด', 'stand', 'ขาตั้ง', 'pen holder',
        'casio', 'sharp', 'canon เครื่องเขียน', 'pilot', 'uni-ball', 'zebra', 'pentel'
      ],
      negativeKeywords: ['เสื้อผ้า', 'shoes', 'รองเท้า', 'เครื่องสำอาง', 'อาหาร', 'นาฬิกา', 'watch'],
      mustHaveWords: ['เครื่องเขียน', 'ปากกา', 'สมุด', 'กระดาษ', 'calculator', 'เครื่องคิดเลข']
    },
    'อื่นๆ': {
      priority: 0,
      keywords: [],
      negativeKeywords: []
    }
  },

  /**
   * Advanced categorization with context analysis
   * @param {string} title - Product title
   * @returns {string} - Category name
   */
  categorize(title) {
    if (!title) return 'อื่นๆ';
    
    const t = title.toLowerCase();
    const words = t.split(/[\s,.-]+/).filter(w => w.length > 0);
    
    let bestMatch = 'อื่นๆ';
    let highestScore = 0;
    let debugInfo = { scores: {} };

    for (const [categoryName, categoryData] of Object.entries(this.categories)) {
      if (!categoryData.keywords || categoryData.keywords.length === 0) continue;

      let score = 0;
      let keywordMatches = [];
      let negativeMatches = [];

      // Check negative keywords first (disqualifier)
      if (categoryData.negativeKeywords) {
        for (const negKw of categoryData.negativeKeywords) {
          const negLower = negKw.toLowerCase();
          if (t.includes(negLower)) {
            negativeMatches.push(negKw);
            score -= 10; // Heavy penalty for negative keywords
          }
        }
      }

      // Check must-have words (if defined, gives bonus)
      if (categoryData.mustHaveWords) {
        let hasMustHave = false;
        for (const mustWord of categoryData.mustHaveWords) {
          const mustLower = mustWord.toLowerCase();
          if (t.includes(mustLower)) {
            hasMustHave = true;
            score += 15; // Big bonus for must-have words
            keywordMatches.push(`MUST:${mustWord}`);
            break;
          }
        }
      }

      // Check regular keywords with advanced scoring
      for (const keyword of categoryData.keywords) {
        const kwLower = keyword.toLowerCase();
        const kwWords = kwLower.split(/[\s,.-]+/);

        // Exact phrase match (highest score)
        if (t === kwLower) {
          score += 20;
          keywordMatches.push(`EXACT:${keyword}`);
        }
        // Multi-word phrase match (high score)
        else if (kwWords.length > 1 && t.includes(kwLower)) {
          score += 10;
          keywordMatches.push(`PHRASE:${keyword}`);
        }
        // Single word match with word boundary check (medium score)
        else if (kwWords.length === 1) {
          // Check if the keyword appears as a whole word
          const wordBoundaryRegex = new RegExp(`\\b${kwLower}\\b`, 'i');
          if (wordBoundaryRegex.test(t)) {
            score += 5;
            keywordMatches.push(`WORD:${keyword}`);
          }
          // Partial match (lower score)
          else if (t.includes(kwLower)) {
            score += 2;
            keywordMatches.push(`PARTIAL:${keyword}`);
          }
        }
        // Short keyword in title
        else if (t.includes(kwLower)) {
          score += 3;
          keywordMatches.push(`SHORT:${keyword}`);
        }
      }

      // Word order bonus (if keywords appear in order)
      if (keywordMatches.length > 0) {
        for (const kw of categoryData.keywords) {
          if (t.includes(kw.toLowerCase())) {
            score += 2; // Bonus for keyword presence
          }
        }
      }

      // Apply priority multiplier
      if (score > 0) {
        score *= (categoryData.priority || 1);
      }

      // Track scores for debugging
      debugInfo.scores[categoryName] = {
        score,
        keywordMatches: keywordMatches.slice(0, 5), // Limit for readability
        negativeMatches
      };

      if (score > highestScore) {
        highestScore = score;
        bestMatch = categoryName;
      }
    }

    // Debug logging for development (can be removed in production)
    // console.log(`Categorization for "${title}": ${bestMatch} (score: ${highestScore})`);
    
    return bestMatch;
  },

  /**
   * Batch categorization for multiple products
   * @param {Array} products - Array of product objects with title property
   * @returns {Array} - Array of products with added category
   */
  categorizeBatch(products) {
    return products.map(product => ({
      ...product,
      category: this.categorize(product.title)
    }));
  },

  /**
   * Get category statistics from product list
   * @param {Array} products - Array of products
   * @returns {Object} - Category counts
   */
  getCategoryStats(products) {
    const stats = {};
    products.forEach(product => {
      const cat = product.category || this.categorize(product.title);
      stats[cat] = (stats[cat] || 0) + 1;
    });
    return stats;
  }
};
