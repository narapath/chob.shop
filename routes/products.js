const express = require('express');
const router = express.Router();
const fs = require('fs');
const { supabase, supabaseAdmin } = require('../lib/supabase');
const { requireAuth } = require('./auth');
const { generateLocalSEO } = require('../lib/seo');
const { notifyGoogleIndexing, notifyBulkIndexing } = require('../indexingService');
const {
    postToFacebook, postToInstagram, postToX, postToThreads,
    deleteFromFacebook, deleteFromX, generateAICaption, postToFacebookGroups
} = require('../socialMedia');

const categoryMapper = require('../js/categories');

// ฟังก์ชันวิเคราะห์หมวดหมู่แบบ Local โดยใช้ Advanced Keywords
function generateLocalCategory(title) {
    return categoryMapper.categorize(title);
}

// GET all products
router.get('/', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase is not configured yet.' });
        const { page, limit, category, search, lite } = req.query;
        const isLite = lite === 'true';

        // Use targeted selection for lite mode to reduce payload
        const selector = isLite
            ? 'id, title, price, original_price, image, category, date, affiliate_url, facebook_post_id, twitter_post_id'
            : '*';

        let query = supabase.from('products').select(selector, { count: 'exact' }).order('date', { ascending: false });

        if (category && category !== 'all' && category !== 'ทั้งหมด') {
            query = query.eq('category', category);
        }

        if (search) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        }

        if (page && limit) {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 20;
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum - 1;

            query = query.range(startIndex, endIndex);
            const { data, error, count } = await query;
            if (error) throw error;

            const mappedData = data.map(p => ({
                ...p,
                originalPrice: p.original_price,
                affiliateUrl: p.affiliate_url,
                facebookPostId: p.facebook_post_id,
                twitterPostId: p.twitter_post_id,
                ratingValue: p.rating_value,
                reviewCount: p.review_count,
                salesCount: p.sales_count
            }));

            return res.json({
                products: mappedData,
                total: count,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil((count || 0) / limitNum)
            });
        }

        // Unpaginated fetch in chunks
        const { count: totalCount, error: countError } = await query.limit(1);
        if (countError) throw countError;

        if (!totalCount || totalCount === 0) return res.json({ products: [], total: 0 });

        let allData = [];
        let from = 0;
        const chunkSize = 800;

        while (true) {
            let chunkQuery = supabase.from('products').select(selector);
            if (category && category !== 'all' && category !== 'ทั้งหมด') chunkQuery = chunkQuery.eq('category', category);
            if (search) chunkQuery = chunkQuery.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

            const { data: chunk, error: chunkError } = await chunkQuery
                .order('date', { ascending: false })
                .range(from, from + chunkSize - 1);

            if (chunkError) throw chunkError;
            if (!chunk || chunk.length === 0) break;

            allData = allData.concat(chunk);
            if (chunk.length < chunkSize) break;
            from += chunkSize;
        }

        const mappedData = allData.map(p => ({
            ...p,
            originalPrice: p.original_price,
            affiliateUrl: p.affiliate_url,
            facebookPostId: p.facebook_post_id,
            twitterPostId: p.twitter_post_id,
            ratingValue: p.rating_value,
            reviewCount: p.review_count,
            salesCount: p.sales_count
        }));

        res.json({ products: mappedData, total: totalCount || mappedData.length });
    } catch (err) {
        console.error('Failed to read products:', err);
        res.status(500).json({ error: 'Failed to read products', detail: err.message });
    }
});

// Note: Categories count was moved to a separate mount point if needed.
// For now, let's keep it here but realize it might be hit as /api/products/categories/count

// GET AI caption for a product
router.get('/:id/ai-caption', async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });

        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !product) return res.status(404).json({ error: 'Product not found' });

        const caption = await generateAICaption(product);
        res.json({ success: true, caption });
    } catch (err) {
        console.error('AI Caption API Error:', err);
        res.status(500).json({ error: 'Failed to generate AI caption' });
    }
});

