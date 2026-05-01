/**
 * SEO Utility Logic
 */

function generateLocalSEO(title, category, price) {
    if (!title) return { seo_title: '', seo_description: '', seo_keywords: [] };

    const cleanTitle = title.replace(/[\[\]\(\)\-\|\,\.\/]/g, ' ').trim();
    let words = cleanTitle.split(/\s+/).filter(w => w.length > 0);
    const stopWords = ['ของแท้', 'พร้อมส่ง', 'ราคาถูก', 'ส่งฟรี', 'ด่วน', 'มีโค้ด', 'ลดราคา', 'แท้'];

    let keywords = words.filter(word => word.length > 2 && !stopWords.includes(word));
    if (category) keywords.push(category);
    if (words.length >= 2) keywords.push(`${words[0]} ${words[1]}`);
    if (words.length >= 3) keywords.push(`${words[0]} ${words[1]} ${words[2]}`);
    const finalKeywords = [...new Set(keywords)].slice(0, 10);

    const seoTitle = title.length > 60 ? title.substring(0, 57) + "..." : title;
    const numPrice = parseFloat(price) || 0;
    const categoryTone = getCategoryTone(category);
    const reviewTemplates = getReviewTemplates(categoryTone);

    const randomIndex = Math.floor(Math.random() * reviewTemplates.length);
    const template = reviewTemplates[randomIndex];

    const seoDescription = template
        .replace(/{title}/g, title)
        .replace(/{price}/g, numPrice.toLocaleString())
        .replace(/{category}/g, category || 'สินค้าดีๆ');

    return {
        seo_title: seoTitle,
        seo_description: seoDescription,
        seo_keywords: finalKeywords
    };
}

function getCategoryTone(category) {
    if (!category) return 'general';
    const catLower = category.toLowerCase();
    if (catLower.includes('แฟชั่น') || catLower.includes('เสื้อผ้า') || catLower.includes('กระเป๋า') || catLower.includes('รองเท้า')) return 'fashion';
    if (catLower.includes('อิเล็ก') || catLower.includes('มือถือ') || catLower.includes('คอม') || catLower.includes('กล้อง') || catLower.includes('เครื่องเสียง')) return 'tech';
    if (catLower.includes('ความงาม') || catLower.includes('สุขภาพ') || catLower.includes('ผิว')) return 'beauty';
    if (catLower.includes('บ้าน') || catLower.includes('เครื่องใช้') || catLower.includes('สวน')) return 'home';
    if (catLower.includes('แม่และเด็ก') || catLower.includes('เด็ก') || catLower.includes('ของเล่น')) return 'baby';
    if (catLower.includes('กีฬา') || catLower.includes('ท่องเที่ยว') || catLower.includes('กลางแจ้ง')) return 'sport';
    if (catLower.includes('อาหาร') || catLower.includes('เครื่องดื่ม')) return 'food';
    return 'general';
}

