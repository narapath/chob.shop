/**
 * SEO Utility Logic - Local Data AI Engine
 * Generates SEO Content (Title, Keywords & Meta) without external APIs.
 */

const STOP_WORDS = [
    'ของแท้', 'พร้อมส่ง', 'ราคาถูก', 'ส่งฟรี', 'ด่วน', 'มีโค้ด', 'ลดราคา', 'แท้',
    '100%', 'รีวิว', 'ดีที่สุด', 'แนะนำ', 'ยอดนิยม', 'shopee', 'lazada', 'tiktok',
    'the', 'is', 'at', 'which', 'on', 'for', 'a', 'an', 'and', 'with', 'in'
];

/**
 * Generate SEO Content locally
 */
function generateLocalSEO(title, categoryPath, price) {
    if (!title) return { seo_title: '', seo_description: '', seo_keywords: [] };

    const parts = categoryPath ? categoryPath.split('>') : [];
    const majorCategory = parts[0] ? parts[0].trim() : 'ทั่วไป';
    const subCategory = parts[1] ? parts[1].trim() : majorCategory;

    // 1. Clean Title & Extract Keywords
    const cleanTitle = title.replace(/[\[\]\(\)\-\|\,\.\/\!\@\#\$\%\^\&\*]/g, ' ').trim();
    let words = cleanTitle.split(/\s+/).filter(w => w.length > 1 && !STOP_WORDS.includes(w.toLowerCase()));

    let keywords = [...new Set(words)];
    if (subCategory !== 'ทั่วไป') keywords.unshift(subCategory);
    if (majorCategory !== 'ทั่วไป' && majorCategory !== subCategory) keywords.unshift(majorCategory);

    // Add phrases
    if (words.length >= 2) keywords.push(`${words[0]} ${words[1]}`);
    if (words.length >= 3) keywords.push(`${words[0]} ${words[1]} ${words[2]}`);

    const finalKeywords = keywords.slice(0, 15);

    // 2. Optimized SEO Title
    let seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;

    // 3. SEO Meta Description using Local "AI" Knowledge
    const numPrice = parseFloat(price) || 0;
    const tone = getCategoryTone(majorCategory, subCategory);
    const templates = getTemplates(tone);

    const randomIndex = Math.floor(Math.random() * templates.length);
    const template = templates[randomIndex];

    const seoDescription = template
        .replace(/{title}/g, title)
        .replace(/{price}/g, numPrice > 0 ? numPrice.toLocaleString() : 'ราคาพิเศษ')
        .replace(/{sub}/g, subCategory)
        .replace(/{major}/g, majorCategory);

    return {
        seo_title: seoTitle,
        seo_description: seoDescription,
        seo_keywords: finalKeywords
    };
}

/**
 * Identify tone based on hierarchical category
 */
function getCategoryTone(major, sub) {
    const combined = `${major} ${sub}`.toLowerCase();

    if (combined.includes('ความงาม') || combined.includes('แต่งหน้า') || combined.includes('ผิว')) return 'beauty';
    if (combined.includes('แฟชั่น') || combined.includes('เสื้อผ้า') || combined.includes('เครื่องประดับ')) return 'fashion';
    if (combined.includes('อิเล็ก') || combined.includes('มือถือ') || combined.includes('คอม') || combined.includes('กล้อง')) return 'tech';
    if (combined.includes('อาหาร') || combined.includes('ขนม')) return 'food';
    if (combined.includes('ยานยนต์') || combined.includes('รถ')) return 'auto';
    if (combined.includes('สุขภาพ') || combined.includes('อาหารเสริม')) return 'health';
    if (combined.includes('บ้าน') || combined.includes('ครัว') || combined.includes('เฟอร์นิเจอร์')) return 'home';
    if (combined.includes('เด็ก') || combined.includes('แม่')) return 'baby';
    if (combined.includes('กีฬา') || combined.includes('กิจกรรม')) return 'sport';

    return 'general';
}

/**
 * Premium SEO Templates based on tone
 */
function getTemplates(tone) {
    const dict = {
        beauty: [
            `{title} ตัวช่วยความงามที่สาวๆ ต้องมี ในหมวด {sub} คุณภาพระดับพรีเมียม ราคาเพียง {price} บาท ช้อปเลยที่ ChobShop`,
            `ยกระดับความสวยด้วย {title} จากกลุ่ม {sub} เหมาะสำหรับทุกสภาพผิว ราคาดีที่สุด {price} บาท ส่งตรงถึงบ้านคุณ`,
            `{title} สินค้าขายดีในหมวด {major} ช่วยให้คุณดูดีมีออร่า ในราคาเพียง {price} บาท การันตีของแท้ 100%`
        ],
        fashion: [
            `{title} แฟชั่นสุดล้ำสไตล์ {sub} เนื้อผ้าดี สวมใส่สบาย แมตช์ได้ทุกลุค ราคาพิเศษ {price} บาท เท่านั้น`,
            `อัปเดตเทรนด์ใหม่กับ {title} หมวด {major} ดีไซน์ทันสมัย ใส่แล้วปัง ราคาคุ้มค่า {price} บาท ที่ ChobShop`,
            `{title} ไอเมทแฟชั่นที่ต้องมีในตู้เสื้อผ้า จากกลุ่ม {sub} สวยครบจบในหนึ่งเดียว ราคา {price} บาท`
        ],
        tech: [
            `{title} อุปกรณ์ไอทีสเปกแรงในหมวด {sub} ใช้งานลื่นไหล ฟีเจอร์ครบ ราคาเพียง {price} บาท คุ้มค่าที่สุด`,
            `สัมผัสเทคโนโลยีใหม่ล่าสุดกับ {title} กลุ่ม {major} ดีไซน์ทันสมัย แข็งแรงทนทาน ราคา {price} บาท`,
            `{title} ตอบโจทย์ทุกการใช้งานในหมวด {sub} ประสิทธิภาพสูง การันตีคุณภาพ ราคาพิเศษ {price} บาท`
        ],
        food: [
            `{title} ความอร่อยที่คุณต้องลอง ในหมวด {sub} สะอาด ปลอดภัย รสชาติถูกปาก ราคาเพียง {price} บาท`,
            `เติมเต็มความสุขด้วย {title} จากกลุ่ม {major} คัดสรรวัตถุดิบอย่างดี ราคาคุ้มค่า {price} บาท ช้อปเลย`,
            `{title} เมนูยอดฮิตในหมวด {sub} สดใหม่ พร้อมส่งถึงมือคุณ ในราคาเพียง {price} บาท`
        ],
        auto: [
            `{title} อุปกรณ์ดูแลรถยนต์ระดับมืออาชีพ ในหมวด {sub} ช่วยให้รถคุณดูใหม่เสมอ ราคาเพียง {price} บาท`,
            `เสริมสมรรถนะรถคุณด้วย {title} จากกลุ่ม {major} แข็งแรง ทนทาน มาตรฐานสากล ราคา {price} บาท`,
            `{title} อะไหล่คุณภาพสำหรับ {sub} ติดตั้งง่าย ใช้งานยาวนาน ราคาพิเศษ {price} บาท ที่ ChobShop`
        ],
        health: [
            `ดูแลสุขภาพของคุณด้วย {title} ในหมวด {sub} ตัวช่วยฟื้นฟูร่างกาย ปลอดภัย ราคาเพียง {price} บาท`,
            `{title} ผลิตภัณฑ์เสริมอาหารยอดนิยมจากกลุ่ม {major} เพื่อสุขภาพที่ดีกว่าเดิม ราคา {price} บาท`,
            `{title} ตอบโจทย์คนรักสุขภาพในหมวด {sub} สารสกัดเข้มข้น คุณภาพไว้วางใจได้ ราคา {price} บาท`
        ],
        home: [
            `{title} ของใช้ในบ้านดีไซน์สวย ในหมวด {sub} ช่วยให้ชีวิตคุณง่ายขึ้น ราคาเพียง {price} บาท คุ้มค่ามาก`,
            `ตกแต่งบ้านให้น่าอยู่ด้วย {title} จากกลุ่ม {major} วัสดุคุณภาพดี ทนทาน ราคา {price} บาท ที่ ChobShop`,
            `{title} ไอเทมคู่บ้านในหมวด {sub} สไตล์มินิมอล ใช้งานสะดวก ราคาพิเศษ {price} บาท`
        ],
        baby: [
            `{title} สินค้าแม่และเด็กคุณภาพเยี่ยม ในหมวด {sub} ปลอดภัยต่อลูกน้อย ราคาเพียง {price} บาท`,
            `คัดสรรสิ่งที่ดีที่สุดให้ลูกคุณด้วย {title} จากกลุ่ม {major} นุ่มสบาย ไม่ระคายเคือง ราคา {price} บาท`,
            `{title} ตัวช่วยคุณแม่มือใหม่ในหมวด {sub} ใช้งานง่าย ทนทาน ราคาพิเศษ {price} บาท`
        ],
        sport: [
            `{title} อุปกรณ์กีฬาและกิจกรรมกลางแจ้ง ในหมวด {sub} แข็งแรง ทนทาน ราคาเพียง {price} บาท`,
            `ฟิตร่างกายให้พร้อมกับ {title} จากกลุ่ม {major} เหมาะสำหรับนักกีฬาทุกระดับ ราคา {price} บาท`,
            `{title} ไอเทมยอดฮิตสำหรับคนรักการออกกำลังกายในหมวด {sub} ราคาพิเศษ {price} บาท`
        ],
        general: [
            `{title} สินค้าคุณภาพดีในหมวด {major} ใช้งานสะดวก ตอบโจทย์ทุกไลฟ์สไตล์ ราคาคุ้มค่า {price} บาท`,
            `ช้อปเลย {title} จากกลุ่ม {sub} ของแท้แน่นอน ส่งไว ราคาเพียง {price} บาท ที่ ChobShop`,
            `{title} สินค้ายอดนิยมประจำสัปดาห์ในหมวด {major} ราคาพิเศษ {price} บาท ห้ามพลาด!`
        ]
    };
    return dict[tone] || dict.general;
}

module.exports = {
    generateLocalSEO
};