// POST a new product
router.post('/', requireAuth, async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        const date = new Date().toISOString();

        const newProduct = {
            id,
            title: req.body.title || 'Untitled Product',
            price: req.body.price || '0',
            original_price: req.body.originalPrice || null,
            discount: req.body.discount || null,
            image: req.body.image || '',
            affiliate_url: req.body.affiliateUrl || '',
            category: (req.body.category && req.body.category !== 'ทั่วไป') ? req.body.category : generateLocalCategory(req.body.title || ''),
            description: req.body.description || '',
            clicks: 0,
            date,
            facebook_post_id: '',
            twitter_post_id: '',
            seo_keywords: [],
            seo_description: '',
            seo_title: req.body.seo_title || '',
            commission: req.body.commission || 0
        };

        // --- DYNAMIC COLUMN DETECTION ---
        const { data: colCheck, error: colError } = await supabaseAdmin.from('products').select('*').limit(0);
        const existingColumns = colError ? [] : Object.keys(colCheck || {});
        const hasCol = (name) => existingColumns.length === 0 || existingColumns.includes(name);

        if (hasCol('rating_value')) newProduct.rating_value = req.body.ratingValue || 0;
        if (hasCol('review_count')) newProduct.review_count = req.body.reviewCount || 0;
        if (hasCol('sales_count')) newProduct.sales_count = req.body.salesCount || 0;

        if (req.body.toggleAI) {
            const seoData = generateLocalSEO(newProduct.title, newProduct.category, newProduct.price);
            newProduct.seo_keywords = seoData.seo_keywords;
            newProduct.seo_description = seoData.seo_description;
            newProduct.seo_title = seoData.seo_title;
        }

        const { error } = await supabaseAdmin.from('products').insert([newProduct]);
        if (error) throw error;

        const siteUrl = process.env.SITE_URL || 'https://chob.shop';
        notifyGoogleIndexing(`${siteUrl}/?productId=${newProduct.id}`).catch(e => console.error('Indexing notify error:', e.message));

        res.json({ success: true, product: newProduct });
    } catch (err) {
        console.error("Failed to add product:", err);
        res.status(500).json({ error: 'Failed to add product', detail: err.message });
    }
});

// BULK POST
router.post('/bulk', requireAuth, async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { items, autoPostFB, autoPostIG, autoPostX, autoPostThreads } = req.body;
        const shouldPost = autoPostFB || autoPostIG || autoPostX || autoPostThreads;

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Expected an array of products' });
        }

        // --- DYNAMIC COLUMN DETECTION ---
        // We check what columns actually exist to avoid crash if schema is out of sync
        const { data: colCheck, error: colError } = await supabaseAdmin.from('products').select('*').limit(0);
        const existingColumns = colError ? [] : Object.keys(colCheck || {});
        const hasCol = (name) => existingColumns.length === 0 || existingColumns.includes(name);

        const itemsToAdd = items.map(p => {
            const seo = (p.seo_description && p.seo_keywords && p.seo_keywords.length > 0)
                ? { seo_keywords: p.seo_keywords, seo_description: p.seo_description, seo_title: p.seo_title }
                : generateLocalSEO(p.title, p.category, p.price);

            const newItem = {
                ...seo,
                title: p.title || 'Untitled Product',
                price: parseFloat(p.price) || 0,
                original_price: p.originalPrice ? parseFloat(p.originalPrice) : null,
                discount: p.discount ? parseInt(p.discount, 10) : null,
                image: p.image || '',
                affiliate_url: p.affiliateUrl || '',
                category: (p.category && p.category !== 'ทั่วไป') ? p.category : generateLocalCategory(p.title || ''),
                description: p.description || '',
                id: p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
                clicks: 0,
                date: new Date().toISOString(),
                facebook_post_id: null,
                twitter_post_id: null,
                commission: p.commission || 0
            };

            // Only add these if they exist in the DB schema
            if (hasCol('rating_value')) newItem.rating_value = p.ratingValue || 0;
            if (hasCol('review_count')) newItem.review_count = p.reviewCount || 0;
            if (hasCol('sales_count')) newItem.sales_count = p.salesCount || 0;

            return newItem;
        });

        const { error: insertError } = await supabaseAdmin.from('products').insert(itemsToAdd);
        if (insertError) throw insertError;

        const siteUrlForIndex = process.env.SITE_URL || 'https://chob.shop';
        const productUrls = itemsToAdd.map(p => `${siteUrlForIndex}/?productId=${p.id}`);
        notifyBulkIndexing(productUrls).catch(e => console.error('Bulk indexing error:', e.message));

        if (shouldPost) {
            // Social media posting in background
            (async () => {
                const siteUrl = process.env.SITE_URL || 'https://chob.shop';
                for (const product of itemsToAdd) {
                    let aiCaption = null;
                    try { aiCaption = await generateAICaption(product); } catch (err) { }

                    let fbPostId = null, xPostId = null;
                    if (autoPostFB) {
                        const res = await postToFacebook(product, siteUrl, true, aiCaption);
                        if (res.success) fbPostId = res.postId;
                    }
                    if (autoPostIG) await postToInstagram(product, siteUrl, true, aiCaption);
                    if (autoPostX) {
                        const res = await postToX(product, siteUrl, true, aiCaption);
                        if (res.success) xPostId = res.tweetId;
                    }
                    if (autoPostThreads) await postToThreads(product, siteUrl, true, aiCaption);

                    if (fbPostId || xPostId) {
                        await supabaseAdmin.from('products').update({ facebookPostId: fbPostId, twitterPostId: xPostId }).eq('id', product.id);
                    }
                    await new Promise(r => setTimeout(r, 2000));
                }
            })();
        }

        res.json({ success: true, count: itemsToAdd.length });
    } catch (err) {
        console.error('Bulk import error:', err);
        res.status(500).json({ error: 'Failed to bulk add products', detail: err.message });
    }
});

