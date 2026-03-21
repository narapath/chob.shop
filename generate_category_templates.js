require('dotenv').config();
const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.GEMINI_API_KEY;

const categories = [
    "เสื้อผ้าผู้หญิง", "เสื้อผ้าผู้ชาย", "กระเป๋า", "รองเท้าผู้หญิง", "รองเท้าผู้ชาย",
    "เครื่องประดับ", "นาฬิกาและแว่นตา", "โทรศัพท์มือถือและอุปกรณ์เสริม",
    "คอมพิวเตอร์และแล็ปท็อป", "เครื่องใช้ไฟฟ้าในบ้าน", "กล้องและอุปกรณ์ถ่ายภาพ",
    "เครื่องเสียง", "Gaming และอุปกรณ์เกม", "ความงาม", "สุขภาพ", "ผลิตภัณฑ์ดูแลผิว",
    "บ้านและสวน", "เครื่องใช้ในบ้าน", "อาหารและเครื่องดื่ม", "ของเล่น สินค้างานอดิเรก",
    "แม่และเด็ก", "เสื้อผ้าเด็ก", "กีฬาและกิจกรรมกลางแจ้ง", "การเดินทางและกระเป๋าเดินทาง",
    "สัตว์เลี้ยง", "ยานยนต์", "หนังสือและสื่อบันเทิง", "ตั๋วและบัตรกำนัล",
    "เครื่องเขียนและอุปกรณ์สำนักงาน", "อื่นๆ"
];

const outputFile = 'category_templates.json';
let existingTemplates = {};

// Load existing templates if any to allow resuming
if (fs.existsSync(outputFile)) {
    try {
        existingTemplates = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
    } catch(e) {
        console.log("Could not parse existing file, starting fresh.");
    }
}

function delay(ms) {
    return new Promise(res => setTimeout(res, ms));
}

async function generateForCategory(category) {
    const prompt = `คุณคือนักการตลาดออนไลน์และนักรีวิวสาย "ป้ายยา" ตัวแม่ระดับท็อป 
โจทย์ของคุณคือสร้าง Template สำหรับโปรโมทสินค้าในหมวดหมู่ "${category}" จำนวน 10 รูปแบบ! 
โดยทั้ง 10 รูปแบบต้อง "แตกต่างกันอย่างสิ้นเชิง" ทั้งสไตล์การเขียน อารมณ์ และความยาว เพื่อให้ลูกเพจไม่รู้สึกว่าซ้ำซากจำเจ

ในทุกๆ Template "ต้องมี" ตัวแปร 2 ตัวนี้เสมอ:
1. {title} - สำหรับแทนชื่อสินค้า
2. {price} - สำหรับแทนราคาสินค้า

ตัวอย่างความแตกต่างของสไตล์ (กรุณาประยุกต์ให้เข้ากับหมวดหมู่ "${category}"):
- สไตล์ที่ 1: สายฮาร์ดเซลล์ โปรเดือด ราคาเร้าใจ
- สไตล์ที่ 2: สายรีวิวการใช้งานจริง เล่าปัญหาและวิธีแก้
- สไตล์ที่ 3: สายมินิมอล กระชับ อ่านปุ๊บรู้เรื่อง
- สไตล์ที่ 4: สไตล์เพื่อนป้ายยาเพื่อน เม้ามอยสนุกสนาน
- สไตล์ที่ 5: สไตล์พรีเมียม หรูหรา เน้นคุณภาพ
และอื่นๆ (เช่น แจ้งพิกัดลับ, แนะนำของขวัญ, คำต้องห้ามพลาด, ฯลฯ)

ใส่ Emoji ให้สวยงามและเหมาะสมในทุกๆ Template 

สร้างเป็น JSON Array เท่านั้น โดยแต่ละ element เป็น String ตามรูปแบบตัวอย่างนี้:
[
  "กรี๊ดดด! ไม่คิดว่า {title} จะดีขนาดนี้ ใช้งานจริงตอบโจทย์มากแม่ ราคาแค่ ฿{price} ไปตำด่วน!",
  "ใครกำลังมองหาไอเท็มเด็ดในหมวดนี้ ต้องตัวนี้เลย {title} ดีไซน์พรีเมียม สไตล์ลูกคุณ ในราคาเพียง ฿{price}",
  "พิกัดของดีมาแล้วฮะ 😎 {title} ฟังก์ชันครบ จบในตัวเดียว ค่าตัวน้อง ฿{price} คุ้มกว่านี้ไม่มีอีกแล้ว"
]

ข้อควรระวัง: 
- ตอบกลับเฉพาะโค้ด JSON Array ของ String 10 รายการเท่านั้น ห้ามมีคำบรรยายอื่นๆ เพิ่มเติมและไม่ต้องมี Markdown Code Block (เช่น \`\`\`json)
- เช็คให้มั่นใจว่าแต่ละข้อมีอารมณ์และสไตล์ที่ไม่ซ้ำกันเลย เพื่อความหลายหลายขั้นสุด`;

    try {
        const response = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
            {
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { 
                    response_mime_type: "application/json",
                    temperature: 0.9 // Higher temperature for more variety
                }
            }
        );

        const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (aiText) {
             let cleanText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
             const parsed = JSON.parse(cleanText);
             if (Array.isArray(parsed) && parsed.length >= 8) {
                 return parsed;
             }
        }
    } catch (err) {
        console.error(`⚠️ Error generating for ${category}:`, err?.response?.data || err.message);
    }
    return null;
}

async function main() {
    if (!API_KEY) {
        console.error("GEMINI_API_KEY environment variable is missing.");
        return;
    }

    let changed = false;

    for (const category of categories) {
        if (existingTemplates[category] && existingTemplates[category].length >= 8) {
            console.log(`✅ Skipping '${category}' - Already has ${existingTemplates[category].length} templates.`);
            continue;
        }

        console.log(`⏳ Generating 10 templates for '${category}'...`);
        const templates = await generateForCategory(category);
        
        if (templates) {
            existingTemplates[category] = templates;
            changed = true;
            console.log(`   -> Success! Fetched ${templates.length} formats.`);
            
            // Save intermediately so we don't lose progress on crash
            fs.writeFileSync(outputFile, JSON.stringify(existingTemplates, null, 2), 'utf8');
        } else {
            console.log(`   -> Failed. Will try again later if re-run.`);
        }

        // To avoid rate limiting
        await delay(2000); 
    }

    if (changed) {
        console.log(`\n🎉 All done! Saved to ${outputFile}`);
    } else {
        console.log(`\n✨ All categories were already complete.`);
    }
}

main();
