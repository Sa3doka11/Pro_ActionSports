
/**
 * ===================================================================
 * Product-Details.js - وظائف خاصة بصفحة تفاصيل المنتج
 * ===================================================================
 * يحتوي على: Load Product Data, Add to Cart, Read More Toggle
 * الصفحة المستخدمة: productDetails.html
 */

(function () {
    "use strict";

    if (typeof window !== 'undefined' && typeof window.marked !== 'undefined' && typeof window.marked.setOptions === 'function') {
        try {
            window.marked.setOptions({ breaks: true, gfm: true });
        } catch (_) {
        }
    }

    const FALLBACK_IMAGE = 'assets/images/product1.png';
    const IMAGE_VALUE_KEYS = [
        'image', 'imageCover', 'image_cover', 'imageUrl', 'image_url', 'imageURL',
        'defaultImage', 'default_image', 'primaryImage', 'mainImage', 'thumbnail',
        'thumb', 'thumbUrl', 'cover', 'media', 'photo', 'picture', 'previewImage',
        'preview', 'gallery', 'productImage', 'images', 'assets'
    ];
    const IMAGE_OBJECT_KEYS = ['secure_url', 'url', 'src', 'path', 'href', 'image', 'imageUrl'];

    function normalizeImageUrl(url) {
        if (!url) return '';
        if (typeof url === 'string') {
            const trimmed = url.trim();
            if (!trimmed) return '';
            if (typeof ensureAbsoluteUrl === 'function') {
                return ensureAbsoluteUrl(trimmed) || trimmed;
            }
            return trimmed;
        }
        return '';
    }

    function collectProductImages(rawProduct = {}) {
        const urls = [];
        const seen = new Set();

        const pushUrl = (value) => {
            if (!value) return;

            if (Array.isArray(value)) {
                value.forEach(item => pushUrl(item));
                return;
            }

            if (typeof value === 'string') {
                const normalized = normalizeImageUrl(value);
                if (normalized && !seen.has(normalized)) {
                    seen.add(normalized);
                    urls.push(normalized);
                }
                return;
            }

            if (typeof value === 'object') {
                IMAGE_OBJECT_KEYS.forEach(key => {
                    if (value && typeof value[key] === 'string') {
                        pushUrl(value[key]);
                    }
                });
            }
        };

        IMAGE_VALUE_KEYS.forEach(key => {
            if (Object.prototype.hasOwnProperty.call(rawProduct, key)) {
                pushUrl(rawProduct[key]);
            }
        });

        if (Array.isArray(rawProduct.images)) {
            rawProduct.images.forEach(img => pushUrl(img));
        }

        const resolver = (typeof window !== 'undefined' && typeof window.resolveProductImage === 'function')
            ? window.resolveProductImage
            : null;
        const primary = resolver ? resolver(rawProduct) : normalizeImageUrl(rawProduct.image) || FALLBACK_IMAGE;
        pushUrl(primary);

        if (!urls.length) {
            urls.push(FALLBACK_IMAGE);
        }

        return urls;
    }
    let currentProduct = null;

    function getCartStateSafe() {
        if (typeof window.getCartStateSafe === 'function') {
            return window.getCartStateSafe();
        }
        if (typeof cartState === 'object' && cartState) {
            return cartState;
        }
        return {
            items: [],
            totals: { subtotal: 0, shipping: 0, total: 0 },
            isLoading: false,
            isLoaded: false
        };
    }

    function ensureCartStateLoaded(force = false) {
        if (typeof window.ensureCartStateLoaded === 'function') {
            return window.ensureCartStateLoaded(force);
        }
        if (typeof refreshCartState === 'function') {
            return refreshCartState(force);
        }
        return Promise.resolve(getCartStateSafe());
    }

    function addProductToCartShared(productId, quantity, payload) {
        if (typeof window.addProductToCartById === 'function') {
            return window.addProductToCartById(productId, quantity, payload);
        }
        if (typeof addProductToCartById === 'function') {
            return addProductToCartById(productId, quantity, payload);
        }
        return Promise.reject(new Error('addProductToCartById is not available'));
    }

    // ================================================================
    // 1. Load Product Data from URL
    // ================================================================
    // Populate product details from API based on id or slug
    async function loadProductData() {
        const productImg = document.getElementById('productImg');
        const productNotFound = document.getElementById('productNotFound');
        const detailsContainer = document.getElementById('productDetailsContainer');
        if (!productImg || !productNotFound || !detailsContainer) return null;

        const urlParams = new URLSearchParams(window.location.search);
        const productId = urlParams.get('id');

        if (!productId) {
            productNotFound.hidden = false;
            detailsContainer.hidden = true;
            return null;
        }

        try {
            const product = await fetchProductById(productId)
                || await fetchProductFromList(productId);

            // ✅ CRITICAL: This page requires a valid product
            // If product not found or invalid, treat as server error
            if (!product || !product.id) {
                throw new Error('PRODUCT_NOT_FOUND');
            }

            currentProduct = product;
            renderProduct(product);
            productNotFound.hidden = true;
            detailsContainer.hidden = false;
            return product;
        } catch (error) {
            // ✅ Auth errors (401/403) should not show popup
            const statusCode = error?.status || 0;
            const isAuthError = statusCode === 401 || statusCode === 403;

            if (!isAuthError) {
                // ✅ For non-auth errors on critical data, show popup
                if (typeof window.showServerErrorPopup === 'function') {
                    window.showServerErrorPopup();
                }
            }

            productNotFound.hidden = false;
            detailsContainer.hidden = true;
            return null;
        }
    }

    // ================================================================
    // 2. Cart Functions
    // ================================================================
    // Add the current product to shared session cart
    async function addToCart(product) {
        if (!product || !product.id) {
            showToast('تعذر إضافة هذا المنتج للسلة.', 'error');
            return;
        }

        try {
            await ensureCartStateLoaded();
            await addProductToCartShared(product.id, 1, {
                name: product.name,
                price: product.price,
                image: product.image,
                installationPrice: Number(product.installationPrice) || 0
            });

            if (typeof window.__actionSportsProductMetadata__?.set === 'function') {
                window.__actionSportsProductMetadata__.set(product.id, {
                    name: product.name,
                    price: product.price,
                    image: product.image
                });
            }

            showToast(`تمت إضافة "${product.name}" إلى السلة!`, 'success');
        } catch (error) {
            showToast(error.message || 'تعذر إضافة المنتج للسلة.', 'error');
        }
    }

    // Reflect cart item count in header badge
    function updateCartCount() {
        const cartCount = document.getElementById('cart-count');
        if (cartCount) {
            let total = 0;
            if (typeof window.getCartItemCount === 'function') {
                total = window.getCartItemCount();
            } else if (typeof getCartItemCount === 'function') {
                total = getCartItemCount();
            } else {
                const state = getCartStateSafe();
                if (Array.isArray(state.items)) {
                    total = state.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                }
            }
            cartCount.textContent = total.toString();
        }
    }

    // Delegate to global toast helper or fallback alert
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            alert(message);
        }
    }

    // ===================================================================
    // XSS PROTECTION: Safe HTML/Text Setting Functions
    // ===================================================================

    /**
     * DOMPurify library integration - sanitizes HTML to prevent XSS
     */
    function sanitizeHtmlContent(html) {
        if (typeof html !== 'string') return '';

        if (typeof window !== 'undefined' && typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'br', 'strong', 'em', 'i', 'u', 'b', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'caption', 'form', 'button', 'input', 'textarea', 'select', 'option', 'label', 'fieldset', 'legend', 'video', 'source', 'audio', 'picture', 'figure', 'figcaption', 'section', 'article', 'nav', 'footer', 'header'],
                ALLOWED_ATTR: ['style', 'class', 'id', 'role', 'data-*', 'href', 'src', 'alt', 'title', 'type', 'name', 'value', 'checked', 'disabled', 'selected', 'action', 'method', 'enctype', 'controls', 'aria-*', 'target', 'rel', 'datetime', 'width', 'height', 'loading', 'poster']
            });
        }

        // If DOMPurify is not available, return empty string for security
        return '';
    }

    /**
     * Safe way to set innerHTML with sanitization
     */
    function safeSetHTML(element, html) {
        if (!element || typeof element.innerHTML === 'undefined') return;
        const sanitized = sanitizeHtmlContent(html);
        element.innerHTML = sanitized;
    }

    /**
     * Safe way to set textContent (no HTML parsing)
     */
    function safeSetText(element, text) {
        if (!element || typeof element.textContent === 'undefined') return;
        element.textContent = typeof text === 'string' ? text : String(text || '');
    }

    // ================================================================
    // 3. Read More Toggle
    // ================================================================
    // Toggle the "additional details" accordion content
    function setupReadMore() {
        const readMoreBtn = document.getElementById('readMoreBtn');
        const additionalDetails = document.getElementById('additionalDetails');

        if (!readMoreBtn || !additionalDetails) {
            return;
        }

        readMoreBtn.addEventListener('click', function (e) {
            e.preventDefault();
            const isShown = additionalDetails.classList.contains('show');

            if (isShown) {
                additionalDetails.classList.remove('show');
                safeSetHTML(readMoreBtn, '<i class="fa fa-chevron-down"></i> قراءة المزيد من التفاصيل');
            } else {
                additionalDetails.classList.add('show');
                safeSetHTML(readMoreBtn, '<i class="fa fa-chevron-up"></i> إخفاء التفاصيل');
                setTimeout(() => {
                    additionalDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
            }
        });
    }

    // ================================================================
    // 4. Setup Add to Cart Button
    // ================================================================
    // Wire     add-to-cart button within details page
    function setupAddToCartButton() {
        const addToCartBtn = document.getElementById('addToCartBtn');
        if (!addToCartBtn) return;

        addToCartBtn.addEventListener('click', function(e) {
            e.preventDefault();

            if (currentProduct) {
                addToCart(currentProduct);
            }
        });
    }

    // ================================================================
    // 5. Initialize on Page Load
    // ================================================================
    async function initProductDetailsPage() {
        // Ensure auth is loaded before initializing product details
        if (typeof ensureAuthUserLoaded === 'function') {
            await ensureAuthUserLoaded(false);
        }

        loadProductData();
        ensureCartStateLoaded()
            .finally(() => {
                updateCartCount();
            });
        setupReadMore();
        setupAddToCartButton();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProductDetailsPage, { once: true });
    } else {
        initProductDetailsPage();
    }

    function renderProduct(product) {
        const productImg = document.getElementById('productImg');
        const productName = document.getElementById('productName');
        const productCategory = document.getElementById('productCategory');
        const productPrice = document.getElementById('productPrice');
        const productDescription = document.getElementById('productDescription');
        const priceValue = productPrice?.querySelector('.price-value');
        const brandDetailSection = document.getElementById('brandDetailSection');
        const productBrandDetail = document.getElementById('productBrandDetail');
        const specsGrid = document.getElementById('specsGrid');
        const usageList = document.getElementById('usageList');
        const deliveryInfo = document.getElementById('deliveryInfo');
        const warrantyInfo = document.getElementById('warrantyInfo');

        const galleryContainer = document.getElementById('productGallery');
        const productImages = Array.isArray(product.images) && product.images.length
            ? product.images
            : [product.image || FALLBACK_IMAGE];
        const primaryImage = productImages[0] || FALLBACK_IMAGE;

        if (productImg) {
            productImg.src = primaryImage;
            productImg.alt = product.name;
            productImg.dataset.activeIndex = '0';
            productImg.dataset.loaded = 'true';
        }

        const detailsContainer = document.getElementById('productDetailsContainer');
        if (detailsContainer) {
            detailsContainer.dataset.loaded = 'true';
        }

        if (galleryContainer) {
            safeSetHTML(galleryContainer, '');
            if (productImages.length > 1) {
                galleryContainer.style.display = 'flex';
            } else {
                galleryContainer.style.display = 'none';
            }

            productImages.forEach((src, index) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'product-thumbnail';
                if (index === 0) {
                    button.classList.add('active');
                }
                const thumbHtml = `<img src="${sanitizeHtmlContent(src)}" alt="${sanitizeHtmlContent(product.name)} - صورة ${index + 1}">`;
                safeSetHTML(button, sanitizeHtmlContent(thumbHtml));
                button.addEventListener('click', () => {
                    if (productImg) {
                        productImg.src = src;
                        productImg.dataset.activeIndex = String(index);
                    }
                    galleryContainer.querySelectorAll('.product-thumbnail').forEach(btn => btn.classList.remove('active'));
                    button.classList.add('active');
                });
                galleryContainer.appendChild(button);
            });
        } else {
            galleryContainer?.querySelectorAll('.skeleton').forEach(el => el.remove());
        }

        if (productName) productName.textContent = product.name;
        if (productCategory) productCategory.textContent = product.categoryName || 'فئة غير محددة';
        if (priceValue) {
            const hasDiscount = Number.isFinite(product.originalPrice) && product.originalPrice > 0
                && Number.isFinite(product.discountPrice) && product.discountPrice > 0
                && product.discountPrice < product.originalPrice;
            const priceMarkup = hasDiscount
                ? `<span class="old-price">${formatPrice(product.originalPrice)}</span><span class="current-price">${formatPrice(product.price)}</span>`
                : `<span class="current-price">${formatPrice(product.price)}</span>`;
            safeSetHTML(priceValue, sanitizeHtmlContent(priceMarkup));
        }
        if (productDescription) {
            productDescription.classList.add('markdown-content');
            const rawDesc = typeof product.description === 'string' ? product.description : '';
            const source = rawDesc ? rawDesc.replace(/\r\n/g, '\n') : '';
            let html = '';
            if (source) {
                if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
                    try {
                        html = window.marked.parse(source);
                    } catch (_) {
                        html = source.replace(/\n/g, '<br>');
                    }
                } else {
                    html = source.replace(/\n/g, '<br>');
                }
            }
            safeSetHTML(productDescription, html || '');
        }

        if (brandDetailSection) {
            const brandName = product.brand?.name || product.brand?.title || product.brandName || product.manufacturer || product.vendor || '';
            if (productBrandDetail) {
                productBrandDetail.textContent = brandName || 'غير متوفر';
            }
            brandDetailSection.hidden = !brandName;
        }

        if (specsGrid) {
            const specsSection = specsGrid.closest('.detail-section');
            if (specsSection) {
                specsSection.style.display = 'none';
            } else {
                safeSetHTML(specsGrid, '');
            }
        }

        if (usageList) {
            safeSetHTML(usageList, '');
            const specsProp = product.specs;
            if (typeof specsProp === 'string' && specsProp.trim()) {
                const li = document.createElement('li');
                li.className = 'usage-spec-item markdown-content';
                const source = specsProp.replace(/\r\n/g, '\n');
                let html = '';
                if (typeof window !== 'undefined' && window.marked && typeof window.marked.parse === 'function') {
                    try {
                        html = window.marked.parse(source);
                    } catch (_) {
                        html = source.replace(/\n/g, '<br>');
                    }
                } else {
                    html = source.replace(/\n/g, '<br>');
                }
                safeSetHTML(li, html);
                usageList.appendChild(li);
            } else {
                const normalizedSpecs = Array.isArray(specsProp)
                    ? specsProp.map(formatSpec).filter(Boolean)
                    : [];

                if (normalizedSpecs.length) {
                    normalizedSpecs.forEach(spec => {
                        const li = document.createElement('li');
                        li.className = 'usage-spec-item';
                        const formattedText = `${spec.label}: ${spec.value}`.replace(/\n/g, '<br>');
                        safeSetHTML(li, formattedText);
                        usageList.appendChild(li);
                    });
                } else {
                    const li = document.createElement('li');
                    li.textContent = 'لا توجد مواصفات تقنية متاحة.';
                    li.classList.add('usage-specs-empty');
                    usageList.appendChild(li);
                }
            }
        }

        if (deliveryInfo) {
            deliveryInfo.textContent = 'التوصيل والتركيب يتم خلال 3 إلى 10 أيام.';
        }

        if (warrantyInfo) {
            safeSetHTML(warrantyInfo, `
                <p>
                    للتواصل مع خدمة العملاء، تفضل بزيارة
                    <a href="./index.html#contact-us" class="contact-link">قسم تواصل معنا</a>.
                </p>
            `);
        }

        applyDetailInlineFormatting();
    }

    function formatPrice(value) {
        const number = Number(value);
        if (Number.isNaN(number)) return value;
        return number.toLocaleString('ar-EG');
    }

    function normalizeProduct(rawProduct = {}) {
        if (!rawProduct || typeof rawProduct !== 'object') return null;

        const id = rawProduct._id || rawProduct.id;
        if (!id) return null;

        const category = rawProduct.category || rawProduct.mainCategory || {};
        const subCategory = rawProduct.subCategory || rawProduct.subcategory || {};
        const parsePriceValue = (value) => {
            if (typeof window !== 'undefined' && typeof window.sanitizePrice === 'function') {
                const parsed = window.sanitizePrice(value);
                return Number.isFinite(parsed) ? parsed : Number(parsed);
            }
            if (value === undefined || value === null || value === '') return NaN;
            if (typeof value === 'string') {
                return Number(value.replace(/[^\d.]/g, ''));
            }
            return Number(value);
        };

        const rawPrice = rawProduct.price?.current ?? rawProduct.price?.value ?? rawProduct.price?.amount ?? rawProduct.price ?? rawProduct.currentPrice ?? rawProduct.salePrice ?? rawProduct.basePrice;
        const basePriceNumeric = parsePriceValue(rawPrice);
        const hasBasePrice = Number.isFinite(basePriceNumeric) && basePriceNumeric > 0;

        const discountCandidates = [
            rawProduct.priceAfterDiscount,
            rawProduct.discountPrice,
            rawProduct.discountedPrice,
            rawProduct.salePriceAfterDiscount,
            rawProduct.finalPrice,
            rawProduct.final_price,
            rawProduct.price?.afterDiscount,
            rawProduct.price?.priceAfterDiscount
        ];
        const discountRaw = discountCandidates.find(value => value !== undefined && value !== null && value !== '');
        const discountNumeric = parsePriceValue(discountRaw);
        const hasDiscountPrice = Number.isFinite(discountNumeric) && discountNumeric > 0;

        const originalPrice = hasBasePrice ? basePriceNumeric : null;
        const discountPrice = hasDiscountPrice && hasBasePrice && discountNumeric < basePriceNumeric ? discountNumeric : null;

        const effectivePrice = Number.isFinite(discountPrice)
            ? discountPrice
            : hasBasePrice
                ? basePriceNumeric
                : (hasDiscountPrice ? discountNumeric : null);
        const price = Number.isFinite(effectivePrice) && effectivePrice > 0 ? effectivePrice : 0;

        const images = collectProductImages(rawProduct);
        const imageUrl = images[0] || FALLBACK_IMAGE;

        const description = extractPrimaryDescription(rawProduct);

        const features = mergeStringLists(
            rawProduct.features,
            rawProduct.keyFeatures,
            rawProduct.productFeatures,
            rawProduct.highlights,
            rawProduct.details?.features,
            rawProduct.details?.keyFeatures,
            rawProduct.details?.highlights
        );

        const specs = (typeof rawProduct.specs === 'string' && rawProduct.specs.trim())
            ? rawProduct.specs
            : mergeSpecLists(
                rawProduct.specifications,
                rawProduct.specs,
                rawProduct.technicalSpecifications,
                rawProduct.techSpecs,
                rawProduct.details?.specifications,
                rawProduct.details?.technicalSpecifications,
                rawProduct.details?.specs
            );

        const usage = mergeStringLists(
            rawProduct.usage,
            rawProduct.benefits,
            rawProduct.details?.usage,
            rawProduct.details?.benefits,
            rawProduct.useCases,
            rawProduct.recommendedUse
        );

        const rawInstallation =
            rawProduct.installationPrice ??
            rawProduct.installation_price ??
            rawProduct.installationFee ??
            rawProduct.details?.installationPrice ??
            rawProduct.details?.installation_fee;
        const installationPrice = Number.isFinite(Number(rawInstallation)) ? Number(rawInstallation) : 0;

        const warrantyInfo = mergeStringLists(
            rawProduct.warranty,
            rawProduct.warrantyInfo,
            rawProduct.warrantyDetails,
            rawProduct.details?.warranty,
            rawProduct.details?.warrantyInfo
        );

        const deliveryInfo = mergeStringLists(
            rawProduct.deliveryInfo,
            rawProduct.deliveryDetails,
            rawProduct.shippingInfo,
            rawProduct.shippingDetails,
            rawProduct.details?.delivery,
            rawProduct.details?.shipping
        );

        return {
            id,
            name: rawProduct.name || rawProduct.title || '',
            categoryName: category?.name || rawProduct.categoryName || '',
            description,
            image: imageUrl,
            brandName: rawProduct.brand?.name || rawProduct.brandName || '',
            warrantyInfo: rawProduct.warrantyInfo || rawProduct.details?.warrantyInfo || '',
            deliveryInfo: rawProduct.deliveryInfo || rawProduct.details?.deliveryInfo || '',
            price,
            originalPrice,
            discountPrice,
            installationPrice,
            specs,
            usage,
            images,
            features,
            brand: normalizeBrand(rawProduct)
        };
    }

    function formatSpec(spec) {
        if (!spec) return null;
        if (typeof spec === 'string') {
            const [label, ...rest] = spec.split(':');
            return { label: label || 'معلومة', value: rest.join(':') || spec };
        }

        return {
            label: spec.label || spec.name || 'معلومة',
            value: spec.value || spec.detail || '-'
        };
    }

    async function fetchProductById(productId) {
        const encodedId = encodeURIComponent(productId);
        const endpoints = [
            `${window.API_CONFIG.getEndpoint('PRODUCTS')}/${encodedId}`,
            `${window.API_CONFIG.getEndpoint('PRODUCTS')}?id=${encodedId}`,
            `${window.API_CONFIG.getEndpoint('PRODUCTS')}?_id=${encodedId}`,
            `${window.API_CONFIG.getEndpoint('PRODUCTS')}?slug=${encodedId}`
        ];

        for (const endpoint of endpoints) {
            try {
                // ✅ استخدم getJson - تتعامل مع credentials: 'include' وتحديث التوكن
                const payload = await getJson(endpoint);
                const raw = payload?.data?.product || payload?.data || payload;
                const product = normalizeProduct(raw);
                if (product) {
                    if (typeof window !== 'undefined' && window.__actionSportsProductMetadata__?.set) {
                        window.__actionSportsProductMetadata__.set(product.id, {
                            name: product.name,
                            price: product.price,
                            image: product.image,
                            installationPrice: Number(product.installationPrice) || 0
                        });
                    }
                    return product;
                }
            } catch (error) {
                // حاول next endpoint على أخطاء 404
                if (error?.status === 404) {
                    continue;
                }
                // حاول next endpoint على أخطاء client-side
                if (error?.status >= 400 && error?.status < 500) {
                    continue;
                }
            }
        }

        return null;
    }

    function mergeStringLists(...sources) {
        const items = [];
        sources.forEach(source => {
            extractStringItems(source).forEach(item => {
                if (!items.includes(item)) {
                    items.push(item);
                }
            });
        });
        return items;
    }

    function mergeSpecLists(...sources) {
        const specs = [];
        const seen = new Set();
        sources.forEach(source => {
            extractSpecItems(source).forEach(item => {
                const key = `${item.label}|${item.value}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    specs.push(item);
                }
            });
        });
        return specs;
    }

    function extractPrimaryDescription(rawProduct) {
        const candidates = [
            rawProduct.description,
            rawProduct.shortDescription,
            rawProduct.summary,
            rawProduct.details?.description,
            rawProduct.details?.summary
        ];

        const description = candidates.find(text => typeof text === 'string' && text.trim().length > 0);
        return description ? description.trim() : 'لا توجد تفاصيل متاحة لهذا المنتج حالياً.';
    }

    function extractStringItems(source) {
        if (!source) return [];
        if (Array.isArray(source)) {
            return source.flatMap(extractStringItems);
        }

        if (typeof source === 'string') {
            const cleaned = source.replace(/\r/g, '').trim();
            if (!cleaned) return [];

            const parts = cleaned.split(/[\n•\u2022\-]+/).map(part => part.trim()).filter(Boolean);
            if (parts.length > 1) return parts;
            return [cleaned];
        }

        if (typeof source === 'object') {
            const label = source.label || source.name || source.title || source.key || '';
            const value = source.value || source.detail || source.text || source.description || '';
            const combined = `${label}${label && value ? ': ' : ''}${value}`.trim();
            return combined ? [combined] : [];
        }

        return [];
    }

    function extractSpecItems(source) {
        if (!source) return [];
        if (Array.isArray(source)) {
            return source.flatMap(extractSpecItems);
        }

        if (typeof source === 'string') {
            const cleaned = source.trim();
            if (!cleaned) return [];

            if (cleaned.includes(':')) {
                const [label, ...rest] = cleaned.split(':');
                return [{ label: prettifyLabel(label), value: rest.join(':').trim() || '-' }];
            }

            return [{ label: 'معلومة', value: cleaned }];
        }

        if (typeof source === 'object') {
            if ('label' in source || 'name' in source || 'title' in source || 'key' in source) {
                const label = prettifyLabel(source.label || source.name || source.title || source.key || 'معلومة');
                const value = source.value || source.detail || source.text || source.description || '-';
                return [{ label, value }];
            }

            return Object.entries(source).map(([key, value]) => ({
                label: prettifyLabel(key),
                value: typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : JSON.stringify(value)
            }));
        }

        return [];
    }

    function prettifyLabel(label) {
        if (!label) return 'معلومة';
        return label
            .toString()
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(value) {
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    const DETAIL_INLINE_SOURCE_ATTR = 'data-detail-inline-source';

    function buildBoldFragment(text) {
        const fragment = document.createDocumentFragment();
        if (typeof text !== 'string' || !text) {
            return fragment;
        }

        const boldPattern = /\*(.+?)\*/g;
        let lastIndex = 0;
        let match;

        while ((match = boldPattern.exec(text)) !== null) {
            const before = text.slice(lastIndex, match.index);
            if (before) {
                fragment.appendChild(document.createTextNode(before));
            }

            const strong = document.createElement('strong');
            strong.textContent = match[1];
            fragment.appendChild(strong);
            lastIndex = match.index + match[0].length;
        }

        const tail = text.slice(lastIndex);
        if (tail) {
            fragment.appendChild(document.createTextNode(tail));
        }

        return fragment;
    }

    function renderDetailInlineFragment(source) {
        const safeSource = typeof source === 'string' ? source.replace(/\r/g, '') : '';
        const lines = safeSource.split('\n');
        const fragment = document.createDocumentFragment();
        let blankLineCount = 0;
        let hasWrittenContent = false;

        lines.forEach(line => {
            const trimmedLeading = line.replace(/^\s+/, '');
            if (!trimmedLeading.trim()) {
                blankLineCount += 1;
                return;
            }

            if (hasWrittenContent) {
                const breakCount = blankLineCount + 1;
                for (let i = 0; i < breakCount; i += 1) {
                    fragment.appendChild(document.createElement('br'));
                }
            }

            blankLineCount = 0;

            const bulletMatch = trimmedLeading.match(/^([\-\._\*\u2026])\s*/);
            const hasBullet = Boolean(bulletMatch);
            let remainder = hasBullet
                ? trimmedLeading.slice(bulletMatch[0].length)
                : trimmedLeading;

            if (hasBullet && bulletMatch[1] === '*') {
                remainder = `*${remainder}`;
            }

            const content = remainder.trim();
            if (!content) {
                return;
            }

            if (hasBullet) {
                const bullet = document.createElement('span');
                bullet.className = 'inline-format-bullet';
                bullet.setAttribute('aria-hidden', 'true');
                bullet.textContent = '◆';
                fragment.appendChild(bullet);
                fragment.appendChild(document.createTextNode('\u00A0'));
            }

            const boldFragment = buildBoldFragment(content);
            fragment.appendChild(boldFragment);
            hasWrittenContent = true;
        });

        if (!hasWrittenContent) {
            const fallback = buildBoldFragment(safeSource.trim());
            fragment.appendChild(fallback);
        }

        return fragment;
    }

    function formatDetailItem(listItem) {
        if (!listItem) {
            return;
        }

        if (listItem.classList && listItem.classList.contains('markdown-content')) {
            return;
        }

        let original = listItem.getAttribute(DETAIL_INLINE_SOURCE_ATTR);
        if (original === null) {
            original = listItem.textContent || '';
            listItem.setAttribute(DETAIL_INLINE_SOURCE_ATTR, original);
        }

        const formattedFragment = renderDetailInlineFragment(original);
        listItem.innerHTML = '';
        listItem.appendChild(formattedFragment);
    }

    function applyDetailInlineFormatting() {
        document
            .querySelectorAll('.product-info .detail-section ul li:last-child')
            .forEach(formatDetailItem);
    }

    function normalizeBrand(rawProduct) {
        if (!rawProduct) return null;

        const brandSources = [
            rawProduct.brand,
            rawProduct.brandInfo,
            rawProduct.manufacturer,
            rawProduct.vendor,
            rawProduct.brandName,
            rawProduct.details?.brand
        ];

        for (const source of brandSources) {
            if (!source) continue;

            if (typeof source === 'string' && source.trim()) {
                return { name: source.trim() };
            }

            if (typeof source === 'object') {
                const name = source.name || source.title || source.label || source.brand || source.manufacturer || '';
                if (name && typeof name === 'string') {
                    return { name: name.trim() };
                }
            }
        }

        return null;
    }

    async function fetchProductFromList(productId) {
        try {
            // ✅ استخدم getJson - تتعامل مع credentials: 'include'
            const payload = await getJson(window.API_CONFIG.getEndpoint('PRODUCTS'));
            const products = Array.isArray(payload?.data?.products)
                ? payload.data.products
                : Array.isArray(payload?.data?.documents)
                    ? payload.data.documents
                    : [];

            const lowerId = productId.toLowerCase();
            const match = products.find(p => {
                const rawId = p._id || p.id;
                const rawSlug = typeof p.slug === 'string' ? p.slug : (typeof p.handle === 'string' ? p.handle : '');
                return rawId === productId || (typeof rawId === 'string' && rawId.toLowerCase() === lowerId) || (rawSlug && rawSlug.toLowerCase() === lowerId);
            });
            return normalizeProduct(match || null);
        } catch (error) {
            return null;
        }
    }

})();