// UPDATE
router.put('/:id', requireAuth, async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");
        const updatePayload = { ...req.body };
        if (updatePayload.originalPrice) {
            updatePayload.original_price = updatePayload.originalPrice;
            delete updatePayload.originalPrice;
        }
        if (updatePayload.affiliateUrl) {
            updatePayload.affiliate_url = updatePayload.affiliateUrl;
            delete updatePayload.affiliateUrl;
        }
        if (updatePayload.facebookPostId) {
            updatePayload.facebook_post_id = updatePayload.facebookPostId;
            delete updatePayload.facebookPostId;
        }
        if (updatePayload.twitterPostId) {
            updatePayload.twitter_post_id = updatePayload.twitterPostId;
            delete updatePayload.twitterPostId;
        }
        // --- DYNAMIC COLUMN DETECTION ---
        const { data: colCheck, error: colError } = await supabaseAdmin.from('products').select('*').limit(0);
        const existingColumns = colError ? [] : Object.keys(colCheck || {});
        const hasCol = (name) => existingColumns.length === 0 || existingColumns.includes(name);

        if (updatePayload.ratingValue !== undefined) {
            if (hasCol('rating_value')) updatePayload.rating_value = updatePayload.ratingValue;
            delete updatePayload.ratingValue;
        }
        if (updatePayload.reviewCount !== undefined) {
            if (hasCol('review_count')) updatePayload.review_count = updatePayload.reviewCount;
            delete updatePayload.reviewCount;
        }
        if (updatePayload.salesCount !== undefined) {
            if (hasCol('sales_count')) updatePayload.sales_count = updatePayload.salesCount;
            delete updatePayload.salesCount;
        }
        delete updatePayload.id;

        const { error } = await supabaseAdmin.from('products').update(updatePayload).eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update product', detail: err.message });
    }
});

// DELETE
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', req.params.id).single();

        if (product) {
            if (product.facebook_post_id) deleteFromFacebook(product.facebook_post_id).catch(() => { });
            if (product.twitter_post_id) deleteFromX(product.twitter_post_id).catch(() => { });
        }

        const { error } = await supabaseAdmin.from('products').delete().eq('id', req.params.id);
        if (error) throw error;

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete product', detail: err.message });
    }
});

// BULK DELETE
router.post('/bulk-delete', requireAuth, async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { ids } = req.body;

        const { data: pList } = await supabaseAdmin.from('products').select('*').in('id', ids);
        if (pList) {
            pList.forEach(p => {
                if (p.facebook_post_id) deleteFromFacebook(p.facebook_post_id).catch(() => { });
                if (p.twitter_post_id) deleteFromX(p.twitter_post_id).catch(() => { });
            });
        }

        const { error } = await supabaseAdmin.from('products').delete().in('id', ids);
        if (error) throw error;

        res.json({ success: true, count: ids.length });
    } catch (err) {
        res.status(500).json({ error: 'Failed to bulk delete', detail: err.message });
    }
});

// CLICK
router.post('/:id/click', async (req, res) => {
    try {
        if (!supabase) throw new Error("Supabase is not configured.");
        const { data: product } = await supabaseAdmin.from('products').select('clicks').eq('id', req.params.id).single();
        if (product) {
            const newClicks = (product.clicks || 0) + 1;
            await supabaseAdmin.from('products').update({ clicks: newClicks }).eq('id', req.params.id);
            res.json({ success: true, clicks: newClicks });
        } else {
            res.status(404).json({ error: 'Product not found' });
        }
    } catch (err) {
        res.status(500).json({ error: 'Failed to record click', detail: err.message });
    }
});