function getReviewTemplates(tone) {
    const templates = {
        fashion: [
            `{title} - เสื้อผ้าแฟชั่น สวมใส่สบาย วัสดุดี ราคานี้แค่ {price} บาท คุ้มค่า ใช้งานได้ในชีวิตประจำวัน`,
            `{title} - เสื้อผ้าสไตล์ทันสมัย ใส่สบาย วัสดุคุณภาพดี ราคา {price} บาท เหมาะใส่ไปทำงานหรือเที่ยว`,
            `{title} - แฟชั่นใส่สบาย วัสดุนุ่ม ไม่ร้อน ราคานี้ {price} บาท คุ้มค่า เหมาะใส่ทุกวัน`,
            `{title} - เสื้อผ้าแฟชั่น 做工ดี สีตรงภาพ ราค {price} บาท ใส่ได้หลายโอกาส`,
            `{title} - เสื้อผ้าสไตล์เกาหลี ใส่สบาย วัสดุดี ราคานี้ {price} บาท คุ้มค่า`,
            `{title} - แฟชั่นลำลอง ใส่สบาย วัสดุ breathable ราค {price} บาท เหมาะอากาศเมืองไทย`,
            `{title} - เสื้อผ้าใส่สบาย 做工เรียบร้อย ราค {price} บาท เหมาะใส่ทำงานหรือเที่ยว`,
            `{title} - แฟชั่นสวยเรียบง่าย วัสดุดี ราคานี้ {price} บาท คุ้มค่า`,
            `{title} - เสื้อผ้าสไตล์มินิมอล ใส่สบาย ราค {price} บาท เหมาะทุกวัย`,
            `{title} - แฟชั่นใส่ได้ทุกวัน วัสดุดี 做工ดี ราค {price} บาท`,
        ],
        tech: [
            `{title} - อุปกรณ์ไอที ใช้งานง่าย ฟีเจอร์ครบ ราคานี้แค่ {price} บาท คุ้มค่า`,
            `{title} - Gadget เทคโนโลยีใหม่ ใช้งานสะดวก ราค {price} บาท เหมาะใช้ในชีวิตประจำวัน`,
            `{title} - อุปกรณ์อิเล็กทรอนิกส์ 做工ดี ใช้งานลื่นไหล ราค {price} บาท`,
            `{title} - อุปกรณ์ไอทีคุณภาพดี ใช้งานง่าย ฟีเจอร์ครบ ราค {price} บาท`,
            `{title} - Gadget ใช้งานสะดวก พกพาง่าย ราค {price} บาท เหมาะคนยุคใหม่`,
            `{title} - อุปกรณ์เทคโนโลยี 做工ละเอียด ใช้งานดี ราค {price} บาท`,
            `{title} - อุปกรณ์ไอทีราคาประหยัด ใช้งานดี ฟีเจอร์ครบ ราค {price} บาท`,
            `{title} - Gadget คุณภาพดี ใช้งานง่าย ราค {price} บาท คุ้มค่า`,
            `{title} - อุปกรณ์อิเล็กทรอนิกส์ ใช้งานลื่นไหล ราค {price} บาท`,
            `{title} - อุปกรณ์ไอที做工ดี ใช้งานสะดวก ราค {price} บาท`,
        ],
        beauty: [
            `{title} - เครื่องสำอาง ใช้งานง่าย ให้ผลลัพธ์ดี ราคานี้แค่ {price} บาท`,
            `{title} - สกินแคร์บำรุงผิว ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องสำอางคุณภาพดี ใช้งานง่าย ราค {price} บาท เหมาะใช้ทุกวัน`,
            `{title} - สกินแคร์ผิวหน้า ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องสำอางแบรนด์ดัง ใช้งานดี ราค {price} บาท คุ้มค่า`,
            `{title} - สกินแคร์บำรุงผิวหน้า ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องสำอางให้สีสวย ใช้งานง่าย ราค {price} บาท`,
            `{title} - สกินแคร์ผิวใส ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องสำอางติดทน ใช้งานง่าย ราค {price} บาท`,
            `{title} - สกินแคร์ลดริ้วรอย ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
        ],
        home: [
            `{title} - ของใช้ในบ้าน ใช้งานสะดวก วัสดุดี ราคานี้แค่ {price} บาท`,
            `{title} - อุปกรณ์จัดเก็บของ ใช้งานง่าย ประหยัดพื้นที่ ราค {price} บาท`,
            `{title} - ของใช้ในบ้านคุณภาพดี ใช้งานสะดวก ราค {price} บาท`,
            `{title} - อุปกรณ์ครัว ใช้งานง่าย วัสดุดี ราค {price} บาท`,
            `{title} - ของใช้ในบ้าน做工ดี ใช้งานสะดวก ราค {price} บาท`,
            `{title} - อุปกรณ์จัดบ้าน ใช้งานง่าย ราค {price} บาท คุ้มค่า`,
            `{title} - ของใช้ในบ้านสไตล์มินิมอล ใช้งานดี ราค {price} บาท`,
            `{title} - อุปกรณ์ในบ้าน ใช้งานสะดวก วัสดุดี ราค {price} บาท`,
            `{title} - ของใช้做工ดี ใช้งานง่าย ราค {price} บาท`,
            `{title} - อุปกรณ์ใช้ในบ้าน ใช้งานสะดวก ราค {price} บาท`,
        ],
        baby: [
            `{title} - สินค้าแม่และเด็ก ใช้งานสะดวก ปลอดภัย ราคานี้แค่ {price} บาท`,
            `{title} - อุปกรณ์เด็กเล็ก ใช้งานง่าย วัสดุนุ่ม ปลอดภัย ราค {price} บาท`,
            `{title} - สินค้าสำหรับเด็ก ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - อุปกรณ์แม่และเด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
            `{title} - สินค้าเด็กอ่อน ใช้งานสะดวก วัสดุดี ปลอดภัย ราค {price} บาท`,
            `{title} - อุปกรณ์เด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
            `{title} - สินค้าแม่และเด็กคุณภาพดี ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - อุปกรณ์เด็กเล็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
            `{title} - สินค้าสำหรับเด็ก ใช้งานสะดวก ปลอดภัย ราค {price} บาท`,
            `{title} - อุปกรณ์แม่และเด็ก ใช้งานง่าย ปลอดภัย ราค {price} บาท`,
        ],
        sport: [
            `{title} - อุปกรณ์กีฬา ใช้งานดี ทนทาน ราคานี้แค่ {price} บาท`,
            `{title} - อุปกรณ์ออกกำลังกาย ใช้งานง่าย วัสดุดี ราค {price} บาท`,
            `{title} - อุปกรณ์กีฬาคุณภาพดี ใช้งานทนทาน ราค {price} บาท`,
            `{title} - อุปกรณ์ฟิตเนส ใช้งานง่าย ราค {price} บาท`,
            `{title} - อุปกรณ์กีฬา做工ดี ใช้งานทนทาน ราค {price} บาท`,
            `{title} - อุปกรณ์ออกกำลังกาย ใช้งานดี ราค {price} บาท`,
            `{title} - อุปกรณ์กีฬา ใช้งานสะดวก ราค {price} บาท`,
            `{title} - อุปกรณ์กีฬาคุณภาพ ใช้งานทนทาน ราค {price} บาท`,
            `{title} - อุปกรณ์ออกกำลังกาย ใช้งานง่าย ราค {price} บาท`,
            `{title} - อุปกรณ์กีฬา ใช้งานดี วัสดุดี ราค {price} บาท`,
        ],
        food: [
            `{title} - อาหารและเครื่องดื่ม รสชาติอร่อย ปลอดภัย ราคานี้แค่ {price} บาท`,
            `{title} - ขนมอร่อย วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
            `{title} - อาหารสำเร็จรูป รสชาติดี ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องดื่มอร่อย วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
            `{title} - ขนมรสชาติดี ปลอดภัย ราค {price} บาท`,
            `{title} - อาหารอร่อย วัตถุดิบสดใหม่ ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องดื่มคุณภาพดี ปลอดภัย ราค {price} บาท`,
            `{title} - ขนมรสชาติอร่อย ปลอดภัย ราค {price} บาท`,
            `{title} - อาหารรสชาติดี วัตถุดิบคุณภาพ ปลอดภัย ราค {price} บาท`,
            `{title} - เครื่องดื่มอร่อย ปลอดภัย ราค {price} บาท`,
        ],
        general: [
            `{title} - สินค้าคุณภาพดี ใช้งานสะดวก ราคานี้แค่ {price} บาท คุ้มค่า`,
            `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท เหมาะใช้ในชีวิตประจำวัน`,
            `{title} - สินค้าคุณภาพ ใช้งานสะดวก ราค {price} บาท คุ้มค่า`,
            `{title} - สินค้าใช้งานดี วัสดุดี ราค {price} บาท`,
            `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท`,
            `{title} - สินค้าคุณภาพดี ใช้งานสะดวก ราค {price} บาท`,
            `{title} - สินค้าใช้งานดี คุ้มค่า ราค {price} บาท`,
            `{title} - สินค้า做工ดี ใช้งานง่าย ราค {price} บาท`,
            `{title} - สินค้าคุณภาพ ใช้งานสะดวก ราค {price} บาท`,
            `{title} - สินค้าใช้งานดี วัสดุดี ราค {price} บาท`,
        ],
    };
    return templates[tone] || templates.general;
}

module.exports = {
    generateLocalSEO
};
