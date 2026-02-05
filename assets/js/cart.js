(function () {
    'use strict';
    const FALLBACK_IMAGE = 'assets/images/product1.png';
    const CASH_PAYMENT_METHOD = 'cash';
    const CURRENCY_ICON_HTML = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';

    // ===================================================================
    // SECURITY: IDOR Protection
    // ===================================================================

    /**
     * Validate cart/address ID belongs to current user (prevent IDOR)
     */
    function validateCurrentUserOwnershipCart(resourceId) {
        // Frontend validation: Resource should exist and user should be authenticated
        // Backend API will perform final validation
        if (typeof getAuthUser === 'function') {
            const currentUser = getAuthUser();
            if (!currentUser || !resourceId) {
                return false;
            }
        }
        // Allow if current user is authenticated (backend does actual validation)
        return true;
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
                ALLOWED_ATTR: ['style', 'class', 'id', 'role', 'data-*', 'href', 'src', 'alt', 'title', 'type', 'name', 'value', 'checked', 'disabled', 'selected', 'action', 'method', 'enctype', 'controls', 'aria-*', 'target', 'rel', 'datetime', 'width', 'height', 'loading', 'poster', 'colspan', 'rowspan']
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

    const CHECKOUT_FALLBACK_ADDRESS_ID = 'checkout-fallback-address';

    const ORDER_ENDPOINTS = {
        create: () => window.API_CONFIG.getEndpoint('ORDERS_CREATE'),
        getAll: () => window.API_CONFIG.getEndpoint('ORDERS_LIST'),
        getById: (id) => `${window.API_CONFIG.getEndpoint('ORDERS_LIST')}/${id}`,
        getMyOrders: () => window.API_CONFIG.getEndpoint('ORDERS_MY'),
        deliver: (id) => `${window.API_CONFIG.getEndpoint('ORDERS_LIST')}/${id}/deliver`,
        cancel: (id) => `${window.API_CONFIG.getEndpoint('ORDERS_LIST')}/${id}/cancel`,
        payWithPayTabs: () => window.API_CONFIG.getEndpoint('ORDERS_PAY_PAYTABS'),
        payWithTamara: () => window.API_CONFIG.getEndpoint('ORDERS_PAY_TAMARA'),
        payWithTabby: () => window.API_CONFIG.getEndpoint('ORDERS_PAY_TABBY')
    };

    const PAYMENT_SETTINGS_ENDPOINT = window.API_CONFIG.getEndpoint('PAYMENT_SETTINGS');
    const PAYMENT_METHODS_CONFIG = [
        {
            key: 'payOnDelivery',
            value: 'cash',
            label: 'الدفع عند الاستلام'
        },
        {
            key: 'installments',
            value: 'installment',
            label: 'برنامج التقسيط'
        },
        {
            key: 'applePay',
            value: 'applePay',
            label: 'أبل باي'
        },
        {
            key: 'payWithCard',
            value: 'card',
            label: 'بطاقة ائتمان'
        }
    ];
    let paymentSettingsCache = null;

    const productMetadataCache = (() => {
        if (typeof window !== 'undefined' && window.__actionSportsProductMetadata__ instanceof Map) {
            return window.__actionSportsProductMetadata__;
        }
        return new Map();
    })();

    // Debounce state for cart quantity updates
    const cartDebounceTimers = new Map(); // itemId -> timeoutId
    const DEBOUNCE_DELAY_MS = 500;

    async function fetchPaymentSettings(force = false) {
        if (!force && paymentSettingsCache) {
            return paymentSettingsCache;
        }

        try {
            // ✅ استخدم getJson - تتعامل مع التوكن تلقائياً مع credentials: 'include'
            const response = await getJson(PAYMENT_SETTINGS_ENDPOINT);

            const data = response?.data || {};

            paymentSettingsCache = {
                payOnDelivery: Boolean(data.payOnDelivery),
                payWithCard: Boolean(data.payWithCard),
                installments: Boolean(data.installments),
                applePay: Boolean(
                    data.applePay ??
                    data.payWithApple ??
                    data.payWithApplePay ??
                    data.apple_pay
                )
            };

            return paymentSettingsCache;
        } catch (error) {
            if (error?.status === 401) {
            } else {
            }
            paymentSettingsCache = {
                payOnDelivery: true,
                payWithCard: true,
                installments: false,
                applePay: false
            };
            return paymentSettingsCache;
        }
    }

    function populatePaymentMethodOptions(selectElement, settings) {
        if (!selectElement) return;

        safeSetHTML(selectElement, '');

        const available = PAYMENT_METHODS_CONFIG.filter(({ key }) => settings[key]);

        if (!available.length) {
            const fallbackOption = document.createElement('option');
            fallbackOption.value = CASH_PAYMENT_METHOD;
            fallbackOption.textContent = 'الدفع عند الاستلام';
            selectElement.appendChild(fallbackOption);
            selectElement.value = CASH_PAYMENT_METHOD;
            selectElement.setAttribute('data-only-method', 'true');
            // We'll rely on caller to trigger change after listeners attach
            return;
        }

        available.forEach(({ value, label }) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            selectElement.appendChild(option);
        });

        const defaultMethod = available[0]?.value || CASH_PAYMENT_METHOD;
        selectElement.value = defaultMethod;
    }

    async function preloadPaymentMethods(selectElement) {
        const settings = await fetchPaymentSettings();
        populatePaymentMethodOptions(selectElement, settings);
        return selectElement;
    }

    function translateAddressType(type) {
        switch ((type || '').toLowerCase()) {
            case 'home':
                return 'منزل';
            case 'work':
                return 'عمل';
            case 'other':
                return 'آخر';
            default:
                return type || '—';
        }
    }

    function redirectToProfileOrders() {
        const targetUrl = 'profile.html#orders';
        let hasNavigated = false;

        const navigate = () => {
            if (hasNavigated) return;
            hasNavigated = true;
            window.location.href = targetUrl;
        };

        try {
            const successModal = document.getElementById('successModal');
            if (successModal) {
                successModal.classList.add('show');
                setTimeout(navigate, 1800);
                return;
            }
        } catch (error) {
        }

        setTimeout(navigate, 1200);
    }

    function extractCheckoutPrimaryAddress(source) {
        if (!source || typeof source !== 'object') return null;

        const directAddress = source.address || source.shippingAddress;
        const addressArray = Array.isArray(source.addresses) ? source.addresses : null;
        let candidate = directAddress;

        if (!candidate && addressArray && addressArray.length) {
            candidate = addressArray.find(item => item?.isDefault) || addressArray[0];
        }

        if (!candidate) return null;

        if (typeof candidate === 'string') {
            return {
                _id: CHECKOUT_FALLBACK_ADDRESS_ID,
                type: 'home',
                details: candidate,
                city: source.city || '',
                postalCode: source.postalCode || '',
                phone: source.phone || ''
            };
        }

        if (typeof candidate !== 'object') return null;

        const details = candidate.details || candidate.line1 || candidate.street || candidate.address || '';
        const city = candidate.city || source.city || '';
        const postalCode = candidate.postalCode || candidate.zip || candidate.postcode || source.postalCode || '';
        const phone = candidate.phone || source.phone || '';

        if (!details && !city && !postalCode && !phone) {
            return null;
        }

        return {
            _id: candidate._id || candidate.id || CHECKOUT_FALLBACK_ADDRESS_ID,
            type: candidate.type || 'home',
            details,
            city,
            postalCode,
            phone
        };
    }

    function normalizeCheckoutAddress(address) {
        if (!address) return null;
        const raw = address;
        const regionObject = address && address.region && typeof address.region === 'object' && address.region !== null ? address.region : null;
        const shippingZoneObject = address && address.shippingZone && typeof address.shippingZone === 'object' && address.shippingZone !== null ? address.shippingZone : null;
        const cityCandidate = typeof address.city === 'string' ? address.city.trim() : '';

        let regionId = address.regionId
            || address.shippingRegionId
            || address.shippingZoneId
            || address.zoneId
            || (regionObject ? (regionObject._id || regionObject.id) : null)
            || (shippingZoneObject ? (shippingZoneObject._id || shippingZoneObject.id) : null);

        if (!regionId && cityCandidate && /^[a-f0-9]{8,}$/i.test(cityCandidate)) {
            regionId = cityCandidate;
        }

        const zoneFromCache = regionId ? getShippingZoneByIdSafe(regionId) : null;

        const regionName = address.regionName
            || address.shippingRegionName
            || (typeof address.region === 'string' ? address.region : null)
            || (typeof address.shippingRegion === 'string' ? address.shippingRegion : null)
            || (shippingZoneObject ? shippingZoneObject.name : null)
            || (regionObject ? regionObject.name : null)
            || zoneFromCache?.name
            || '';

        const shippingCostCandidates = [
            address.shippingPrice,
            address.shippingCost,
            address.deliveryFee,
            address.shippingFee,
            address.region?.shippingPrice,
            regionObject?.shippingCost,
            regionObject?.shippingPrice,
            shippingZoneObject?.shippingPrice,
            shippingZoneObject?.shippingCost,
            shippingZoneObject?.price,
            shippingZoneObject?.cost,
            zoneFromCache?.shippingPrice,
            zoneFromCache?.shippingCost,
            zoneFromCache?.shippingRate,
            zoneFromCache?.price,
            zoneFromCache?.cost
        ];

        let shippingCost = 0;
        for (const candidate of shippingCostCandidates) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric >= 0) {
                shippingCost = numeric;
                break;
            }
        }

        return {
            _id: address._id || address.id || CHECKOUT_FALLBACK_ADDRESS_ID,
            id: address._id || address.id || CHECKOUT_FALLBACK_ADDRESS_ID,
            type: address.type || 'home',
            details: address.details || address.line1 || address.street || '',
            city: (address.city && typeof address.city === 'string' && address.city.trim() && !/^[a-f0-9]{8,}$/i.test(address.city) ? address.city : regionName || ''),
            postalCode: address.postalCode || address.zip || '',
            phone: address.phone || '',
            regionId: regionId || null,
            region: typeof address.region === 'string' ? address.region : (regionObject?.name || ''),
            regionName,
            shippingPrice: shippingCost,
            shippingCost,
            shippingZone: shippingZoneObject || regionObject || zoneFromCache || null,
            raw
        };
    }

    function populateCheckoutAddressesFallbackFromUser(userData) {
        const primary = extractCheckoutPrimaryAddress(userData);
        if (!primary) return false;

        const normalized = normalizeCheckoutAddress(primary);
        if (!normalized) return false;

        checkoutAddressesCache = [normalized];
        checkoutAddressesLoaded = true;
        selectedCheckoutAddressId = normalized._id || normalized.id || CHECKOUT_FALLBACK_ADDRESS_ID;
        renderCheckoutAddresses(checkoutAddressesCache);
        return true;
    }

    function populateCheckoutAddressesFallbackFromStoredUser() {
        if (typeof getAuthUser !== 'function') return false;
        const storedUser = getAuthUser();
        if (!storedUser) return false;
        const source = storedUser.raw || storedUser;
        return populateCheckoutAddressesFallbackFromUser(source);
    }

    function getCartStateSafe() {
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
        if (typeof refreshCartState === 'function') {
            return refreshCartState(force);
        }
        return Promise.resolve(getCartStateSafe());
    }

    function formatCartPrice(value) {
        if (typeof formatPrice === 'function') {
            return formatPrice(value);
        }
        const number = Number(value);
        return Number.isFinite(number) ? number.toLocaleString('ar-EG') : value;
    }

    function renderCurrencyWithIcon(value) {
        return `${formatCartPrice(value)}`;
    }

    /**
     * Calculate item subtotal with sale price priority
     * @param {Object} item - Cart item object
     * @returns {number} - Calculated subtotal (price × quantity)
     */
    function calculateItemSubtotal(item) {
        if (!item) return 0;
        // Prioritize sale/discounted price over base price
        const effectivePrice = parseFloat(item.salePrice ?? item.discountedPrice ?? item.price) || 0;
        const quantity = parseInt(item.quantity, 10) || 0;
        return effectivePrice * quantity;
    }

    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        }
    }

    function computeInstallationTotalFromItems(items = []) {
        if (!Array.isArray(items) || !items.length) {
            return 0;
        }

        return items.reduce((sum, item) => {
            const unitInstallation = Number(item?.installationPrice);
            const quantity = Number(item?.quantity) || 0;

            if (!Number.isFinite(unitInstallation) || unitInstallation <= 0 || quantity <= 0) {
                return sum;
            }

            return sum + (unitInstallation * quantity);
        }, 0);
    }

    const shippingZonesHelper = typeof window !== 'undefined' ? window.actionSportsShippingZones : null;
    let shippingZonesLoadPromise = null;
    let selectedShippingDetails = { cost: 0, zoneId: null, zone: null, regionName: '', installationAvailable: false };

    function resetSelectedShippingDetails() {
        selectedShippingDetails = { cost: 0, zoneId: null, zone: null, regionName: '', installationAvailable: false };
    }

    function getShippingZonesHelper() {
        return shippingZonesHelper && typeof shippingZonesHelper === 'object' ? shippingZonesHelper : null;
    }

    function ensureShippingZonesLoaded(force = false) {
        const helper = getShippingZonesHelper();
        if (!helper || typeof helper.load !== 'function') {
            return Promise.resolve([]);
        }

        if (force) {
            shippingZonesLoadPromise = null;
        }

        if (!shippingZonesLoadPromise) {
            shippingZonesLoadPromise = helper.load(force).catch(error => {
                shippingZonesLoadPromise = null;
                throw error;
            });
        }

        return shippingZonesLoadPromise.then(() => {
            if (typeof helper.getAll === 'function') {
                return helper.getAll();
            }
            return [];
        }).catch(error => {
            throw error;
        });
    }

    function getShippingZoneByIdSafe(zoneId) {
        const helper = getShippingZonesHelper();
        if (!helper || typeof helper.getById !== 'function' || !zoneId) {
            return null;
        }
        return helper.getById(zoneId) || null;
    }

    function resolveShippingDetails(address) {
        if (!address || typeof address !== 'object') {
            return { cost: 0, zoneId: null, zone: null, regionName: '' };
        }

        const helper = getShippingZonesHelper();
        const zoneCandidate = address.shippingZone || address.region || address.shippingRegion || address.zone;
        let zoneObject = (zoneCandidate && typeof zoneCandidate === 'object') ? zoneCandidate : null;

        const zoneIdCandidates = [
            address.regionId,
            address.shippingRegionId,
            address.shippingZoneId,
            address.zoneId,
            zoneObject?._id,
            zoneObject?.id,
            typeof zoneCandidate === 'string' ? zoneCandidate : null
        ];

        let zoneId = zoneIdCandidates.find(value => value != null && value !== '') || null;

        if (!zoneObject && zoneId) {
            zoneObject = getShippingZoneByIdSafe(zoneId);
            if (zoneObject) {
                zoneId = zoneObject._id || zoneObject.id || zoneId;
            }
        }

        const zoneNameCandidates = [
            address.regionName,
            address.shippingRegionName,
            typeof address.region === 'string' ? address.region : null,
            typeof address.shippingRegion === 'string' ? address.shippingRegion : null,
            typeof zoneCandidate === 'string' ? zoneCandidate : null,
            zoneObject?.name
        ];

        const regionName = zoneNameCandidates.find(value => typeof value === 'string' && value.trim()) || '';

        const costCandidates = [
            address.shippingCost,
            address.shippingPrice,
            address.deliveryFee,
            address.shippingFee,
            address.region?.shippingCost,
            address.region?.shippingPrice,
            zoneObject?.shippingCost,
            zoneObject?.shippingPrice,
            zoneObject?.shippingRate,
            zoneObject?.price,
            zoneObject?.cost
        ];

        let shippingCost = 0;
        for (const candidate of costCandidates) {
            const numeric = Number(candidate);
            if (Number.isFinite(numeric) && numeric >= 0) {
                shippingCost = numeric;
                break;
            }
        }

        const installationAvailabilityCandidates = [
            address.isInstallationAvailable,
            address.installationAvailable,
            address.supportsInstallation,
            address.raw?.isInstallationAvailable,
            address.raw?.installationAvailable,
            zoneObject?.isInstallationAvailable,
            zoneObject?.installationAvailable,
            zoneObject?.supportsInstallation,
            zoneObject?.installation
        ];

        const installationAvailable = installationAvailabilityCandidates.some(value => value === true);

        return {
            cost: shippingCost,
            zoneId,
            zone: zoneObject,
            regionName: regionName || (zoneObject?.name || ''),
            installationAvailable
        };
    }

    function getZoneDisplayName(zone) {
        if (!zone || typeof zone !== 'object') {
            return 'مدينة';
        }
        const candidates = [
            zone.name,
            zone.nameAr,
            zone.nameAR,
            zone.nameEn,
            zone.nameEN,
            zone.city,
            zone.title,
            zone.label,
            zone.regionName,
            zone.district,
            zone.area,
            zone.governorate
        ];
        const name = candidates.find(value => typeof value === 'string' && value.trim());
        return name ? name.trim() : 'مدينة';
    }

    function resolveZoneNameById(zoneId) {
        if (!zoneId) return '';
        const helper = getShippingZonesHelper();
        if (!helper || typeof helper.getById !== 'function') return '';
        const zone = helper.getById(zoneId);
        return zone ? getZoneDisplayName(zone) : '';
    }

    function formatShippingOptionCost(cost) {
        const numeric = Number(cost);
        if (!Number.isFinite(numeric) || numeric < 0) {
            return '';
        }
        if (numeric === 0) {
            return 'مجاني';
        }
        if (typeof formatPrice === 'function') {
            return `${formatPrice(numeric)} ريال`;
        }
        return `${numeric} ريال`;
    }

    async function populateCheckoutRegionSelect(selectElement, selectedId = '') {
        if (!selectElement) return;

        selectElement.disabled = true;
        safeSetHTML(selectElement, '<option value="">جاري تحميل المدن...</option>');

        try {
            const zones = await ensureShippingZonesLoaded();
            const list = Array.isArray(zones) && zones.length ? zones : (getShippingZonesHelper()?.getAll?.() || []);

            if (!Array.isArray(list) || !list.length) {
                safeSetHTML(selectElement, '<option value="">لا توجد مدن متاحة حالياً</option>');
                return;
            }

            const options = ['<option value="">اختر المدينة</option>'];
            list.forEach(zone => {
                const id = zone?._id || zone?.id;
                if (!id) return;
                const displayName = getZoneDisplayName(zone);
                options.push(`<option value="${id}">${displayName}</option>`);
            });

            safeSetHTML(selectElement, sanitizeHtmlContent(options.join('')));
            if (selectedId) {
                selectElement.value = selectedId;
            }
        } catch (error) {
            safeSetHTML(selectElement, '<option value="">تعذر تحميل المدن</option>');
            if (typeof showToast === 'function') {
                showToast('تعذر تحميل مدن الشحن. يرجى المحاولة لاحقاً.', 'error');
            }
        } finally {
            selectElement.disabled = false;
        }
    }

    function renderCart() {
        const container = document.getElementById('cartContainer');
        if (!container) return;

        const state = getCartStateSafe();

        if (state.isLoading && !state.isLoaded) {
            safeSetHTML(container, `
                <div class="empty-cart cart-loading-container">
                    <i class="fa fa-spinner fa-spin cart-loading-spinner-icon"></i>
                    <h3>جاري تحميل السلة...</h3>
                </div>
            `);
            return;
        }

        if (!state.items.length) {
            safeSetHTML(container, `
                <div class="empty-cart empty-cart-full-width">
                    <i class="fa fa-shopping-cart"></i>
                    <h3>سلة المشتريات فارغة</h3>
                    <p>لم تقم بإضافة أي منتجات بعد</p>
                    <div class="main-button">
                        <a href="./products.html">تصفح المنتجات</a>
                    </div>
                </div>
            `);
            return;
        }

        const subtotal = Number(state.totals?.subtotal) || state.items.reduce((sum, item) => {
            const price = Number(item?.price) || 0;
            const quantity = Number(item?.quantity) || 0;
            return sum + (price * quantity);
        }, 0);

        const shipping = 0;

        // Calculate total savings from discounts
        let totalSavings = 0;
        state.items.forEach(item => {
            const origPrice = parseFloat(item.originalPrice) || 0;
            const effPrice = parseFloat(item.salePrice ?? item.price) || 0;
            const qty = parseInt(item.quantity, 10) || 0;
            if (origPrice > effPrice && effPrice > 0) {
                totalSavings += (origPrice - effPrice) * qty;
            }
        });

        // احسب الـ total كـ: subtotal + shipping + installation
        const total = subtotal;

        const itemsHTML = state.items.map(item => {
            const metadata = item?.productId ? productMetadataCache.get(item.productId) : null;
            let image = item?.image;
            if (!image && metadata?.image) {
                image = metadata.image;
            }
            if (!image && typeof resolveProductImage === 'function') {
                image = resolveProductImage(item?.raw || {});
            }
            if (!image) {
                image = FALLBACK_IMAGE;
            }

            // Check for discount
            const originalPrice = parseFloat(item.originalPrice ?? item.price) || 0;
            const effectivePrice = parseFloat(item.salePrice ?? item.discountedPrice ?? item.price) || 0;
            const hasDiscount = originalPrice > effectivePrice && effectivePrice > 0;
            const discountPercent = hasDiscount ? Math.round((1 - effectivePrice / originalPrice) * 100) : 0;
            const subtotal = calculateItemSubtotal(item);

            // Check for low stock
            const stock = parseInt(item.stock ?? item.maxQuantity ?? 999, 10);
            const isLowStock = stock > 0 && stock <= 5;

            // Build price display HTML
            let priceHtml = '';
            if (hasDiscount) {
                priceHtml = `
                    <div class="cart-item-price-container">
                        <span class="cart-item-price-original">${renderCurrencyWithIcon(originalPrice * item.quantity)}</span>
                        <span class="cart-item-price-discounted">
                            <span class="cart-item-discount-badge">-${discountPercent}%</span>
                            ${renderCurrencyWithIcon(subtotal)}
                        </span>
                    </div>`;
            } else {
                priceHtml = `<div class="cart-item-price">${renderCurrencyWithIcon(subtotal)}</div>`;
            }

            // Low stock warning HTML
            const stockWarningHtml = isLowStock ?
                `<div class="cart-item-stock-warning"><i class="fa fa-exclamation-circle"></i> باقي ${stock} فقط!</div>` : '';

            return `
            <div class="cart-item-row" data-id="${sanitizeHtmlContent(item.id)}" data-product-id="${sanitizeHtmlContent(item.productId || '')}">
                <div class="cart-item-image">
                    <img src="${sanitizeHtmlContent(image)}" alt="${sanitizeHtmlContent(item.name)}">
                </div>
                <div class="cart-item-details">
                    <h3>${sanitizeHtmlContent(item.name)}</h3>
                    ${priceHtml}
                    ${stockWarningHtml}
                    <div class="cart-item-actions">
                        <div class="quantity-control">
                            <button class="quantity-btn" data-action="decrease" data-id="${sanitizeHtmlContent(item.id)}">
                                <i class="fa fa-minus"></i>
                            </button>
                            <span>${item.quantity}</span>
                            <button class="quantity-btn" data-action="increase" data-id="${sanitizeHtmlContent(item.id)}"${item.quantity >= stock ? ' disabled' : ''}>
                                <i class="fa fa-plus"></i>
                            </button>
                        </div>
                        <button class="remove-btn" data-action="remove" data-id="${sanitizeHtmlContent(item.id)}">
                            <i class="fa fa-trash"></i> حذف
                        </button>
                    </div>
                </div>
            </div>
        `;
        }).join('');

        safeSetHTML(container, `
            <div class="cart-items-section">
                <h2>المنتجات (${state.items.length})</h2>
                ${itemsHTML}
            </div>

            <div class="cart-summary-section">
                <div class="cart-summary">
                    <h2>ملخص الطلب</h2>
                    <div class="summary-row">
                        <span>المجموع الفرعي:</span>
                        <span id="orderSubtotalValue">${renderCurrencyWithIcon(subtotal)}</span>
                    </div>
                    ${totalSavings > 0 ? `
                    <div class="summary-row savings-row" id="orderSavingsRow">
                        <span><i class="fa fa-tag"></i> وفرت:</span>
                        <span class="savings-value" id="orderSavingsValue">${renderCurrencyWithIcon(totalSavings)}</span>
                    </div>
                    ` : ''}
                    <div class="summary-row hidden" id="orderShippingRow">
                        <span id="orderShippingLabel">مصاريف الشحن:</span>
                        <span class="price" id="orderShippingValue"></span>
                    </div>
                    <div class="summary-row hidden" id="orderInstallationRow">
                        <span id="orderInstallationLabel">رسوم التركيب:</span>
                        <span class="price" id="orderInstallationValue"></span>
                    </div>
                    <div class="summary-alert hidden" id="orderInstallationAlert">
                        <i class="fa fa-info-circle"></i>
                        <span>خدمة التركيب غير متاحة للمدينة المختارة. سيتم إكمال الطلب بدون تركيب.</span>
                    </div>
                    <div class="summary-row total">
                        <span>الإجمالي:</span>
                        <span class="price" id="orderTotalValue">${renderCurrencyWithIcon(total)}</span>
                    </div>
                    <button class="checkout-btn" id="checkoutButton">
                        <i class="fa fa-credit-card"></i> تأكيد الطلب
                    </button>

                    <div class="address-selection" id="shipping-addresses-section" style="display: none;">
                        <div class="address-selection-header">
                            <h3>اختر عنوان الشحن</h3>
                            <p>حدد أحد العناوين المسجلة أو أضف عنواناً جديداً لإتمام الطلب.</p>
                        </div>
                        <div class="checkout-addresses" id="addresses-list-container">
                            <div class="addresses-loading"><i class="fa fa-spinner fa-spin"></i> جاري تحميل العناوين...</div>
                        </div>
                        <div class="addresses-empty hidden" id="no-addresses-message">
                            لا توجد عناوين محفوظة بعد. يرجى إضافة عنوان جديد للمتابعة.
                        </div>
                        <div class="checkout-shipping-info hidden" id="checkoutShippingInfo">
                            <i class="fa fa-truck"></i>
                            <span id="checkoutShippingInfoText"></span>
                        </div>
                        <div class="address-selection-actions">
                            <button type="button" class="action-btn primary" id="addCheckoutAddressBtn">
                                <i class="fa fa-plus"></i> إضافة عنوان جديد
                            </button>
                        </div>

                        <div class="checkout-payment" id="checkoutPaymentSection">
                            <div class="form-group">
                                <label for="checkoutPaymentMethod">طريقة الدفع *</label>
                                <select name="paymentMethod" id="checkoutPaymentMethod" required>
                                    <option value="">اختر طريقة الدفع</option>
                                </select>
                            </div>

                            <div id="installment-options-container" class="payment-field hidden">
                                <div class="payment-info-alert">
                                    <i class="fa fa-hand-holding-usd"></i>
                                    <p>
                                        اختر مقدم خدمة التقسيط المفضل لديك.
                                    </p>
                                </div>
                                <div class="form-group">
                                    <label>مقدم خدمة التقسيط *</label>
                                    <select name="installment_provider" id="checkoutInstallmentProvider">
                                        <option value="">اختر البرنامج</option>
                                        <option value="tabby">Tabby</option>
                                        <option value="tamara">Tamara</option>
                                    </select>
                                </div>
                            </div>

                            <div id="checkoutCashMessage" class="payment-field hidden">
                                <div class="cash-payment-info">
                                    <i class="fa fa-check-circle"></i>
                                    <div>
                                        <strong>الدفع عند الاستلام</strong>
                                        <p>سيتم تحصيل قيمة الطلب عند استلام المنتج. يرجى تجهيز المبلغ المطلوب.</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <button class="submit-order-btn" id="confirmOrderButton" disabled>
                            <i class="fa fa-check"></i> تأكيد وإرسال الطلب
                        </button>
                    </div>
                </div>
            </div>
        `);

        bindCartInteractions(container);
        updateSummaryTotals();
    }

    function bindCartInteractions(container) {
        const checkoutButton = container.querySelector('#checkoutButton');
        const confirmOrderButton = container.querySelector('#confirmOrderButton');
        const addAddressButton = container.querySelector('#addCheckoutAddressBtn');
        const paymentMethod = container.querySelector('#checkoutPaymentMethod');

        if (paymentMethod) {
            preloadPaymentMethods(paymentMethod).then(() => {
                paymentMethod.addEventListener('change', handleCheckoutPaymentChange);
                handleCheckoutPaymentChange();
            });
        }

        if (checkoutButton) {
            checkoutButton.addEventListener('click', function (event) {
                if (typeof requireAuth === 'function' && !requireAuth(event, 'cart.html')) {
                    if (typeof showToast === 'function') {
                        showToast('يجب تسجيل الدخول قبل إتمام الشراء.', 'warning');
                    }
                    return;
                }
                showAddressSelection();
            });
        }

        container.querySelectorAll('.quantity-btn').forEach(button => {
            button.addEventListener('click', handleQuantityChange);
        });

        container.querySelectorAll('.remove-btn').forEach(button => {
            button.addEventListener('click', handleRemoveItem);
        });

        if (confirmOrderButton) {
            confirmOrderButton.addEventListener('click', submitOrderWithSelectedAddress);
        }

        if (addAddressButton) {
            addAddressButton.addEventListener('click', openCheckoutAddressModal);
        }
    }

    let checkoutAddressesCache = [];
    let checkoutAddressesLoaded = false;
    let selectedCheckoutAddressId = null;

    function showAddressSelection() {
        const selection = document.getElementById('shipping-addresses-section');
        const checkoutButton = document.getElementById('checkoutButton');
        if (!selection) return;

        selection.style.display = 'block';
        if (checkoutButton) {
            checkoutButton.classList.add('hidden');
        }

        ensureShippingZonesLoaded().catch(error => {
        });

        if (!checkoutAddressesLoaded) {
            loadCheckoutAddresses();
        }
    }

    async function loadCheckoutAddresses(forceRefresh = false) {
        if (checkoutAddressesLoaded && !forceRefresh) {
            renderCheckoutAddresses(checkoutAddressesCache);
            return;
        }

        const listContainer = document.getElementById('addresses-list-container');
        const noAddressesMsg = document.getElementById('no-addresses-message');
        if (!listContainer || !noAddressesMsg) return;

        safeSetHTML(listContainer, '<div class="addresses-loading"><i class="fa fa-spinner fa-spin"></i> جاري تحميل العناوين...</div>');
        listContainer.style.display = 'grid';
        noAddressesMsg.style.display = 'none';
        noAddressesMsg.classList.add('hidden');
        resetSelectedShippingDetails();

        try {
            try {
                await ensureShippingZonesLoaded(forceRefresh);
            } catch (zoneError) {
            }

            const response = await getJson(USER_ENDPOINTS.addresses);
            const addresses = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
            const normalized = addresses
                .map(normalizeCheckoutAddress)
                .filter(Boolean);

            checkoutAddressesCache = normalized;
            checkoutAddressesLoaded = true;
            renderCheckoutAddresses(normalized);
        } catch (error) {
            const hydrated = populateCheckoutAddressesFallbackFromStoredUser();
            if (!hydrated) {
                safeSetHTML(listContainer, '');
                listContainer.style.display = 'none';
                noAddressesMsg.textContent = error.message || 'حدث خطأ أثناء تحميل العناوين. يرجى المحاولة مرة أخرى.';
                noAddressesMsg.style.display = 'block';
                noAddressesMsg.classList.remove('hidden');
                resetSelectedShippingDetails();
                updateSummaryTotals();
            }
        }
    }

    function renderCheckoutAddresses(addresses) {
        const listContainer = document.getElementById('addresses-list-container');
        const noAddressesMsg = document.getElementById('no-addresses-message');
        const confirmBtn = document.getElementById('confirmOrderButton');

        if (!listContainer || !noAddressesMsg) {
            // عناصر العنوان غير متاحة؛ خروج آمن دون تسجيل خطأ
            return;
        }

        const previousSelectedId = selectedCheckoutAddressId;
        const normalized = Array.isArray(addresses)
            ? addresses.map(address => (address && address.shippingDetails ? address : normalizeCheckoutAddress(address))).filter(Boolean)
            : [];

        checkoutAddressesCache = normalized;

        // حالة 1: لا يوجد عناوين
        if (!normalized.length) {
            const hydrated = populateCheckoutAddressesFallbackFromStoredUser();
            if (!hydrated) {
                // أخفِ قائمة العناوين الفعلية
                listContainer.style.display = 'none';

                // أظهر رسالة "لا يوجد عناوين محفوظة"
                noAddressesMsg.style.display = 'block';
                noAddressesMsg.classList.remove('hidden');

                selectedCheckoutAddressId = null;
                if (confirmBtn) confirmBtn.disabled = true;
                resetSelectedShippingDetails();
                updateSummaryTotals();
            }
            return;
        }

        // حالة 2: يوجد عناوين
        // أظهر قائمة العناوين
        listContainer.style.display = 'grid';

        // أخفِ رسالة "لا يوجد عناوين"
        noAddressesMsg.style.display = 'none';
        noAddressesMsg.classList.add('hidden');

        if (!previousSelectedId || !normalized.some(address => isSameAddress(address, previousSelectedId))) {
            selectedCheckoutAddressId = normalized[0]?._id || normalized[0]?.id || null;
        }

        safeSetHTML(listContainer, normalized.map(address => renderCheckoutAddressCard(address, isSameAddress(address, selectedCheckoutAddressId))).join(''));

        listContainer.querySelectorAll('input[name="selectedAddress"]').forEach(radio => {
            radio.addEventListener('change', () => {
                selectedCheckoutAddressId = radio.value;
                highlightSelectedAddress();
            });
        });

        highlightSelectedAddress();
        if (confirmBtn) confirmBtn.disabled = !selectedCheckoutAddressId;
    }

    function renderCheckoutAddressCard(address, selected) {
        const id = address?._id || address?.id || '';
        const typeLabel = translateAddressType(address?.type || 'home');
        const details = address?.details || address?.line1 || address?.street || '—';
        const postal = address?.postalCode || address?.zip || '—';
        const phone = address?.phone || '—';
        const regionIdForDisplay = address?.regionId
            || (typeof address?.city === 'string' && /^[a-f0-9]{8,}$/i.test(address.city) ? address.city : null)
            || (typeof address?.region === 'string' && /^[a-f0-9]{8,}$/i.test(address.region) ? address.region : null);
        const resolvedRegionName = resolveZoneNameById(regionIdForDisplay);
        const region = resolvedRegionName || address?.regionName || address?.region || address?.city || '—';
        const cityRaw = (address?.city || '').trim();
        const cityDisplay = cityRaw && cityRaw !== region ? cityRaw : '';
        const shippingSource = address?.shippingDetails || resolveShippingDetails(address);
        const shippingCostValue = Number(
            (shippingSource && shippingSource.cost != null ? shippingSource.cost : undefined)
            ?? address?.shippingCost
            ?? address?.shippingPrice
        );
        let shippingDisplay = '—';
        if (Number.isFinite(shippingCostValue)) {
            shippingDisplay = shippingCostValue === 0 ? 'مجاني' : renderCurrencyWithIcon(shippingCostValue);
        }

        return `
            <label class="checkout-address-card ${selected ? 'selected' : ''}" data-address-id="${sanitizeHtmlContent(id)}">
                <input type="radio" name="selectedAddress" value="${sanitizeHtmlContent(id)}" ${selected ? 'checked' : ''}>
                <div class="checkout-address-content">
                    <div class="checkout-address-type">
                        <span class="address-type-pill">${sanitizeHtmlContent(typeLabel)}</span>
                    </div>
                    <div class="checkout-address-lines">
                        <div class="address-line"><i class="fa fa-map-marker-alt"></i><span>${sanitizeHtmlContent(details)}</span></div>
                        ${cityDisplay ? `<div class="address-line"><i class="fa fa-city"></i><span>${sanitizeHtmlContent(cityDisplay)}</span></div>` : ''}
                        <div class="address-line"><i class="fa fa-map"></i><span>${sanitizeHtmlContent(region)}</span></div>
                        <div class="address-line"><i class="fa fa-truck"></i><span>${shippingDisplay}</span></div>
                        <div class="address-line"><i class="fa fa-mail-bulk"></i><span>${sanitizeHtmlContent(postal)}</span></div>
                        <div class="address-line"><i class="fa fa-phone"></i><span>${sanitizeHtmlContent(phone)}</span></div>
                    </div>
                </div>
            </label>
        `;
    }

    function isSameAddress(address, id) {
        const addressId = address?._id || address?.id || '';
        return addressId && id && String(addressId) === String(id);
    }

    function getSelectedCheckoutAddress() {
        if (!selectedCheckoutAddressId) {
            return null;
        }
        return checkoutAddressesCache.find(address => isSameAddress(address, selectedCheckoutAddressId)) || null;
    }

    function updateCheckoutShippingInfoUI(address, shippingCost) {
        const infoContainer = document.getElementById('checkoutShippingInfo');
        const infoText = document.getElementById('checkoutShippingInfoText');

        if (!infoContainer || !infoText) {
            return;
        }

        if (!address) {
            safeSetText(infoText, '');
            infoContainer.classList.add('hidden');
            return;
        }

        let cost = Number(shippingCost);
        if (!Number.isFinite(cost) || cost < 0) {
            cost = Number(selectedShippingDetails?.cost);
        }

        const effectiveRegionName = selectedShippingDetails?.regionName
            || address.regionName
            || address.region
            || resolveZoneNameById(selectedShippingDetails?.zoneId || address.regionId)
            || '';

        let costLabel = '—';
        if (Number.isFinite(cost)) {
            if (cost === 0) {
                costLabel = 'مجاني';
            } else if (cost > 0) {
                costLabel = renderCurrencyWithIcon(cost);
            }
        }

        const regionSuffix = effectiveRegionName ? ` (${sanitizeHtmlContent(effectiveRegionName)})` : '';
        safeSetHTML(infoText, `تكلفة الشحن${regionSuffix}: ${costLabel}`);
        infoContainer.classList.remove('hidden');
    }

    function highlightSelectedAddress() {
        const cards = document.querySelectorAll('.checkout-address-card');
        const confirmBtn = document.getElementById('confirmOrderButton');
        let activeAddress = null;
        cards.forEach(card => {
            const id = card.dataset.addressId;
            if (id && String(id) === String(selectedCheckoutAddressId)) {
                card.classList.add('selected');
                const radio = card.querySelector('input[type="radio"]');
                if (radio) radio.checked = true;
                activeAddress = checkoutAddressesCache.find(address => isSameAddress(address, id)) || null;
            } else {
                card.classList.remove('selected');
            }
        });

        if (confirmBtn) {
            confirmBtn.disabled = !selectedCheckoutAddressId;
        }

        if (activeAddress) {
            const shippingDetails = activeAddress.shippingDetails || resolveShippingDetails(activeAddress);
            activeAddress.shippingDetails = shippingDetails;
            selectedShippingDetails = {
                cost: Number(shippingDetails?.cost ?? activeAddress.shippingCost ?? activeAddress.shippingPrice) || 0,
                zoneId: shippingDetails?.zoneId || activeAddress.regionId || selectedShippingDetails.zoneId,
                zone: shippingDetails?.zone || activeAddress.shippingZone || null,
                regionName: shippingDetails?.regionName || activeAddress.regionName || activeAddress.region || selectedShippingDetails.regionName || '',
                installationAvailable: Boolean(
                    shippingDetails?.installationAvailable ??
                    activeAddress.installationAvailable ??
                    activeAddress.isInstallationAvailable ??
                    selectedShippingDetails.installationAvailable
                )
            };
        } else {
            resetSelectedShippingDetails();
        }

        updateSummaryTotals();
    }

    function openCheckoutAddressModal() {
        const modal = document.createElement('div');
        modal.className = 'address-modal-overlay';
        const modalHtml = `
            <div class="address-modal">
                <div class="address-modal-header">
                    <h3>إضافة عنوان جديد</h3>
                    <button type="button" class="address-modal-close" aria-label="إغلاق">&times;</button>
                </div>
                <form id="checkoutAddressForm">
                    <div class="address-form-group">
                        <label>نوع العنوان</label>
                        <select name="type" required>
                            <option value="home">المنزل</option>
                            <option value="work">العمل</option>
                            <option value="other">آخر</option>
                        </select>
                    </div>
                    <div class="address-form-group">
                        <label>المدينة</label>
                        <select name="regionId" id="checkoutRegionSelect" required>
                            <option value="">اختر المدينة</option>
                        </select>
                        <small class="field-hint" id="checkoutRegionHint">اختر المدينة لحساب تكلفة الشحن.</small>
                    </div>
                    <div class="address-form-group">
                        <label>تفاصيل العنوان</label>
                        <textarea name="details" rows="3" required placeholder="مثل: الشارع، رقم المنزل، العلامات المميزة"></textarea>
                    </div>
                    <div class="address-form-group">
                        <label>الرمز البريدي</label>
                        <input type="text" name="postalCode" placeholder="12345">
                    </div>
                    <div class="address-form-group">
                        <label>رقم الهاتف</label>
                        <input type="tel" name="phone" required placeholder="مثال: 01000000000">
                    </div>
                    <div class="address-modal-actions">
                        <button type="submit" class="action-btn primary"><i class="fa fa-save"></i> حفظ العنوان</button>
                        <button type="button" class="action-btn secondary address-modal-close">إلغاء</button>
                    </div>
                </form>
            </div>
        `;
        safeSetHTML(modal, sanitizeHtmlContent(modalHtml));

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('visible'), 10);

        modal.addEventListener('click', (event) => {
            if (event.target.classList.contains('address-modal-overlay') || event.target.classList.contains('address-modal-close')) {
                closeCheckoutAddressModal(modal);
            }
        });

        const form = modal.querySelector('#checkoutAddressForm');
        const regionSelect = modal.querySelector('#checkoutRegionSelect');
        const regionHint = modal.querySelector('#checkoutRegionHint');

        const updateRegionHint = (zoneId) => {
            if (!regionHint) return;
            if (!zoneId) {
                regionHint.textContent = 'اختر المدينة لحساب تكلفة الشحن.';
                return;
            }

            const zone = getShippingZoneByIdSafe(zoneId);
            if (!zone) {
                regionHint.textContent = 'تعذر تحديد تكلفة الشحن لهذه المنطقة حالياً.';
                return;
            }

            const costLabel = formatShippingOptionCost(zone?.shippingCost ?? zone?.shippingPrice ?? zone?.shippingRate ?? zone?.price ?? zone?.cost);
            regionHint.textContent = costLabel
                ? `تكلفة شحن هذه المنطقة (${costLabel})`
                : 'لا توجد تكلفة شحن لهذه المنطقة.';
        };

        if (regionSelect) {
            populateCheckoutRegionSelect(regionSelect)
                .then(() => {
                    updateRegionHint(regionSelect.value);
                })
                .catch(error => {
                    updateRegionHint('');
                });

            regionSelect.addEventListener('change', () => {
                updateRegionHint(regionSelect.value);
            });
        }

        form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const formData = new FormData(form);
            const payload = Object.fromEntries(Array.from(formData.entries()).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value]));

            if (!payload.regionId || !payload.details || !payload.phone) {
                showToast('يرجى ملء كافة الحقول المطلوبة.', 'warning');
                return;
            }

            try {
                await saveCheckoutAddress(payload);
                closeCheckoutAddressModal(modal);
                await loadCheckoutAddresses(true);
            } catch (error) {
                showToast(error.message || 'تعذر إضافة العنوان. حاول مرة أخرى.', 'error');
            }
        });
    }

    function closeCheckoutAddressModal(modal) {
        if (!modal) return;
        modal.classList.remove('visible');
        setTimeout(() => modal.remove(), 200);
    }

    async function saveCheckoutAddress(payload) {
        const zoneId = payload.regionId || '';

        const body = {
            type: payload.type || 'home',
            details: payload.details,
            city: zoneId || '', // backend expects region ID here
            postalCode: payload.postalCode || '',
            phone: payload.phone
        };

        await postJson(USER_ENDPOINTS.addresses, body);
        showToast('تم إضافة العنوان بنجاح!', 'success');
    }

    function updateCartItemUIInstantlyOnPage(itemId, newQuantity) {
        // Find the cart item row
        const cartRow = document.querySelector(`.cart-item-row[data-id="${itemId}"]`);
        if (!cartRow) return;

        // Get the item's unit price
        const state = getCartStateSafe();
        const itemIndex = state.items.findIndex(item => item.id === itemId);
        if (itemIndex === -1) return;

        const item = state.items[itemIndex];
        const unitPrice = parseFloat(item.price) || 0;

        if (newQuantity <= 0) {
            // Remove from local state
            state.items.splice(itemIndex, 1);
            // Remove the row from DOM
            cartRow.remove();
        } else {
            // Update quantity in local state
            state.items[itemIndex].quantity = newQuantity;

            // Update the quantity display instantly
            const quantitySpan = cartRow.querySelector('.quantity-control span');
            if (quantitySpan) {
                quantitySpan.textContent = newQuantity;
            }

            // Calculate and update item subtotal INSTANTLY
            // Verify unitPrice is valid
            const newSubtotal = unitPrice * newQuantity;
            const priceDisplay = cartRow.querySelector('.cart-item-price');
            // Force update text content to ensure it changes
            if (priceDisplay && Number.isFinite(newSubtotal)) {
                safeSetHTML(priceDisplay, renderCurrencyWithIcon(newSubtotal));
            }

            // Update increase button disabled state based on stock
            const maxStock = parseInt(item.stock ?? item.maxQuantity ?? 999, 10);
            const increaseBtn = cartRow.querySelector('.quantity-btn[data-action="increase"]');
            if (increaseBtn) {
                increaseBtn.disabled = newQuantity >= maxStock;
            }
        }

        // Update products count in header
        const productsHeader = document.querySelector('.cart-items-section h2');
        if (productsHeader) {
            safeSetText(productsHeader, `المنتجات (${state.items.length})`);
        }

        // Calculate and update SUBTOTAL instantly (المجموع الفرعي)
        let newSubtotalSum = 0;
        let totalSavings = 0;
        state.items.forEach(cartItem => {
            const price = parseFloat(cartItem.salePrice ?? cartItem.discountedPrice ?? cartItem.price) || 0;
            const origPrice = parseFloat(cartItem.originalPrice) || 0;
            const qty = parseInt(cartItem.quantity, 10) || 0;
            newSubtotalSum += price * qty;

            // Calculate savings for this item
            if (origPrice > price && price > 0) {
                totalSavings += (origPrice - price) * qty;
            }
        });
        const orderSubtotalEl = document.getElementById('orderSubtotalValue');
        if (orderSubtotalEl) {
            safeSetHTML(orderSubtotalEl, renderCurrencyWithIcon(newSubtotalSum));
        }

        // Update savings section
        const savingsRow = document.getElementById('orderSavingsRow');
        const savingsValue = document.getElementById('orderSavingsValue');
        if (savingsValue && savingsRow) {
            if (totalSavings > 0) {
                safeSetHTML(savingsValue, renderCurrencyWithIcon(totalSavings));
                savingsRow.style.display = '';
            } else {
                savingsRow.style.display = 'none';
            }
        }

        // HIDE Grand Total and show loading spinner (shipping/installation need server)
        const orderTotalEl = document.getElementById('orderTotalValue');
        if (orderTotalEl) {
            orderTotalEl.classList.add('loading-total');
            safeSetHTML(orderTotalEl, '<i class="fa fa-spinner fa-spin"></i> جاري التحديث...');
        }

        // Check if cart is now empty - target only items section, preserve checkout form
        const itemsSection = document.querySelector('.cart-items-section');
        if (state.items.length === 0 && itemsSection) {
            safeSetHTML(itemsSection, `
                <h2>المنتجات (0)</h2>
                <div class="empty-cart">
                    <i class="fa fa-shopping-cart"></i>
                    <h3>سلة المشتريات فارغة</h3>
                    <p>لم تقم بإضافة أي منتجات بعد</p>
                    <div class="main-button">
                        <a href="./products.html">تصفح المنتجات</a>
                    </div>
                </div>
            `);
            // Reset total to 0 when empty
            if (orderTotalEl) {
                orderTotalEl.classList.remove('loading-total');
                safeSetHTML(orderTotalEl, renderCurrencyWithIcon(0));
            }
        }
    }

    function handleRemoveItem(event) {
        event.preventDefault(); // Prevent any default button behavior
        const button = event.currentTarget;
        const itemId = button.dataset.id;
        if (!itemId) return;

        // 1. Optimistic UI Removal
        // Find row and remove it
        const cartRow = document.querySelector(`.cart-item-row[data-id="${itemId}"]`);
        if (cartRow) {
            cartRow.style.opacity = '0.5'; // Visual feedback
            cartRow.style.pointerEvents = 'none';
        }

        // 2. Call API Silently (suppressEvent: true to prevent full re-render)
        ensureCartStateLoaded()
            .then(() => removeCartItem(itemId, { suppressEvent: true }))
            .then(() => {
                // Success: Remove row fully and update local totals if needed
                if (cartRow) cartRow.remove();

                // Update local state manually since we suppressed the event
                const state = getCartStateSafe();
                const itemIndex = state.items.findIndex(i => i.id === itemId);
                if (itemIndex > -1) {
                    state.items.splice(itemIndex, 1);
                }

                // Recalculate and update summary totals
                updateSummaryTotals();
                updateCartCount();

                // Handle empty state if needed - target only items section, preserve checkout
                if (state.items.length === 0) {
                    const itemsSection = document.querySelector('.cart-items-section');
                    if (itemsSection) {
                        safeSetHTML(itemsSection, `
                            <h2>المنتجات (0)</h2>
                            <div class="empty-cart">
                                <i class="fa fa-shopping-cart"></i>
                                <h3>سلة المشتريات فارغة</h3>
                                <p>لم تقم بإضافة أي منتجات بعد</p>
                                <div class="main-button">
                                    <a href="./products.html">تصفح المنتجات</a>
                                </div>
                            </div>
                        `);
                    }
                }
            })
            .catch(error => {
                // Revert UI on error
                if (cartRow) {
                    cartRow.style.opacity = '1';
                    cartRow.style.pointerEvents = 'auto';
                }
                showToast(error.message || 'تعذر حذف المنتج من السلة.', 'error');
            });
    }

    function debouncedCartPageUpdate(itemId, finalQuantity) {
        // Clear existing timer for this item
        if (cartDebounceTimers.has(itemId)) {
            clearTimeout(cartDebounceTimers.get(itemId));
        }

        // Ensure loading state is showing
        const orderTotalEl = document.getElementById('orderTotalValue');
        if (orderTotalEl && !orderTotalEl.classList.contains('loading-total')) {
            orderTotalEl.classList.add('loading-total');
            safeSetHTML(orderTotalEl, '<i class="fa fa-spinner fa-spin"></i> جاري التحديث...');
        }

        // Set new debounce timer
        const timerId = setTimeout(() => {
            cartDebounceTimers.delete(itemId);

            // Send final quantity to server
            updateCartItemQuantitySilent(itemId, finalQuantity)
                .then(() => {
                    // Server responded - remove loading state and update with server values
                    if (orderTotalEl) {
                        orderTotalEl.classList.remove('loading-total');
                    }
                    // Update summary totals with actual server values
                    updateSummaryTotals();
                })
                .catch(error => {
                    // Remove loading state on error
                    if (orderTotalEl) {
                        orderTotalEl.classList.remove('loading-total');
                    }
                    // On error, revert to server state
                    showToast('تعذر تحديث الكمية. جاري التحديث...', 'error');
                    ensureCartStateLoaded(true).then(() => {
                        renderCart(); // Force full re-render to rollback
                    });
                });
        }, DEBOUNCE_DELAY_MS);

        cartDebounceTimers.set(itemId, timerId);
    }

    async function updateCartItemQuantitySilent(itemId, quantity) {
        if (!itemId) return;
        if (quantity <= 0) {
            // For removal, use the script.js function if available
            if (typeof window.removeCartItem === 'function') {
                return window.removeCartItem(itemId);
            }
            return;
        }

        // Use the global updateCartItemQuantity from script.js
        if (typeof window.updateCartItemQuantity === 'function') {
            try {
                await window.updateCartItemQuantity(itemId, quantity);
            } catch (error) {
                throw error;
            }
        }
    }

    function handleQuantityChange(event) {
        const button = event.currentTarget;
        const action = button.dataset.action;
        const itemId = button.dataset.id;

        if (!action || !itemId) return;

        const state = getCartStateSafe();
        const current = state.items.find(item => item.id === itemId);
        if (!current) return;

        // Get max stock (default to 999 if not available)
        const maxStock = parseInt(current.stock ?? current.maxQuantity ?? 999, 10);

        // Calculate new quantity with min/max limits
        const delta = action === 'increase' ? 1 : -1;
        let newQuantity = current.quantity + delta;

        // Enforce limits
        if (newQuantity < 0) newQuantity = 0;
        if (newQuantity > maxStock) {
            // Show warning and cap at max
            showToast(`الحد الأقصى المتاح: ${maxStock} قطعة`, 'warning');
            newQuantity = maxStock;
            // Don't update if already at max
            if (current.quantity >= maxStock) return;
        }

        // 2. INSTANT UI Update (Optimistic)
        updateCartItemUIInstantlyOnPage(itemId, newQuantity);

        // 3. Debounced Server Sync
        debouncedCartPageUpdate(itemId, newQuantity);
    }

    function handleRemoveItem(event) {
        event.preventDefault();
        const button = event.currentTarget;
        const itemId = button.dataset.id;
        if (!itemId) return;

        const state = getCartStateSafe();
        const item = state.items.find(i => i.id === itemId);
        const itemName = item?.name || 'هذا المنتج';

        // Show confirmation dialog
        showDeleteConfirmation(itemName, () => {
            // User confirmed - proceed with deletion
            const cartRow = document.querySelector(`.cart-item-row[data-id="${itemId}"]`);
            if (cartRow) {
                cartRow.style.opacity = '0.5';
                cartRow.style.pointerEvents = 'none';
            }

            ensureCartStateLoaded()
                .then(() => removeCartItem(itemId, { suppressEvent: true }))
                .then(() => {
                    if (cartRow) cartRow.remove();

                    // Update local state
                    const updatedState = getCartStateSafe();
                    const itemIndex = updatedState.items.findIndex(i => i.id === itemId);
                    if (itemIndex > -1) {
                        updatedState.items.splice(itemIndex, 1);
                    }

                    updateSummaryTotals();
                    updateCartCount();

                    // Update products header
                    const productsHeader = document.querySelector('.cart-items-section h2');
                    if (productsHeader) {
                        safeSetText(productsHeader, `المنتجات (${updatedState.items.length})`);
                    }

                    // Update savings display after removal
                    let totalSavings = 0;
                    updatedState.items.forEach(cartItem => {
                        const price = parseFloat(cartItem.salePrice ?? cartItem.discountedPrice ?? cartItem.price) || 0;
                        const origPrice = parseFloat(cartItem.originalPrice) || 0;
                        const qty = parseInt(cartItem.quantity, 10) || 0;
                        if (origPrice > price && price > 0) {
                            totalSavings += (origPrice - price) * qty;
                        }
                    });
                    const savingsRow = document.getElementById('orderSavingsRow');
                    const savingsValue = document.getElementById('orderSavingsValue');
                    if (savingsValue && savingsRow) {
                        if (totalSavings > 0) {
                            safeSetHTML(savingsValue, renderCurrencyWithIcon(totalSavings));
                            savingsRow.style.display = '';
                        } else {
                            savingsRow.style.display = 'none';
                        }
                    }

                    // Handle empty state
                    if (updatedState.items.length === 0) {
                        const itemsSection = document.querySelector('.cart-items-section');
                        if (itemsSection) {
                            safeSetHTML(itemsSection, `
                                <h2>المنتجات (0)</h2>
                                <div class="empty-cart">
                                    <i class="fa fa-shopping-cart"></i>
                                    <h3>سلة المشتريات فارغة</h3>
                                    <p>لم تقم بإضافة أي منتجات بعد</p>
                                    <div class="main-button">
                                        <a href="./products.html">تصفح المنتجات</a>
                                    </div>
                                </div>
                            `);
                        }
                    }

                    showToast('تم حذف المنتج من السلة', 'success');
                })
                .catch(error => {
                    if (cartRow) {
                        cartRow.style.opacity = '1';
                        cartRow.style.pointerEvents = 'auto';
                    }
                    showToast(error.message || 'تعذر حذف المنتج من السلة.', 'error');
                });
        });
    }

    /**
     * Show delete confirmation modal
     */
    function showDeleteConfirmation(itemName, onConfirm) {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'delete-confirm-overlay';
        modal.innerHTML = `
            <div class="delete-confirm-modal">
                <div class="delete-confirm-icon">
                    <i class="fa fa-exclamation-triangle"></i>
                </div>
                <h3>تأكيد الحذف</h3>
                <p>هل تريد حذف "${sanitizeHtmlContent(itemName)}" من السلة؟</p>
                <div class="delete-confirm-actions">
                    <button class="btn-cancel">إلغاء</button>
                    <button class="btn-confirm">نعم، احذف</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Animate in
        requestAnimationFrame(() => modal.classList.add('visible'));

        // Handle cancel
        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => modal.remove(), 200);
        });

        // Handle confirm
        modal.querySelector('.btn-confirm').addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => modal.remove(), 200);
            onConfirm();
        });

        // Close on overlay click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('visible');
                setTimeout(() => modal.remove(), 200);
            }
        });
    }

    function handleCheckoutPaymentChange() {
        const paymentMethod = document.getElementById('checkoutPaymentMethod');
        const cashMessage = document.getElementById('checkoutCashMessage');
        const installmentProviders = document.getElementById('installment-options-container');

        if (!paymentMethod || !cashMessage || !installmentProviders) {
            return;
        }

        // أخفِ كل الرسائل والخيارات في البداية
        cashMessage.classList.add('hidden');
        cashMessage.style.display = 'none';
        installmentProviders.classList.add('hidden');
        installmentProviders.style.display = 'none';

        const providerSelect = document.getElementById('checkoutInstallmentProvider');
        if (providerSelect) {
            providerSelect.removeAttribute('required');
            providerSelect.selectedIndex = 0;
        }

        // تحقق من طريقة الدفع المختارة
        const selectedPaymentMethod = paymentMethod.value;
        const isCashPayment = selectedPaymentMethod === CASH_PAYMENT_METHOD;
        const isInstallmentPayment = selectedPaymentMethod === 'installment';

        // أظهر الرسالة/الخيارات بناءً على طريقة الدفع
        if (isCashPayment) {
            // أظهر رسالة الدفع عند الاستلام
            cashMessage.classList.remove('hidden');
            cashMessage.style.display = 'block';
        } else if (isInstallmentPayment) {
            // أظهر خيارات التقسيط
            installmentProviders.classList.remove('hidden');
            installmentProviders.style.display = 'block';
            if (providerSelect) {
                providerSelect.setAttribute('required', 'required');
            }
        }
        // للطرق الأخرى (card, applePay) لا نظهر شيء

        updateSummaryTotals();
    }

    function updateSummaryTotals() {
        const totalValue = document.getElementById('orderTotalValue');
        const shippingRow = document.getElementById('orderShippingRow');
        const shippingValue = document.getElementById('orderShippingValue');
        const installationRow = document.getElementById('orderInstallationRow');
        const installationValue = document.getElementById('orderInstallationValue');
        const installationAlert = document.getElementById('orderInstallationAlert');

        const state = getCartStateSafe();
        const items = Array.isArray(state.items) ? state.items : [];

        let subtotal = Number(state.totals?.subtotal);
        if (!Number.isFinite(subtotal) || subtotal < 0) {
            subtotal = items.reduce((sum, item) => {
                const price = Number(item?.price) || 0;
                const quantity = Number(item?.quantity) || 0;
                return sum + (price * quantity);
            }, 0);
        }

        const selectedAddress = getSelectedCheckoutAddress();
        const selectedShippingCost = Number(selectedShippingDetails?.cost);
        const stateShipping = Number(
            state.totals?.shippingPrice ??
            state.totals?.shipping ??
            state.totals?.shippingCost ??
            state.shippingPrice
        );

        let shipping = 0;
        if (selectedAddress && Number.isFinite(selectedShippingCost) && selectedShippingCost >= 0) {
            shipping = selectedShippingCost;
        } else if (Number.isFinite(stateShipping) && stateShipping >= 0) {
            shipping = stateShipping;
        }

        const shouldShowShipping = Boolean(selectedAddress) || (Number.isFinite(shipping) && shipping > 0);

        if (shippingRow) {
            shouldShowShipping ? shippingRow.classList.remove('hidden') : shippingRow.classList.add('hidden');
        }

        if (shouldShowShipping && shippingValue) {
            if (shipping === 0) {
                safeSetText(shippingValue, 'مجاني');
            } else if (Number.isFinite(shipping) && shipping > 0) {
                safeSetHTML(shippingValue, renderCurrencyWithIcon(shipping));
            } else {
                safeSetText(shippingValue, '—');
            }
        } else if (shippingValue) {
            safeSetText(shippingValue, '');
        }

        const rawInstallation = Number(state.totals?.installationPrice);
        let installation = Number.isFinite(rawInstallation) && rawInstallation >= 0 ? rawInstallation : computeInstallationTotalFromItems(items);
        const hasInstallationItems = installation > 0;
        const installationSupported = Boolean(selectedShippingDetails?.installationAvailable);

        // التحكم في رسالة التركيب غير المتاح
        if (installationAlert) {
            // اعرض الرسالة فقط عندما:
            // 1. يوجد عنوان مختار
            // 2. يوجد منتجات لها رسوم تركيب
            // 3. التركيب غير مدعومة في المدينة المختارة
            const shouldShowAlert = Boolean(selectedAddress) && hasInstallationItems && !installationSupported;

            if (shouldShowAlert) {
                installationAlert.classList.remove('hidden');
                installationAlert.style.display = 'block';
            } else {
                installationAlert.classList.add('hidden');
                installationAlert.style.display = 'none';
            }
        }

        // إذا كانت التركيب غير مدعومة، اجعل رسوم التركيب = 0
        if (!installationSupported) {
            installation = 0;
        }

        if (installationRow) {
            const showInstallation = installationSupported && installation > 0;
            showInstallation ? installationRow.classList.remove('hidden') : installationRow.classList.add('hidden');
            if (showInstallation && installationValue) {
                safeSetHTML(installationValue, installation === 0
                    ? 'مجاني'
                    : renderCurrencyWithIcon(installation));
            } else if (installationValue) {
                safeSetText(installationValue, '');
            }
        }

        const declaredTotal = Number(state.totals?.total);

        // احسب الـ total كـ: subtotal + shipping + installation
        // لا تستخدم declaredTotal من الـ backend لأنه قد لا يشمل الشحن والتركيب الجديدة
        let total = subtotal + (Number.isFinite(shipping) && shipping > 0 ? shipping : 0) + installation;

        if (totalValue) {
            safeSetHTML(totalValue, renderCurrencyWithIcon(total));
        }

        updateCheckoutShippingInfoUI(selectedAddress, shipping);
    }

    function getCurrentUserSafe() {
        return typeof getAuthUser === 'function' ? getAuthUser() : null;
    }

    function ensureAuthenticated(event) {
        const user = getCurrentUserSafe();
        if (user) {
            return true;
        }

        if (typeof requireAuth === 'function') {
            requireAuth(event, 'cart.html');
        }

        showToast('يجب تسجيل الدخول لإتمام الطلب.', 'warning');
        return false;
    }

    function getCartIdSafe() {
        const state = getCartStateSafe();

        // Try multiple possible sources for cart ID
        if (state?.id) return state.id;
        if (state?._id) return state._id;
        if (typeof cartState !== 'undefined' && cartState?.id) return cartState.id;
        if (typeof cartState !== 'undefined' && cartState?._id) return cartState._id;

        // لا يتم البحث في localStorage - البيانات الحساسة يجب أن تأتي من الـ API أو في-memory
        return null;
    }

    function buildOrderPayload(selectedAddress, selectedPaymentMethod, state, user, installmentProvider) {
        const subtotal = Number(state.totals?.subtotal) || 0;
        const addressShippingDetails = selectedAddress?.shippingDetails || resolveShippingDetails(selectedAddress);
        const effectiveShippingDetails = {
            cost: Number(addressShippingDetails?.cost ?? selectedShippingDetails.cost) || 0,
            zoneId: addressShippingDetails?.zoneId || selectedShippingDetails.zoneId || selectedAddress?.regionId || null,
            zone: addressShippingDetails?.zone || selectedShippingDetails.zone || null,
            regionName: addressShippingDetails?.regionName || selectedShippingDetails.regionName || selectedAddress?.regionName || selectedAddress?.region || '',
            installationAvailable: Boolean(addressShippingDetails?.installationAvailable ?? selectedShippingDetails.installationAvailable)
        };

        const regionIdForBackend =
            effectiveShippingDetails.zoneId ||
            selectedAddress?.regionId ||
            selectedAddress?.raw?.regionId ||
            selectedAddress?.raw?.shippingRegionId ||
            selectedAddress?.raw?.shippingZoneId ||
            selectedAddress?.raw?.zoneId ||
            (typeof selectedAddress?.raw?.city === 'string' ? selectedAddress.raw.city : null) ||
            (typeof selectedAddress?.city === 'string' && /^[a-f0-9]{8,}$/i.test(selectedAddress.city) ? selectedAddress.city : null) ||
            null;

        const installationBase = Number(state.totals?.installationPrice);
        const installationFallback = computeInstallationTotalFromItems(state.items);
        const installationSupported = Boolean(effectiveShippingDetails.installationAvailable);
        const installationPrice = installationSupported
            ? (Number.isFinite(installationBase) && installationBase >= 0 ? installationBase : installationFallback)
            : 0;

        const payload = {
            paymentMethod: selectedPaymentMethod || CASH_PAYMENT_METHOD,
            shippingPrice: effectiveShippingDetails.cost,
            taxPrice: 0,
            installationPrice,
            totalOrderPrice: subtotal + effectiveShippingDetails.cost + installationPrice,
            cartItems: state.items.map(item => ({
                productId: item.productId || item.id,
                quantity: item.quantity,
                price: item.price,
                name: item.name || 'منتج'
            }))
        };

        // DON'T include cartId in payload - it goes in URL
        // Add user ID if available
        if (user?.id) {
            payload.userId = user.id;
        } else if (user?._id) {
            payload.userId = user._id;
        }

        // Customer name
        const customerName = (user?.name || '').trim();
        payload.customerName = customerName || 'عميل';

        // Customer email/account
        if (user?.email) {
            payload.customerAccount = user.email;
        }

        // Shipping address
        if (selectedAddress) {
            const addressDetails = selectedAddress.details || selectedAddress.line1 || selectedAddress.street || selectedAddress.address || '';
            payload.shippingAddress = {
                addressId: selectedAddress._id || selectedAddress.id || undefined,
                type: selectedAddress.type || 'home',
                details: addressDetails,
                addressLine1: addressDetails,
                address: addressDetails,
                line1: addressDetails,
                city: regionIdForBackend || '',
                region: effectiveShippingDetails.regionName || selectedAddress.region || selectedAddress.state || '',
                regionId: effectiveShippingDetails.zoneId || selectedAddress.regionId || null,
                regionName: effectiveShippingDetails.regionName || selectedAddress.regionName || '',
                postalCode: selectedAddress.postalCode || selectedAddress.zip || '',
                phone: selectedAddress.phone || user?.phone || '',
                recipientName: payload.customerName,
                name: payload.customerName,
                shippingZoneId: effectiveShippingDetails.zoneId || null,
                shippingPrice: payload.shippingPrice,
                shippingCost: payload.shippingPrice
            };
        }

        if (effectiveShippingDetails.zoneId) {
            payload.shippingRegionId = effectiveShippingDetails.zoneId;
            payload.shippingZoneId = effectiveShippingDetails.zoneId;
        }

        if (effectiveShippingDetails.regionName) {
            payload.shippingRegionName = effectiveShippingDetails.regionName;
        }

        if (payload.paymentMethod === 'installment' && installmentProvider) {
            payload.paymentDetails = {
                provider: installmentProvider
            };
        }
        return payload;
    }

    async function postOrderRequest(payload) {
        // ✅ استخدم postJson من script.js - تتعامل مع التوكن تلقائياً
        // لا حاجة لتمرير التوكن يدويا - postJson تتولى كل شيء
        return postJson(ORDER_ENDPOINTS.create(), payload);
    }

    async function processOrderSubmission({ paymentMethod, payload, cartId }) {
        if (paymentMethod === 'card' || paymentMethod === 'applePay') {
            return initiatePayTabsPayment({ payload, cartId });
        }

        if (paymentMethod === 'installment') {
            const provider = payload?.paymentDetails?.provider;
            if (!provider) {
                throw new Error('يرجى اختيار مقدم خدمة التقسيط.');
            }

            // استدعاء نقطة النهاية المناسبة بناءً على مقدم الخدمة
            if (provider === 'tamara') {
                return initiateTamaraPayment({ payload, cartId });
            } else if (provider === 'tabby') {
                return initiateTabbyPayment({ payload, cartId });
            } else {
                throw new Error('مقدم خدمة التقسيط غير مدعوم.');
            }
        }

        const orderResponse = await postOrderRequest(payload);
        return {
            message: orderResponse?.message || orderResponse?.data?.message,
            data: orderResponse
        };
    }

    function resolveInstallmentRedirect(provider, payload, cartId) {
        const baseUrl = window.location.origin || '';
        const summary = {
            provider,
            cartId,
            total: payload?.totalOrderPrice,
            shipping: payload?.shippingPrice,
            installation: payload?.installationPrice,
            items: Array.isArray(payload?.cartItems) ? payload.cartItems.map(item => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
            })) : []
        };

        const summaryJson = JSON.stringify(summary);
        let stored = false;
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem('actionSportsInstallmentSummary', summaryJson);
                stored = true;
            }
        } catch (storageError) {
        }

        let relativePath = null;
        if (provider === 'tabby') {
            relativePath = './installments/tabby.html';
        } else if (provider === 'tamara') {
            relativePath = './installments/tamara.html';
        }

        if (!relativePath) {
            return null;
        }

        const targetUrl = new URL(relativePath, window.location.href);
        if (!stored) {
            targetUrl.searchParams.set('summary', encodeURIComponent(summaryJson));
        }

        return targetUrl.toString();
    }

    async function initiatePayTabsPayment({ payload, cartId }) {
        // لا حاجة للتوكن اليدوي - postJson يتولى كل شيء تلقائياً

        const normalizedCartItems = Array.isArray(payload.cartItems) ? payload.cartItems.map(item => {
            const productSource = item?.product || item?.productId || item?.rawProduct || {};
            const productIdValue = typeof item?.productId === 'object'
                ? (item.productId._id || item.productId.id || item.productId.value)
                : (item.productId || item.id);

            const resolvedPrice = Number(item?.price ?? productSource?.price ?? productSource?.unitPrice ?? 0);
            const resolvedQuantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;

            return {
                productId: productIdValue,
                quantity: resolvedQuantity,
                price: resolvedPrice
            };
        }).filter(item => item.productId) : [];

        const rawShippingAddress = payload.shippingAddress || {};
        const shippingDetailsValue = rawShippingAddress.details
            || rawShippingAddress.address
            || rawShippingAddress.addressLine1
            || rawShippingAddress.line1
            || '';

        const minimalShippingAddress = {
            details: shippingDetailsValue,
            phone: rawShippingAddress.phone || undefined,
            city: rawShippingAddress.city || rawShippingAddress.regionId || '',
            postalCode: rawShippingAddress.postalCode || rawShippingAddress.zip || ''
        };

        if (rawShippingAddress.addressId) {
            minimalShippingAddress.addressId = rawShippingAddress.addressId;
        }
        if (rawShippingAddress.regionId) {
            minimalShippingAddress.regionId = rawShippingAddress.regionId;
        }

        Object.keys(minimalShippingAddress).forEach((key) => {
            const value = minimalShippingAddress[key];
            if (value === undefined || value === null || value === '') {
                delete minimalShippingAddress[key];
            }
        });

        const payTabsPayload = {
            cartId,
            paymentMethod: payload.paymentMethod,
            totalOrderPrice: payload.totalOrderPrice,
            shippingPrice: payload.shippingPrice,
            taxPrice: payload.taxPrice,
            cartItems: normalizedCartItems,
            shippingAddress: minimalShippingAddress
        };

        if (payload.userId) {
            payTabsPayload.userId = payload.userId;
        }

        if (payload.notes) {
            payTabsPayload.notes = payload.notes;
        }

        // ✅ استخدم postJson - تتعامل مع التوكن تلقائياً مع credentials: 'include'
        const result = await postJson(ORDER_ENDPOINTS.payWithPayTabs(), payTabsPayload);

        const redirectUrl =
            result?.data?.redirectUrl ||
            result?.data?.redirect_url ||
            result?.redirectUrl ||
            result?.redirect_url ||
            result?.data?.paymentUrl ||
            result?.paymentUrl;

        if (!redirectUrl) {
            const error = new Error('لم يتم استلام رابط الدفع من بوابة PayTabs.');
            error.status = 400;
            error.details = result;
            throw error;
        }
        return {
            redirectUrl,
            message: result?.message || 'جاري تحويلك إلى بوابة الدفع...'
        };
    }

    async function initiateTamaraPayment({ payload, cartId }) {
        const normalizedCartItems = Array.isArray(payload.cartItems) ? payload.cartItems.map(item => {
            const productSource = item?.product || item?.productId || item?.rawProduct || {};
            const productIdValue = typeof item?.productId === 'object'
                ? (item.productId._id || item.productId.id || item.productId.value)
                : (item.productId || item.id);

            const resolvedPrice = Number(item?.price ?? productSource?.price ?? productSource?.unitPrice ?? 0);
            const resolvedQuantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;

            return {
                productId: productIdValue,
                quantity: resolvedQuantity,
                price: resolvedPrice
            };
        }).filter(item => item.productId) : [];

        const rawShippingAddress = payload.shippingAddress || {};
        const shippingDetailsValue = rawShippingAddress.details
            || rawShippingAddress.address
            || rawShippingAddress.addressLine1
            || rawShippingAddress.line1
            || '';

        const minimalShippingAddress = {
            details: shippingDetailsValue,
            phone: rawShippingAddress.phone || undefined,
            city: rawShippingAddress.city || rawShippingAddress.regionId || '',
            postalCode: rawShippingAddress.postalCode || rawShippingAddress.zip || ''
        };

        if (rawShippingAddress.addressId) {
            minimalShippingAddress.addressId = rawShippingAddress.addressId;
        }
        if (rawShippingAddress.regionId) {
            minimalShippingAddress.regionId = rawShippingAddress.regionId;
        }

        Object.keys(minimalShippingAddress).forEach((key) => {
            const value = minimalShippingAddress[key];
            if (value === undefined || value === null || value === '') {
                delete minimalShippingAddress[key];
            }
        });

        const tamaraPayload = {
            cartId,
            paymentMethod: 'installment',
            totalOrderPrice: payload.totalOrderPrice,
            shippingPrice: payload.shippingPrice,
            taxPrice: payload.taxPrice,
            cartItems: normalizedCartItems,
            shippingAddress: minimalShippingAddress
        };

        if (payload.userId) {
            tamaraPayload.userId = payload.userId;
        }

        if (payload.notes) {
            tamaraPayload.notes = payload.notes;
        }

        const result = await postJson(ORDER_ENDPOINTS.payWithTamara(), tamaraPayload);

        const redirectUrl =
            result?.data?.redirectUrl ||
            result?.data?.redirect_url ||
            result?.redirectUrl ||
            result?.redirect_url ||
            result?.data?.paymentUrl ||
            result?.paymentUrl;

        if (!redirectUrl) {
            const error = new Error('لم يتم استلام رابط الدفع من بوابة تمارا.');
            error.status = 400;
            error.details = result;
            throw error;
        }
        return {
            redirectUrl,
            message: result?.message || 'جاري تحويلك إلى بوابة الدفع...'
        };
    }

    async function initiateTabbyPayment({ payload, cartId }) {
        const normalizedCartItems = Array.isArray(payload.cartItems) ? payload.cartItems.map(item => {
            const productSource = item?.product || item?.productId || item?.rawProduct || {};
            const productIdValue = typeof item?.productId === 'object'
                ? (item.productId._id || item.productId.id || item.productId.value)
                : (item.productId || item.id);

            const resolvedPrice = Number(item?.price ?? productSource?.price ?? productSource?.unitPrice ?? 0);
            const resolvedQuantity = Number(item?.quantity ?? item?.qty ?? 1) || 1;

            return {
                productId: productIdValue,
                quantity: resolvedQuantity,
                price: resolvedPrice
            };
        }).filter(item => item.productId) : [];

        const rawShippingAddress = payload.shippingAddress || {};
        const shippingDetailsValue = rawShippingAddress.details
            || rawShippingAddress.address
            || rawShippingAddress.addressLine1
            || rawShippingAddress.line1
            || '';

        const minimalShippingAddress = {
            details: shippingDetailsValue,
            phone: rawShippingAddress.phone || undefined,
            city: rawShippingAddress.city || rawShippingAddress.regionId || '',
            postalCode: rawShippingAddress.postalCode || rawShippingAddress.zip || ''
        };

        if (rawShippingAddress.addressId) {
            minimalShippingAddress.addressId = rawShippingAddress.addressId;
        }
        if (rawShippingAddress.regionId) {
            minimalShippingAddress.regionId = rawShippingAddress.regionId;
        }

        Object.keys(minimalShippingAddress).forEach((key) => {
            const value = minimalShippingAddress[key];
            if (value === undefined || value === null || value === '') {
                delete minimalShippingAddress[key];
            }
        });

        const tabbyPayload = {
            cartId,
            paymentMethod: 'installment',
            totalOrderPrice: payload.totalOrderPrice,
            shippingPrice: payload.shippingPrice,
            taxPrice: payload.taxPrice,
            cartItems: normalizedCartItems,
            shippingAddress: minimalShippingAddress
        };

        if (payload.userId) {
            tabbyPayload.userId = payload.userId;
        }

        if (payload.notes) {
            tabbyPayload.notes = payload.notes;
        }

        const result = await postJson(ORDER_ENDPOINTS.payWithTabby(), tabbyPayload);

        const redirectUrl =
            result?.data?.redirectUrl ||
            result?.data?.redirect_url ||
            result?.redirectUrl ||
            result?.redirect_url ||
            result?.data?.paymentUrl ||
            result?.paymentUrl;

        if (!redirectUrl) {
            const error = new Error('لم يتم استلام رابط الدفع من بوابة تابي.');
            error.status = 400;
            error.details = result;
            throw error;
        }
        return {
            redirectUrl,
            message: result?.message || 'جاري تحويلك إلى بوابة الدفع...'
        };
    }

    function toggleSubmitButton(submitBtn, isLoading, originalContent) {
        if (!submitBtn) return;

        if (isLoading) {
            submitBtn.disabled = true;
            safeSetHTML(submitBtn, '<i class="fa fa-spinner fa-spin"></i> جاري المعالجة...');
        } else {
            submitBtn.disabled = false;
            safeSetHTML(submitBtn, originalContent);
        }
    }

    async function submitOrderWithSelectedAddress(event) {
        event.preventDefault();

        const confirmBtn = event.currentTarget;
        const originalContent = confirmBtn.innerHTML;

        if (!selectedCheckoutAddressId) {
            showToast('يرجى اختيار عنوان الشحن أولاً.', 'info');
            return;
        }

        const selectedAddress = checkoutAddressesCache.find(address => isSameAddress(address, selectedCheckoutAddressId));
        if (!selectedAddress) {
            showToast('لم يتم العثور على العنوان المحدد.', 'error');
            return;
        }

        if (!selectedAddress.shippingDetails) {
            selectedAddress.shippingDetails = resolveShippingDetails(selectedAddress);
        }
        const refreshedShipping = selectedAddress.shippingDetails || resolveShippingDetails(selectedAddress);
        selectedShippingDetails = {
            cost: Number(refreshedShipping?.cost ?? selectedShippingDetails.cost) || 0,
            zoneId: refreshedShipping?.zoneId || selectedAddress.regionId || selectedShippingDetails.zoneId,
            zone: refreshedShipping?.zone || selectedAddress.shippingZone || selectedShippingDetails.zone,
            regionName: refreshedShipping?.regionName || selectedAddress.regionName || selectedAddress.region || selectedShippingDetails.regionName || '',
            installationAvailable: Boolean(refreshedShipping?.installationAvailable ?? selectedAddress.installationAvailable ?? selectedShippingDetails.installationAvailable)
        };
        updateSummaryTotals();

        const paymentSelect = document.getElementById('checkoutPaymentMethod');
        if (!paymentSelect) {
            showToast('يرجى اختيار طريقة الدفع.', 'info');
            return;
        }

        const selectedPaymentMethod = paymentSelect.value;
        if (!selectedPaymentMethod) {
            showToast('يرجى اختيار طريقة الدفع.', 'info');
            return;
        }

        const installmentProviderSelect = document.getElementById('checkoutInstallmentProvider');
        const installmentProvider = installmentProviderSelect ? (installmentProviderSelect.value || '').trim() : '';

        if (selectedPaymentMethod === 'installment' && !installmentProvider) {
            showToast('يرجى اختيار مقدم خدمة التقسيط.', 'info');
            return;
        }

        // التحقق من المصادقة
        if (!ensureAuthenticated(event)) {
            return;
        }

        // لا حاجة للتوكن اليدوي - postJson يتولى كل شيء تلقائياً
        await ensureCartStateLoaded(true);

        const state = getCartStateSafe();
        if (!Array.isArray(state.items) || !state.items.length) {
            showToast('سلة المشتريات فارغة.', 'warning');
            return;
        }

        const cartId = getCartIdSafe();
        if (!cartId) {
            showToast('خطأ في معرف السلة. يرجى تحديث الصفحة والمحاولة مرة أخرى.', 'error');
            return;
        }

        const user = getCurrentUserSafe();

        if (state.userId && user?.id && state.userId !== user.id) {
            showToast('هذه السلة لا تنتمي لحسابك. يرجى تحديث الصفحة.', 'error');
            return;
        }

        const payload = buildOrderPayload(selectedAddress, selectedPaymentMethod, state, user, installmentProvider);

        toggleSubmitButton(confirmBtn, true, originalContent);

        try {
            const handlingResult = await processOrderSubmission({
                paymentMethod: selectedPaymentMethod,
                payload,
                cartId
            });

            if (handlingResult?.redirectUrl) {
                window.location.href = handlingResult.redirectUrl;
                return;
            }

            if (selectedPaymentMethod === 'installment') {
                window.location.href = '/installment-provider-selection';
                return;
            }

            if (handlingResult?.message) {
                showToast(handlingResult.message, 'success');
            } else {
                showToast('تم إنشاء الطلب بنجاح! سيتم التواصل معك قريباً.', 'success');
            }

            await finalizeSuccessfulOrder();
        } catch (error) {
            let errorMessage = 'تعذر إنشاء الطلب. حاول مرة أخرى.';

            if (error.status === 400) {
                errorMessage = error.message || 'بيانات الطلب غير صحيحة.';
            } else if (error.status === 401) {
                errorMessage = 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.';
            } else if (error.status === 403) {
                errorMessage = 'هذه السلة لا تنتمي لحسابك.';
            } else if (error.status === 404) {
                errorMessage = 'السلة غير موجودة. يرجى تحديث الصفحة.';
            } else if (error.status === 500) {
                errorMessage = 'خطأ في الخادم. يرجى المحاولة لاحقاً.';
            }

            showToast(errorMessage, 'error');
        } finally {
            toggleSubmitButton(confirmBtn, false, originalContent);
        }
    }

    async function finalizeSuccessfulOrder() {
        try {
            if (typeof clearCartContents === 'function') {
                await clearCartContents();
            }
        } catch (clearError) {
        }

        try {
            updateCartCount();
            renderCart();
        } catch (uiError) {
        }

        redirectToProfileOrders();
    }

    function updateCartCount() {
        const cartCount = document.getElementById('cart-count');
        if (cartCount && typeof getCartItemCount === 'function') {
            cartCount.textContent = getCartItemCount().toString();
        }
    }

    // Initialize on page load - wait for auth first
    window.addEventListener('load', async () => {
        // Ensure auth is loaded before initializing cart
        if (typeof ensureAuthUserLoaded === 'function') {
            await ensureAuthUserLoaded(false);
        }

        ensureCartStateLoaded(true)
            .then(() => {
                const cartId = getCartIdSafe();
                if (cartId) {
                } else {
                }
            })
            .catch(error => {
            })
            .finally(() => {
                renderCart();
                updateCartCount();
            });
    });

    // Listen for cart updates
    document.addEventListener('cart:updated', () => {
        // Reset address loading flag so addresses reload properly after cart changes
        checkoutAddressesLoaded = false;
        renderCart();
        updateCartCount();
    });

    document.addEventListener('cart:loading', ({ detail }) => {
        if (!detail?.loading) return;
        const container = document.getElementById('cartContainer');
        if (container) {
            const loadingHtml = `
                <div class="empty-cart cart-loading-container">
                    <i class="fa fa-spinner fa-spin cart-loading-spinner-icon"></i>
                    <h3>جاري تحميل السلة...</h3>
                </div>
            `;
            safeSetHTML(container, sanitizeHtmlContent(loadingHtml));
        }
    });

    // -------------------------------------------------
    // إصلاح مشكلة إظهار خيارات التقسيط (Installment Options)
    // -------------------------------------------------

    // مراقب لجميع تغييرات طريقة الدفع
    function setupInstallmentToggle() {
        const paymentMethods = document.querySelectorAll('select[name="paymentMethod"]');
        const installmentOptionsContainer = document.getElementById('installment-options-container');

        if (paymentMethods.length && installmentOptionsContainer) {
            paymentMethods.forEach(select => {
                select.addEventListener('change', function () {
                    toggleInstallmentOptions();
                });
            });
        }
    }

    function toggleInstallmentOptions() {
        const paymentMethodSelect = document.querySelector('select[name="paymentMethod"]');
        const installmentOptionsContainer = document.getElementById('installment-options-container');

        if (paymentMethodSelect && installmentOptionsContainer) {
            const selectedMethod = paymentMethodSelect.value;

            // تحقق: هل القيمة المختارة هي 'installment'؟
            if (selectedMethod === 'installment' || selectedMethod === 'tabby' || selectedMethod === 'tamara') {
                // إذا كان تقسيط، أظهر الحاوية
                installmentOptionsContainer.style.display = 'block';
                installmentOptionsContainer.classList.remove('hidden');
            } else {
                // خلاف ذلك (نقداً، بطاقة، إلخ)، اخفِ الحاوية
                installmentOptionsContainer.style.display = 'none';
                installmentOptionsContainer.classList.add('hidden');
            }
        }
    }

    // تشغيل التبديل الأولي عند تحميل الصفحة
    setTimeout(function () {
        setupInstallmentToggle();
        toggleInstallmentOptions();
    }, 100);

    // ===================================================================
    // نهاية الإضافات الجديدة
    // ===================================================================

    // Export functions for external use
    function submitOrder(event) {
        return submitOrderWithSelectedAddress(event);
    }

    window.actionSportsOrders = {
        getCartIdSafe,
        submitOrder,
        buildOrderPayload
    };

})();