// --- POST generate SEO with Local AI for a specific product ---
router.post('/:id/gen-seo', requireAuth, async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        const { data: product, error: fetchError } = await supabaseAdmin.from('products').select('*').eq('id', req.params.id).single();
        if (fetchError || !product) return res.status(404).json({ error: 'Product not found' });

        const seoData = generateLocalSEO(product.title, product.category, product.price);

        const { error: updateError } = await supabaseAdmin.from('products').update({
            seo_keywords: seoData.seo_keywords,
            seo_description: seoData.seo_description,
            seo_title: seoData.seo_title
        }).eq('id', req.params.id);

        if (updateError) throw updateError;

        res.json({ success: true, seo_keywords: seoData.seo_keywords, seo_description: seoData.seo_description });
    } catch (err) {
        console.error('Local SEO Endpoint Error:', err);
        res.status(500).json({ error: 'Failed to generate SEO', detail: err.message });
    }
});

// --- POST generate SEO in bulk with Local AI ---
router.post('/bulk/gen-seo', requireAuth, async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured' });
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) return res.status(400).json({ error: 'Invalid IDs' });

        let successCount = 0;
        let failedCount = 0;

        for (const id of ids) {
            try {
                const { data: product } = await supabaseAdmin.from('products').select('*').eq('id', id).single();
                if (product) {
                    const seoData = generateLocalSEO(product.title, product.category, product.price);
                    await supabaseAdmin.from('products').update({
                        seo_keywords: seoData.seo_keywords,
                        seo_description: seoData.seo_description,
                        seo_title: seoData.seo_title
                    }).eq('id', id);
                    successCount++;
                }
            } catch (e) {
                failedCount++;
            }
        }
        res.json({ success: true, message: `Updated ${successCount} items, ${failedCount} failed.`, successCount, failedCount });
    } catch (err) {
        res.status(500).json({ error: 'Bulk SEO failed', detail: err.message });
    }
});

// --- POST bulk categorize ---
router.post('/bulk/categorize', requireAuth, async (req, res) => {
    try {
        const idsToProcess = req.body.productIds || req.body.ids;
        if (!idsToProcess || !Array.isArray(idsToProcess)) return res.status(400).json({ error: 'Invalid IDs' });

        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        let updatedCount = 0;
        let failedCount = 0;

        for (const id of idsToProcess) {
            try {
                const { data: product } = await supabaseAdmin.from('products').select('title').eq('id', id).single();
                if (product) {
                    const newCategory = generateLocalCategory(product.title);
                    await supabaseAdmin.from('products').update({ category: newCategory }).eq('id', id);
                    updatedCount++;
                }
            } catch (e) {
                failedCount++;
            }
        }
        res.json({ success: true, updatedCount, failedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- POST categorize all ---
router.post('/categorize-all', requireAuth, async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Database not configured' });

        const { data: products, error } = await supabaseAdmin.from('products').select('id, title');
        if (error) throw error;

        let updatedCount = 0;
        for (const product of products) {
            const newCategory = generateLocalCategory(product.title);
            const { error: updateError } = await supabaseAdmin.from('products').update({ category: newCategory }).eq('id', product.id);
            if (!updateError) updatedCount++;
        }

        res.json({ success: true, updatedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /:id/post-groups
 * Trigger posting to Facebook Groups for a specific product.
 */
router.post('/:id/post-groups', requireAuth, async (req, res) => {
    try {
        if (!supabase) return res.status(500).json({ error: 'Supabase is not configured.' });

        const { data: product, error } = await supabase
            .from('products')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error || !product) return res.status(404).json({ error: 'Product not found' });

        const siteUrl = process.env.SITE_URL || 'https://chob.shop';
        const groupsString = process.env.FB_TARGET_GROUPS || '';
        const groupUrls = groupsString.split(',').map(u => u.trim()).filter(Boolean);

        if (groupUrls.length === 0) {
            return res.status(400).json({ reason: 'No Facebook Groups configured in settings.' });
        }

        const aiCaption = await generateAICaption(product);
        const result = await postToFacebookGroups(product, siteUrl, groupUrls, true, aiCaption);

        res.json({ success: true, ...result });
    } catch (err) {
        console.error('Group Post API Error:', err);
        res.status(500).json({ success: false, reason: err.message });
    }
});

module.exports = router;
