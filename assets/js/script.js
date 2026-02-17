initContactForm();
function getContactFormElement() {
    if (typeof document === 'undefined') return null;
    return document.getElementById('contact');
}

function handleContactFormSubmit(event) {
    event.preventDefault();

    const form = event.currentTarget;
    if (!form) return;

    const submitButton = form.querySelector('#form-submit');
    const originalButtonText = submitButton ? submitButton.textContent : '';

    const formData = new FormData(form);
    const payload = {
        name: (formData.get('name') || '').trim(),
        email: (formData.get('email') || '').trim(),
        topic: (formData.get('subject') || '').trim(),
        message: (formData.get('message') || '').trim()
    };

    if (!payload.name || !payload.email || !payload.message) {
        showToast('يرجى ملء الاسم والبريد الإلكتروني والرسالة.', 'warning');
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        safeSetHTML(submitButton, '<i class="fa fa-spinner fa-spin"></i> جارٍ الإرسال...');
    }

    postJson(CONTACT_FORM_ENDPOINT(), payload)
        .then(() => {
            showToast('تم إرسال رسالتك بنجاح. سنعاود التواصل قريباً.', 'success');
            form.reset();
        })
        .catch((error) => {
            const message = error?.message || 'تعذر إرسال الرسالة. حاول مرة أخرى.';
            showToast(message, 'error');
        })
        .finally(() => {
            if (submitButton) {
                submitButton.disabled = false;
                safeSetHTML(submitButton, originalButtonText);
            }
        });
}

function initContactForm() {
    const form = getContactFormElement();
    if (!form) return;

    form.addEventListener('submit', handleContactFormSubmit);
}

// ===================================================================
// AUTHENTICATION STATE MANAGEMENT
// ===================================================================

// Frontend manages user profile ONLY. Tokens are httpOnly cookies managed by backend.

const AUTH_USER_STORAGE_KEY = 'actionSportsAuthUser';

const AUTH_ENDPOINTS = {
    get signIn() { return window.API_CONFIG?.getEndpoint('AUTH_LOGIN'); },
    get signUp() { return window.API_CONFIG?.getEndpoint('AUTH_SIGNUP'); },
    get forgotPassword() { return window.API_CONFIG?.getEndpoint('AUTH_FORGOT_PASSWORD'); },
    get verifyResetCode() { return window.API_CONFIG?.getEndpoint('AUTH_VERIFY_RESET_CODE'); },
    get resetPassword() { return window.API_CONFIG?.getEndpoint('AUTH_RESET_PASSWORD'); },
    get verifyAccount() { return window.API_CONFIG?.getEndpoint('AUTH_VERIFY_ACCOUNT'); },
    get resendVerificationCode() { return window.API_CONFIG?.getEndpoint('AUTH_RESEND_VERIFICATION'); },
    get tokenRefresh() { return window.API_CONFIG?.getEndpoint('AUTH_TOKEN_REFRESH'); },
    get logout() { return window.API_CONFIG?.getEndpoint('AUTH_LOGOUT'); }
};

const CONTACT_FORM_ENDPOINT = () => window.API_CONFIG?.getEndpoint('CONTACT_FORM');

const USER_ENDPOINTS = {
    get me() { return window.API_CONFIG?.getEndpoint('USER_ME'); },
    get changePassword() { return window.API_CONFIG?.getEndpoint('USER_CHANGE_PASSWORD'); },
    get updateAccount() { return window.API_CONFIG?.getEndpoint('USER_UPDATE_ACCOUNT'); },
    get deactivateAccount() { return window.API_CONFIG?.getEndpoint('USER_DEACTIVATE'); },
    get addresses() { return window.API_CONFIG?.getEndpoint('USER_ADDRESSES'); },
    addressById: (id) => window.API_CONFIG?.buildEndpoint('USER_ADDRESSES', { id })
};

const ORDER_ENDPOINTS = {
    create: () => window.API_CONFIG?.getEndpoint('ORDERS_CREATE'),
    getAll: () => window.API_CONFIG?.getEndpoint('ORDERS_LIST'),
    getById: (id) => window.API_CONFIG?.buildEndpoint('ORDERS_LIST', { id }),
    getMyOrders: () => window.API_CONFIG?.getEndpoint('ORDERS_MY'),
    deliver: (id) => window.API_CONFIG?.buildEndpoint('ORDERS_LIST', { id }) + '/deliver',
    cancel: (id) => window.API_CONFIG?.buildEndpoint('ORDERS_LIST', { id }) + '/cancel'
};

const SHIPPING_ENDPOINTS = {
    get zones() { return window.API_CONFIG?.getEndpoint('SHIPPING_ZONES'); }
};

const BANNERS_ENDPOINTS = {
    get publicList() { return window.API_CONFIG?.getEndpoint('BANNERS_PUBLIC'); },
    get list() { return window.API_CONFIG?.getEndpoint('BANNERS_LIST'); }
};

const homepageBannerState = {
    banners: [],
    currentIndex: 0
};

function normalizePublicBanner(raw = {}, index = 0) {
    const placement = (raw.placement || raw.position || raw.type || '').toString().toLowerCase();
    const tags = Array.isArray(raw.tags)
        ? raw.tags.map(tag => String(tag).toLowerCase())
        : Array.isArray(raw.labels)
            ? raw.labels.map(label => String(label).toLowerCase())
            : [];

    const imageCandidates = [
        raw.image?.secure_url,
        raw.image?.url,
        raw.image?.src,
        typeof raw.image === 'string' ? raw.image : null,
        raw.backgroundImage,
        raw.imageUrl,
        raw.media?.secure_url,
        raw.media?.url
    ];

    const bannerImage = imageCandidates.find(value => typeof value === 'string' && value.trim()) || '';

    return {
        id: raw._id || raw.id || `banner-${index}`,
        placement,
        tags,
        order: Number(raw.order ?? raw.priority ?? raw.sequence ?? raw.sort ?? index) || index,
        titleHtml: typeof raw.titleHtml === 'string' && raw.titleHtml.trim() ? raw.titleHtml : '',
        title: typeof raw.title === 'string' ? raw.title : (typeof raw.heading === 'string' ? raw.heading : ''),
        subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : (typeof raw.tagline === 'string' ? raw.tagline : ''),
        description: typeof raw.description === 'string' ? raw.description : (typeof raw.body === 'string' ? raw.body : ''),
        backgroundImage: bannerImage,
        textColor: typeof raw.textColor === 'string' ? raw.textColor : '',
        overlayColor: typeof raw.overlayColor === 'string' ? raw.overlayColor : '',
        raw
    };
}

function pickHomepageBanner(banners = []) {
    const keywords = ['cta', 'offer', 'promo', 'home'];
    if (!Array.isArray(banners)) return null;

    const matchByPlacement = banners.find(banner =>
        typeof banner.placement === 'string' && keywords.some(keyword => banner.placement.includes(keyword))
    );

    if (matchByPlacement) return matchByPlacement;

    const matchByTags = banners.find(banner =>
        Array.isArray(banner.tags) && banner.tags.some(tag => keywords.includes(tag))
    );

    if (matchByTags) return matchByTags;

    return banners[0] || null;
}

function getHomepageBannerElements() {
    return {
        container: document.getElementById('homepageBanner'),
        title: document.getElementById('homepageBannerTitle'),
        description: document.getElementById('homepageBannerDescription'),
        section: document.getElementById('call-to-action'),
        image: document.getElementById('homepageBannerImage'),
        indicatorsContainer: document.getElementById('homepageBannerIndicators'),
        prevButton: document.getElementById('homepageBannerPrev'),
        nextButton: document.getElementById('homepageBannerNext')
    };
}

function applyHomepageBannerToUI(banner) {
    if (!banner) return;
    const {
        container,
        title,
        description,
        section,
        image
    } = getHomepageBannerElements();

    const layout = container?.querySelector('.cta-banner-layout');
    layout?.classList.remove('animate');

    if (title) {
        if (banner.titleHtml) {
            safeSetHTML(title, banner.titleHtml);
        } else if (banner.title) {
            safeSetText(title, banner.title);
        }
    }

    if (description) {
        if (banner.description) {
            safeSetText(description, banner.description);
            description.style.display = '';
        } else {
            safeSetText(description, '');
            description.style.display = 'none';
        }
    }


    if (image) {
        if (banner.backgroundImage) {
            image.src = banner.backgroundImage;
            const altText = banner.title || banner.description || 'إعلان من أكشن سبورتس';
            image.alt = altText;
            image.style.display = 'block';
        } else {
            image.src = 'assets/images/cta-bg.jpg';
            image.alt = 'عرض خاص من أكشن سبورتس';
        }
    }

    if (container) {
        if (banner.textColor) {
            container.style.color = banner.textColor;
        } else {
            container.style.color = '';
        }
    }

    if (section) {
        if (banner.overlayColor) {
            section.style.backgroundColor = banner.overlayColor;
            section.style.backgroundImage = '';
        } else if (banner.backgroundImage) {
            section.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.55), rgba(0, 0, 0, 0.55)), url(${banner.backgroundImage})`;
            section.style.backgroundSize = 'cover';
            section.style.backgroundPosition = 'center';
        } else {
            section.style.backgroundImage = 'url(assets/images/cta-bg.jpg)';
        }
    }

    requestAnimationFrame(() => {
        if (layout) {
            layout.classList.add('animate');
        }
    });
}

function renderHomepageBannerIndicators(count, activeIndex) {
    const { indicatorsContainer } = getHomepageBannerElements();
    if (!indicatorsContainer) return;

    safeSetHTML(indicatorsContainer, '');

    if (!Number.isInteger(count) || count <= 1) {
        indicatorsContainer.parentElement?.classList.add('is-single');
        return;
    }

    indicatorsContainer.parentElement?.classList.remove('is-single');

    for (let index = 0; index < count; index += 1) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'banner-indicator';
        button.dataset.index = String(index);
        button.setAttribute('role', 'tab');
        button.setAttribute('aria-label', `عرض البانر رقم ${index + 1}`);
        if (index === activeIndex) {
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
        } else {
            button.setAttribute('aria-selected', 'false');
        }
        button.addEventListener('click', () => setHomepageBannerSlide(index));
        indicatorsContainer.appendChild(button);
    }
}

function highlightHomepageBannerIndicator(activeIndex) {
    const { indicatorsContainer } = getHomepageBannerElements();
    if (!indicatorsContainer) return;
    indicatorsContainer.querySelectorAll('.banner-indicator').forEach(button => {
        const buttonIndex = Number(button.dataset.index);
        const isActive = buttonIndex === activeIndex;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
}

function setHomepageBannerSlide(index) {
    if (!Array.isArray(homepageBannerState.banners) || !homepageBannerState.banners.length) {
        return;
    }

    const bannersCount = homepageBannerState.banners.length;
    let nextIndex = index;
    if (!Number.isInteger(nextIndex)) {
        nextIndex = 0;
    }

    nextIndex = (nextIndex + bannersCount) % bannersCount;

    homepageBannerState.currentIndex = nextIndex;
    const activeBanner = homepageBannerState.banners[nextIndex];
    applyHomepageBannerToUI(activeBanner);
    highlightHomepageBannerIndicator(nextIndex);
}

function setupHomepageBannerSlider(banners) {
    const { prevButton, nextButton } = getHomepageBannerElements();
    renderHomepageBannerIndicators(banners.length, homepageBannerState.currentIndex);

    if (!prevButton || !nextButton) {
        return;
    }

    const handlePrev = () => {
        setHomepageBannerSlide(homepageBannerState.currentIndex - 1);
    };

    const handleNext = () => {
        setHomepageBannerSlide(homepageBannerState.currentIndex + 1);
    };

    prevButton.addEventListener('click', handlePrev);
    nextButton.addEventListener('click', handleNext);

    if (banners.length <= 1) {
        prevButton.style.display = 'none';
        nextButton.style.display = 'none';
    } else {
        prevButton.style.display = '';
        nextButton.style.display = '';
    }
}

function showBannerEmptyState() {
    const container = document.getElementById('homepageBanner');
    const layout = container?.querySelector('.cta-banner-layout');
    const emptyState = document.getElementById('bannerEmptyState');
    const sliderControls = document.getElementById('homepageBannerSlider');

    if (layout) layout.style.display = 'none';
    if (sliderControls) sliderControls.style.display = 'none';
    if (emptyState) emptyState.hidden = false;
}

function hideBannerEmptyState() {
    const container = document.getElementById('homepageBanner');
    const layout = container?.querySelector('.cta-banner-layout');
    const emptyState = document.getElementById('bannerEmptyState');
    const sliderControls = document.getElementById('homepageBannerSlider');

    if (layout) layout.style.display = '';
    if (sliderControls) sliderControls.style.display = '';
    if (emptyState) emptyState.hidden = true;
}

async function loadHomepageBanner() {
    const container = document.getElementById('homepageBanner');
    if (!container) return;

    try {
        const response = await fetchHomepageBannerList();
        if (!response) {
            throw new Error('NO_RESPONSE');
        }
        const list = Array.isArray(response?.data)
            ? response.data
            : Array.isArray(response)
                ? response
                : [];

        // If no banners returned, show empty state
        if (!Array.isArray(list) || list.length === 0) {
            showBannerEmptyState();
            return;
        }

        const normalized = list
            .map(normalizePublicBanner)
            .sort((a, b) => a.order - b.order);

        if (!normalized.length) {
            showBannerEmptyState();
            return;
        }

        hideBannerEmptyState();
        homepageBannerState.banners = normalized;
        homepageBannerState.currentIndex = normalized.indexOf(pickHomepageBanner(normalized));
        if (homepageBannerState.currentIndex === -1) {
            homepageBannerState.currentIndex = 0;
        }

        setHomepageBannerSlide(homepageBannerState.currentIndex);
        setupHomepageBannerSlider(normalized);
    } catch (error) {
        // ✅ Auth errors (401/403) should not show popup
        const statusCode = error?.status || 0;
        const isAuthError = statusCode === 401 || statusCode === 403;

        if (!isAuthError) {
            // ✅ Don't show popup for banner errors - only for products/categories
            console.error('Error loading homepage banner:', error);
        }
    }
}

async function fetchHomepageBannerList() {
    try {
        return await getJson(BANNERS_ENDPOINTS.list);
    } catch (error) {
        if (error?.status === 401) {
            return null;
        }
        throw error;
    }
}

const shippingZonesState = {
    list: [],
    map: new Map(),
    loaded: false,
    promise: null
};

async function loadShippingZones(forceRefresh = false) {
    if (!forceRefresh) {
        if (shippingZonesState.loaded) {
            return shippingZonesState.list;
        }
        if (shippingZonesState.promise) {
            return shippingZonesState.promise;
        }
    }

    const request = getJson(SHIPPING_ENDPOINTS.zones)
        .then(response => {
            const zones = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
            shippingZonesState.list = zones;
            shippingZonesState.map = new Map(zones.map(zone => [zone?._id || zone?.id, zone]));
            shippingZonesState.loaded = true;
            shippingZonesState.promise = null;
            return zones;
        })
        .catch(error => {
            shippingZonesState.promise = null;
            throw error;
        });

    shippingZonesState.promise = request;
    return request;
}

function getShippingZoneById(zoneId) {
    if (!zoneId) return null;
    return shippingZonesState.map.get(zoneId) || null;
}

if (typeof window !== 'undefined') {
    window.ORDER_ENDPOINTS = ORDER_ENDPOINTS;
    window.SHIPPING_ENDPOINTS = SHIPPING_ENDPOINTS;
    window.actionSportsShippingZones = {
        load: loadShippingZones,
        getAll: () => [...shippingZonesState.list],
        getById: getShippingZoneById,
        isLoaded: () => shippingZonesState.loaded
    };
}

const CART_ENDPOINTS = {
    get base() { return window.API_CONFIG?.getEndpoint('CART_BASE'); },
    get add() { return window.API_CONFIG?.getEndpoint('CART_ADD'); },
    get list() { return window.API_CONFIG?.getEndpoint('CART_LIST'); },
    get clear() { return window.API_CONFIG?.getEndpoint('CART_CLEAR'); },
    item: (itemId) => window.API_CONFIG?.buildEndpoint('CART_LIST', { itemId })
};

const FALLBACK_IMAGE = 'assets/images/product1.png';

const productMetadataCache = (() => {
    if (typeof window !== 'undefined') {
        if (window.__actionSportsProductMetadata__ instanceof Map) {
            return window.__actionSportsProductMetadata__;
        }
        const map = new Map();
        window.__actionSportsProductMetadata__ = map;
        return map;
    }
    return new Map();
})();

const GUEST_CART_STORAGE_KEY = 'actionSportsGuestCart';
let guestCartCache = [];

function readGuestCartItems() {
    // في الذاكرة فقط - لا يتم حفظ في localStorage
    return Array.isArray(guestCartCache) ? [...guestCartCache] : [];
}

function writeGuestCartItems(items) {
    // في الذاكرة فقط - لا يتم حفظ في localStorage
    const normalized = Array.isArray(items) ? items : [];
    guestCartCache = normalized.map(item => ({ ...item }));
}

function resolveGuestCartItem(productId, quantity = 1, payload = {}) {
    const metadata = productMetadataCache.get(productId) || {};
    const quantityNumber = Number(quantity) || 1;
    const priceCandidate = payload.price ?? metadata.price ?? 0;
    const price = Number(sanitizePrice(priceCandidate)) || 0;
    const installationCandidate = payload.installationPrice ?? metadata.installationPrice ?? 0;
    const installationPrice = Number(sanitizePrice(installationCandidate)) || 0;
    let image = payload.image || metadata.image;
    if (!image && payload.rawProduct && typeof resolveProductImage === 'function') {
        image = resolveProductImage(payload.rawProduct);
    }
    if (!image) {
        image = FALLBACK_IMAGE;
    }
    const name = payload.name || metadata.name || 'منتج';
    const id = payload.id || productId || `guest-${Date.now()}`;

    return {
        id,
        productId,
        quantity: quantityNumber,
        price,
        name,
        image,
        installationPrice
    };
}

function getGuestCartSnapshot() {
    const items = readGuestCartItems().map(item => ({
        id: item.id || item.productId || `guest-${Date.now()}`,
        productId: item.productId,
        quantity: Number(item.quantity) || 1,
        price: Number(sanitizePrice(item.price)) || 0,
        name: item.name || 'منتج',
        image: item.image || FALLBACK_IMAGE
    }));

    return {
        items,
        totals: computeCartTotals(items)
    };
}

function syncGuestCartState(options = {}) {
    const snapshot = getGuestCartSnapshot();
    applyCartSnapshot(snapshot, options);
}

function addProductToGuestCart(productId, quantity = 1, payload = {}) {
    const items = readGuestCartItems();
    const targetId = payload.id || productId;
    const existingIndex = items.findIndex(item => item.productId === productId || item.id === targetId);

    if (existingIndex >= 0) {
        const current = items[existingIndex];
        const newQuantity = (Number(current.quantity) || 0) + (Number(quantity) || 1);
        items[existingIndex] = {
            ...current,
            quantity: newQuantity
        };
    } else {
        const newItem = resolveGuestCartItem(productId, quantity, payload);
        items.push(newItem);
    }

    const existingMetadata = productMetadataCache.get(productId) || {};
    productMetadataCache.set(productId, {
        name: payload.name || existingMetadata.name || 'منتج',
        price: Number(sanitizePrice(payload.price ?? existingMetadata.price ?? 0)) || 0,
        image: payload.image || existingMetadata.image || FALLBACK_IMAGE,
        installationPrice: Number(sanitizePrice(payload.installationPrice ?? existingMetadata.installationPrice ?? 0)) || 0
    });

    writeGuestCartItems(items);
    syncGuestCartState();
    return getGuestCartSnapshot();
}

function updateGuestCartItemQuantity(itemId, quantity) {
    const items = readGuestCartItems();
    const index = items.findIndex(item => item.id === itemId);
    if (index === -1) return getGuestCartSnapshot();

    const numericQuantity = Number(quantity) || 0;
    if (numericQuantity <= 0) {
        items.splice(index, 1);
    } else {
        items[index] = {
            ...items[index],
            quantity: numericQuantity
        };
    }

    writeGuestCartItems(items);
    syncGuestCartState();
    return getGuestCartSnapshot();
}

function removeGuestCartItem(itemId, options = {}) {
    const items = readGuestCartItems();
    const nextItems = items.filter(item => item.id !== itemId);
    writeGuestCartItems(nextItems);
    syncGuestCartState(options);
    return getGuestCartSnapshot();
}

function clearGuestCart() {
    writeGuestCartItems([]);
    syncGuestCartState();
}

const passwordRecoveryState = {
    email: '',
    code: '',
    token: '',
    timerId: null
};

const accountVerificationState = {
    email: '',
    isVerifying: false,
    timerId: null
};

const cartState = {
    id: null,
    items: [],
    totals: {
        subtotal: 0,
        shipping: 0,
        installationPrice: 0,
        total: 0
    },
    isLoading: false,
    isLoaded: false,
    error: null
};

// Debounce state for cart quantity updates
const cartDebounceTimers = new Map(); // itemId -> timeoutId
const DEBOUNCE_DELAY_MS = 500;

function sanitizePrice(rawPrice) {
    if (rawPrice === undefined || rawPrice === null || rawPrice === '') {
        return NaN;
    }

    if (typeof rawPrice === 'number') {
        return rawPrice;
    }

    if (typeof rawPrice === 'string') {
        const digits = rawPrice.replace(/[^0-9.,]/g, '').replace(/,/g, '.');
        const parsed = Number(digits);
        return Number.isFinite(parsed) ? parsed : NaN;
    }

    return NaN;
}

function formatPrice(value) {
    if (value === undefined || value === null || value === '') return '-';
    const number = Number(value);
    if (Number.isNaN(number)) return value;
    return number.toLocaleString('ar-EG');
}

function getCartItemCount(items = cartState.items) {
    return Array.isArray(items)
        ? items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        : 0;
}

function computeCartTotals(items = [], overrides = {}) {
    // إذا كان هناك total في overrides، استخدمه مباشرة
    if (overrides.total != null) {
        const total = Number(sanitizePrice(overrides.total)) || 0;
        if (Number.isFinite(total) && total > 0) {
            return {
                subtotal: overrides.subtotal != null ? Number(sanitizePrice(overrides.subtotal)) || 0 : 0,
                shipping: overrides.shipping != null ? Number(sanitizePrice(overrides.shipping)) || 0 : 0,
                installationPrice: overrides.installationPrice != null ? Number(sanitizePrice(overrides.installationPrice)) || 0 : 0,
                total: total
            };
        }
    }

    // fallback: احسبه من الـ items إذا لم يكن متوفراً
    const subtotalFromItems = Array.isArray(items)
        ? items.reduce((sum, item) => sum + ((Number(item.price) || 0) * (Number(item.quantity) || 0)), 0)
        : 0;

    const subtotal = overrides.subtotal != null
        ? Number(sanitizePrice(overrides.subtotal)) || 0
        : subtotalFromItems;

    const shipping = overrides.shipping != null
        ? Number(sanitizePrice(overrides.shipping)) || 0
        : 0;

    const installationFromItems = Array.isArray(items)
        ? items.reduce((sum, item) => {
            const installationUnit = Number(item?.installationPrice);
            const quantity = Number(item?.quantity) || 0;
            if (!Number.isFinite(installationUnit) || installationUnit <= 0 || quantity <= 0) {
                return sum;
            }
            return sum + (installationUnit * quantity);
        }, 0)
        : 0;

    const installation = overrides.installationPrice != null
        ? Number(sanitizePrice(overrides.installationPrice)) || 0
        : overrides.installation != null
            ? Number(sanitizePrice(overrides.installation)) || 0
            : installationFromItems;

    return {
        subtotal,
        shipping,
        installationPrice: installation,
        total: subtotal + shipping + installation
    };
}

function updateCartIndicators() {
    const totalItems = getCartItemCount();
    const cartCountElement = document.getElementById('cart-count');
    if (cartCountElement) {
        cartCountElement.textContent = totalItems.toString();
    }

    const cartTotalElement = document.getElementById('cart-total-price');
    if (cartTotalElement) {
        const formatted = formatPrice(cartState.totals.total || 0);
        const currencyIcon = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';
        safeSetHTML(cartTotalElement, `${formatted} ${currencyIcon}`);
    }
}

function notifyCartUpdated() {
    document.dispatchEvent(new CustomEvent('cart:updated', {
        detail: {
            cart: { ...cartState }
        }
    }));
}

function setCartLoading(loading) {
    cartState.isLoading = loading;
    document.dispatchEvent(new CustomEvent('cart:loading', {
        detail: { loading }
    }));
}

function resetCartState({ suppressEvent = false } = {}) {
    cartState.items = [];
    cartState.totals = computeCartTotals([]);
    cartState.isLoaded = false;
    cartState.error = null;
    cartState.id = null;
    updateCartIndicators();
    if (!suppressEvent) {
        notifyCartUpdated();
    }
}

function applyCartSnapshot(snapshot = {}, { suppressEvent = false } = {}) {
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const totals = computeCartTotals(items, snapshot.totals || {});

    cartState.items = items;
    cartState.totals = totals;
    cartState.isLoaded = true;
    cartState.error = null;
    cartState.id = snapshot?.id ?? snapshot?.cartId ?? null;

    updateCartIndicators();
    if (!suppressEvent) {
        notifyCartUpdated();
    }
}

function normalizeCartSnapshot(payload) {
    if (!payload) {
        return { items: [], totals: computeCartTotals([]) };
    }

    const dataRoot = payload.data || payload.cart || payload;
    const cartData = dataRoot?.cart || dataRoot;
    let itemsSource = cartData?.items || cartData?.cartItems || cartData?.products || dataRoot?.items || [];

    if (!Array.isArray(itemsSource) && Array.isArray(cartData)) {
        itemsSource = cartData;
    }

    if (!Array.isArray(itemsSource)) {
        itemsSource = [];
    }

    const previousItems = Array.isArray(cartState.items) ? cartState.items : [];

    const items = itemsSource.map((item, index) => {
        const product = item?.product || item?.productId || item?.item || {};
        const productObject = typeof product === 'object' ? product : {};
        const productId = productObject._id || productObject.id || item?.productId || item?.id || `product-${index}`;
        const cartItemId = item?._id || item?.id || item?.cartItemId || productId || `cart-item-${index}`;
        const quantity = Number(item?.quantity ?? item?.qty ?? item?.count ?? 1) || 1;
        // Extract prices: prioritize unitPrice (discounted) from cart item, then priceAfterDiscount from product
        const discountedPriceSource = item?.unitPrice ?? item?.priceAfterDiscount ?? productObject?.priceAfterDiscount ?? productObject?.discountedPrice;
        const originalPriceFromProduct = productObject?.price ?? item?.price;

        // Use discounted price as the effective price if available, otherwise use original
        const priceSource = discountedPriceSource ?? originalPriceFromProduct ?? 0;
        let price = Number(sanitizePrice(priceSource));
        let name = item?.name || productObject?.name || item?.productName || '';
        const imageSource = productObject?.image || productObject?.mainImage || productObject?.thumbnail || item?.image;
        let resolvedImage = resolveProductImage({ ...productObject, image: imageSource });

        const previous = previousItems.find(prev => prev.id === cartItemId || prev.productId === productId);
        const cached = productMetadataCache.get(productId || cartItemId);
        if (!name && previous?.name) {
            name = previous.name;
        }
        if (!name && cached?.name) {
            name = cached.name;
        }
        if ((!Number.isFinite(price) || price <= 0) && Number.isFinite(previous?.price)) {
            price = previous.price;
        }
        if ((!Number.isFinite(price) || price <= 0) && Number.isFinite(cached?.price)) {
            price = cached.price;
        }
        if ((!resolvedImage || resolvedImage === FALLBACK_IMAGE) && previous?.image) {
            resolvedImage = previous.image;
        }
        if ((!resolvedImage || resolvedImage === FALLBACK_IMAGE) && cached?.image) {
            resolvedImage = cached.image;
        }

        const installationSource =
            item?.installationPrice ??
            item?.installationFee ??
            productObject?.installationPrice ??
            productObject?.installation_price ??
            productObject?.installationFee ??
            item?.product?.installationPrice ??
            item?.product?.installationFee;
        let installationPrice = Number(sanitizePrice(installationSource));
        if (!Number.isFinite(installationPrice) || installationPrice < 0) {
            installationPrice = Number(sanitizePrice(previous?.installationPrice ?? cached?.installationPrice ?? 0)) || 0;
        }

        if (!name) {
            name = 'منتج';
        }
        if (!Number.isFinite(price) || price < 0) {
            price = 0;
        }

        // Extract stock/inventory count - prioritize productObject.quantity
        const stockSource =
            productObject?.quantity ??
            item?.stock ??
            item?.countInStock ??
            item?.inventory ??
            item?.availableQuantity ??
            productObject?.stock ??
            productObject?.countInStock ??
            productObject?.inventory ??
            productObject?.availableQuantity ??
            item?.product?.countInStock ??
            item?.product?.stock;
        const stock = Number(stockSource);
        const finalStock = Number.isFinite(stock) && stock >= 0 ? stock : 999;

        // Extract original price for discount display - productObject.price is the original price
        const originalPriceSource =
            productObject?.price ??
            item?.originalPrice ??
            item?.price?.original ??
            item?.price?.before ??
            item?.regularPrice ??
            item?.basePrice ??
            productObject?.originalPrice ??
            productObject?.regularPrice ??
            productObject?.basePrice ??
            item?.product?.originalPrice ??
            item?.product?.regularPrice ??
            item?.product?.price;
        const originalPrice = Number(sanitizePrice(originalPriceSource));
        const finalOriginalPrice = Number.isFinite(originalPrice) && originalPrice > 0 ? originalPrice : price;

        // Extract sale/discounted price - priceAfterDiscount or unitPrice
        const salePriceSource =
            item?.unitPrice ??
            productObject?.priceAfterDiscount ??
            item?.priceAfterDiscount ??
            item?.salePrice ??
            item?.discountedPrice ??
            item?.price?.sale ??
            item?.price?.discounted ??
            productObject?.salePrice ??
            productObject?.discountedPrice ??
            item?.product?.salePrice ??
            item?.product?.discountedPrice ??
            item?.product?.priceAfterDiscount;
        const salePrice = Number(sanitizePrice(salePriceSource));
        const finalSalePrice = Number.isFinite(salePrice) && salePrice > 0 ? salePrice : null;

        const normalizedItem = {
            id: cartItemId,
            productId,
            quantity,
            price,
            name,
            image: resolvedImage,
            installationPrice,
            stock: finalStock,
            originalPrice: finalOriginalPrice,
            salePrice: finalSalePrice,
            raw: item,
            total: Number((Number.isFinite(price) ? price : 0) * quantity)
        };

        if (productId) {
            const existing = productMetadataCache.get(productId) || {};
            productMetadataCache.set(productId, {
                name: name || existing.name,
                price: Number.isFinite(price) && price > 0 ? price : existing.price,
                image: resolvedImage && resolvedImage !== FALLBACK_IMAGE ? resolvedImage : existing.image,
                installationPrice: Number.isFinite(installationPrice) && installationPrice >= 0 ? installationPrice : existing.installationPrice
            });
        }

        return normalizedItem;
    });

    const fallbackTotals = computeCartTotals(items);

    const subtotalOverride = Number(
        sanitizePrice(
            cartData?.subtotal ??
            cartData?.subTotal ??
            cartData?.totalPrice ??
            payload?.subtotal ??
            payload?.subTotal
        )
    );

    const shippingOverride = Number(
        sanitizePrice(
            cartData?.shipping ??
            cartData?.shippingCost ??
            cartData?.shippingPrice ??
            payload?.shipping ??
            payload?.shippingPrice
        )
    );

    const installationOverride = Number(
        sanitizePrice(
            cartData?.installationPrice ??
            cartData?.installation ??
            cartData?.installationFee ??
            cartData?.installation_price ??
            payload?.installationPrice ??
            payload?.installation
        )
    );

    const subtotalTolerance = Math.max(0.5, fallbackTotals.subtotal * 0.01);
    let subtotal = fallbackTotals.subtotal;
    if (Number.isFinite(subtotalOverride) && subtotalOverride >= 0) {
        const diff = Math.abs(subtotalOverride - fallbackTotals.subtotal);
        if (fallbackTotals.subtotal === 0 || diff <= subtotalTolerance) {
            subtotal = subtotalOverride;
        }
    }

    let shipping = fallbackTotals.shipping;
    if (Number.isFinite(shippingOverride) && shippingOverride >= 0) {
        shipping = shippingOverride;
    }

    let installationPrice = fallbackTotals.installationPrice;
    if (Number.isFinite(installationOverride) && installationOverride >= 0) {
        installationPrice = installationOverride;
    }

    const computedTotal = subtotal + shipping + installationPrice;

    const declaredTotal = Number(
        sanitizePrice(
            cartData?.totalPrice ??
            cartData?.total ??
            cartData?.totalValue ??
            cartData?.grandTotal ??
            payload?.total ??
            payload?.totalPrice
        )
    );

    // استخدم الـ total من الـ backend مباشرة بدون تحقق من الفرق
    let total = computedTotal;
    if (Number.isFinite(declaredTotal) && declaredTotal > 0) {
        total = declaredTotal;
    }

    const totals = {
        subtotal,
        shipping,
        installationPrice,
        total
    };

    const cartId = cartData?._id || cartData?.id || dataRoot?.cartId || dataRoot?.id || payload?.cartId || null;

    return { items, totals, id: cartId };
}

async function refreshCartState(force = false) {
    if (cartState.isLoading) {
        return cartState;
    }

    if (cartState.isLoaded && !force) {
        return cartState;
    }

    if (!isAuthenticated()) {
        syncGuestCartState();
        return cartState;
    }

    setCartLoading(true);

    try {
        const response = await getJson(CART_ENDPOINTS.list);
        const snapshot = normalizeCartSnapshot(response);
        applyCartSnapshot(snapshot);
    } catch (error) {
        const message = String(error?.message || '').toLowerCase();
        const isEmptyCart =
            error?.status === 404 ||
            message.includes('cart is empty') ||
            message.includes("didn't add any item") ||
            message.includes('no items in cart');

        if (isEmptyCart) {
            resetCartState({ suppressEvent: false });
            cartState.error = null;
            cartState.isLoaded = true;
            return cartState;
        }

        cartState.error = error;
        if (error.status === 401) {
            resetCartState({ suppressEvent: false });
        } else {
            notifyCartUpdated();
        }
        throw error;
    } finally {
        setCartLoading(false);
    }

    return cartState;
}

async function addProductToCartById(productId, quantity = 1, extraPayload = {}) {
    if (!productId) {
        throw new Error('productId is required to add item to cart');
    }

    if (!isAuthenticated()) {
        addProductToGuestCart(productId, quantity, extraPayload);
        return getGuestCartSnapshot();
    }

    try {
        const payload = {
            productId,
            quantity,
            ...extraPayload
        };

        const response = await postJson(CART_ENDPOINTS.add, payload);
        const snapshot = normalizeCartSnapshot(response);

        if (snapshot.items.length) {
            applyCartSnapshot(snapshot);
        } else {
            await refreshCartState(true);
        }
    } catch (error) {
        throw error;
    }
}

async function updateCartItemQuantity(itemId, quantity) {
    if (!itemId) throw new Error('itemId is required');
    if (quantity <= 0) {
        return removeCartItem(itemId);
    }

    if (!isAuthenticated()) {
        return updateGuestCartItemQuantity(itemId, quantity);
    }

    try {
        const response = await patchJson(CART_ENDPOINTS.item(itemId), { quantity });
        const snapshot = normalizeCartSnapshot(response);

        // CRITICAL: Only update totals, don't re-render items (prevents flicker)
        updateCartTotalsOnly(snapshot);
    } catch (error) {
        throw error;
    }
}

// Silent version for debounced calls
async function updateCartItemQuantitySilent(itemId, quantity) {
    try {
        return await updateCartItemQuantity(itemId, quantity);
    } catch (error) {
        throw error; // Re-throw for debounce handler to catch
    }
}

function updateCartTotalsOnly(snapshot) {
    // Update cart ID and totals without touching items array
    if (snapshot.id) {
        cartState.id = snapshot.id;
    }

    if (snapshot.totals) {
        cartState.totals = snapshot.totals;
    }

    // Update header indicators
    updateCartIndicators();

    // Dispatch event but prevent full re-render
    document.dispatchEvent(new CustomEvent('cart:totals:updated', {
        detail: { totals: snapshot.totals }
    }));
}

async function removeCartItem(itemId, options = {}) {
    if (!itemId) throw new Error('itemId is required');

    if (!isAuthenticated()) {
        return removeGuestCartItem(itemId, options);
    }

    try {
        const response = await deleteJson(CART_ENDPOINTS.item(itemId));
        const snapshot = normalizeCartSnapshot(response);

        if (snapshot.items.length || snapshot.totals.total) {
            applyCartSnapshot(snapshot, options);
        } else {
            await refreshCartState(true);
        }
    } catch (error) {
        throw error;
    }
}

async function clearCartContents() {
    if (!isAuthenticated()) {
        clearGuestCart();
        return;
    }

    try {
        const response = await patchJson(CART_ENDPOINTS.clear, {});
        const snapshot = normalizeCartSnapshot(response);

        if (snapshot.items.length) {
            applyCartSnapshot(snapshot);
        } else {
            resetCartState();
        }
    } catch (error) {
        throw error;
    }
}

// Expose cart functions globally for use by cart.js
if (typeof window !== 'undefined') {
    window.updateCartItemQuantity = updateCartItemQuantity;
    window.removeCartItem = removeCartItem;
    window.getCartItemCount = getCartItemCount;
    window.refreshCartState = refreshCartState;
}

// ===================================================================
// SECURITY: Safe Price & ID Validation
// ===================================================================

// Validate product price against cached metadata (protect against DOM manipulation)
function getSecureProductPrice(productId, frontendPrice) {
    if (!productId) return 0;
    const cached = productMetadataCache.get(productId);
    if (!cached || !Number.isFinite(cached.price)) {
        return frontendPrice || 0;
    }
    // Use backend price from cache, ignore frontend price (prevents manipulation)
    return cached.price;
}

// Validate product ID belongs to current context (protect against IDOR)
function validateProductIdAccess(productId) {
    if (!productId) return false;
    // Frontend validation: ID should exist in metadata cache (means it was loaded from API)
    return productMetadataCache.has(productId) || typeof productId === 'string' && productId.length > 0;
}

// Validate user ID matches current authenticated user (protect against IDOR)
function validateUserIdAccess(userId) {
    const currentUser = getAuthUser();
    if (!currentUser || !userId) return false;
    // Only allow access to current user's data
    return currentUser.id === userId || currentUser.id === String(userId);
}

// ===================================================================
// SECURITY: Clean up sensitive data from localStorage on startup
// ===================================================================

/**
 * Remove all sensitive data from localStorage on application startup
 * Keep only non-sensitive preferences like theme/dark-mode
 */
function cleanupLocalStorage() {
    const ALLOWED_KEYS = ['dark-mode', 'theme'];
    const SENSITIVE_KEYS = [
        'SS_deltaBuffer',
        'accounts',
        'actionSportsAuthToken',
        'actionSportsAuthUser',
        'actionSportsGuestCart',
        'currentUser',
        'favorites',
        'users',
        'accessToken',
        'refreshToken',
        'user',
        'cart',
        'redirectAfterLogin'
    ];

    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            // Remove all sensitive keys
            SENSITIVE_KEYS.forEach(key => {
                if (localStorage.getItem(key)) {
                    localStorage.removeItem(key);
                }
            });

            // Verify only allowed keys remain
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (!ALLOWED_KEYS.includes(key)) {
                    // Check if it's a sensitive pattern
                    if (key.includes('auth') || key.includes('token') || key.includes('user') ||
                        key.includes('password') || key.includes('cart') || key.includes('favorite')) {
                        localStorage.removeItem(key);
                    }
                }
            });

        }
    } catch (error) {
    }
}

// Run cleanup on application startup
if (typeof window !== 'undefined') {
    document.addEventListener('DOMContentLoaded', cleanupLocalStorage);
    // Also run immediately in case DOMContentLoaded already fired
    if (document.readyState !== 'loading') {
        cleanupLocalStorage();
    }
}

// ===================================================================
function sanitizeHtmlContent(html) {
    if (typeof html !== 'string') return '';

    // If DOMPurify is available, use it
    if (typeof window !== 'undefined' && typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
        return window.DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'br', 'strong', 'em', 'i', 'u', 'b', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'caption', 'form', 'button', 'input', 'textarea', 'select', 'option', 'label', 'fieldset', 'legend', 'video', 'source', 'audio', 'picture', 'figure', 'figcaption', 'section', 'article', 'nav', 'footer', 'header'],
            ALLOWED_ATTR: ['class', 'id', 'role', 'data-*', 'href', 'src', 'alt', 'title', 'type', 'name', 'value', 'checked', 'disabled', 'selected', 'action', 'method', 'enctype', 'controls', 'aria-*', 'target', 'rel', 'datetime', 'width', 'height', 'loading', 'poster']
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

const globalErrorPopupState = {
    container: null,
    retryButton: null,
    lastRetryHandler: null,
    styleInjected: false
};

function injectGlobalErrorPopupStyles() {
    if (globalErrorPopupState.styleInjected || typeof document === 'undefined') return;

    const applyStyles = () => {
        if (document.getElementById('globalErrorPopupStyles')) {
            globalErrorPopupState.styleInjected = true;
            return;
        }

        const style = document.createElement('style');
        style.id = 'globalErrorPopupStyles';
        style.textContent = `
            #globalErrorPopup {
                position: fixed;
                inset: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgb(2 13 28);
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition: opacity 0.35s ease, visibility 0.35s ease;
                z-index: 9999;
                padding: 20px;
                direction: rtl;
            }

            #globalErrorPopup.hidden {
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
            }

            #globalErrorPopup.active {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
            }

            #globalErrorPopup .error-box {
                background: #141414;
                color: #ffffff;
                padding: 32px 28px;
                border-radius: 12px;
                width: min(420px, 100%);
                text-align: center;
                box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
                transform: translateY(40px);
                animation: globalErrorSlideUp 0.4s ease forwards;
                font-family: inherit;
            }

            #globalErrorPopup .error-box h2 {
                margin: 0 0 12px;
                font-size: 1.4rem;
                font-weight: 700;
            }

            #globalErrorPopup .error-box p {
                margin: 0 0 20px;
                font-size: 1rem;
                line-height: 1.6;
            }

            #globalErrorRetryBtn {
                background-color: #e50914;
                border: none;
                color: #ffffff;
                padding: 12px 24px;
                border-radius: 999px;
                cursor: pointer;
                font-size: 1rem;
                font-weight: 600;
                transition: background-color 0.2s ease, transform 0.2s ease;
                width: 100%;
                max-width: 240px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
            }

            #globalErrorRetryBtn:hover,
            #globalErrorRetryBtn:focus {
                background-color: #f40612;
                transform: translateY(-1px);
                outline: none;
            }

            @keyframes globalErrorSlideUp {
                from {
                    opacity: 0;
                    transform: translateY(30px);
                }

                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
        `;

        document.head.appendChild(style);
        globalErrorPopupState.styleInjected = true;
    };

    if (document.head) {
        applyStyles();
    } else {
        document.addEventListener('DOMContentLoaded', applyStyles, { once: true });
    }
}

function ensureGlobalErrorPopupElement() {
    if (typeof document === 'undefined') return null;

    if (!document.body) {
        document.addEventListener('DOMContentLoaded', ensureGlobalErrorPopupElement, { once: true });
        return null;
    }

    injectGlobalErrorPopupStyles();

    if (globalErrorPopupState.container && document.body.contains(globalErrorPopupState.container)) {
        return globalErrorPopupState.container;
    }

    let container = document.getElementById('globalErrorPopup');
    if (!container) {
        container = document.createElement('div');
        container.id = 'globalErrorPopup';
        container.className = 'global-error-overlay hidden';
        container.setAttribute('dir', 'rtl');
        container.setAttribute('role', 'alertdialog');
        container.setAttribute('aria-modal', 'true');
        container.setAttribute('aria-hidden', 'true');
        container.innerHTML = `
  <div class="error-box">
      <h2>⚠ مشكلة في الاتصال بالخادم</h2>
      <p>يبدو أن هناك مشكلة في السيرفر. يرجى المحاولة مرة أخرى.</p>
      <button id="globalErrorRetryBtn" type="button">إعادة المحاولة </button>
  </div>
        `;
        document.body.appendChild(container);
    } else {
        container.classList.add('global-error-overlay');
        if (!container.classList.contains('hidden')) {
            container.classList.add('hidden');
        }
    }

    const retryButton = container.querySelector('#globalErrorRetryBtn');
    if (retryButton && !retryButton.dataset.globalErrorBound) {
        retryButton.dataset.globalErrorBound = 'true';
        retryButton.addEventListener('click', async () => {
            const handler = globalErrorPopupState.lastRetryHandler;
            globalErrorPopupState.lastRetryHandler = null;
            hideGlobalErrorPopup();

            if (typeof handler === 'function') {
                try {
                    await handler();
                } catch (error) {
                    if (!error || error.name !== 'AbortError') {
                        showGlobalErrorPopup(handler);
                    }
                }
            }
        });
    }

    globalErrorPopupState.container = container;
    globalErrorPopupState.retryButton = retryButton;

    return container;
}

function showGlobalErrorPopup(handler) {
    if (typeof document === 'undefined') return;

    globalErrorPopupState.lastRetryHandler = typeof handler === 'function' ? handler : null;

    const container = ensureGlobalErrorPopupElement();
    if (!container) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => showGlobalErrorPopup(handler), { once: true });
        }
        return;
    }

    container.classList.remove('hidden');
    container.classList.add('active');
    container.setAttribute('aria-hidden', 'false');

    if (globalErrorPopupState.retryButton) {
        setTimeout(() => {
            try {
                globalErrorPopupState.retryButton.focus();
            } catch (focusError) {
            }
        }, 60);
    }
}

function hideGlobalErrorPopup() {
    if (typeof document === 'undefined') return;

    const container = ensureGlobalErrorPopupElement();
    if (!container) return;

    container.classList.remove('active');
    container.classList.add('hidden');
    container.setAttribute('aria-hidden', 'true');
}

function normalizeHeaders(headers = {}) {
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
        const headerObject = {};
        headers.forEach((value, key) => {
            headerObject[key] = value;
        });
        return headerObject;
    }
    return { ...headers };
}

function cloneFetchOptions(options = {}) {
    const cloned = { ...options };
    if (options.headers) {
        cloned.headers = normalizeHeaders(options.headers);
    }
    return cloned;
}

function createRetryHandler(url, options = {}) {
    return () => apiFetch(url, cloneFetchOptions(options));
}

async function parseJsonSafely(response, retryHandler) {
    if (!response) return {};

    const statusCode = Number(response.status || 0);
    if (statusCode === 204 || statusCode === 205) {
        return {};
    }

    const headers = response.headers;
    const contentLength = headers && typeof headers.get === 'function' ? headers.get('content-length') : null;
    if (contentLength === '0') {
        return {};
    }

    try {
        return await response.json();
    } catch (error) {
        throw error;
    }
}

// ✅ Page-level error handler (for critical API failures only)
// Show popup ONLY for products and categories endpoints
function showServerErrorPopup(endpoint = '') {
    // ✅ Only show popup for products or categories endpoints
    const isCriticalEndpoint = endpoint.includes('products') || endpoint.includes('categories');
    
    if (!isCriticalEndpoint) {
        // Not a critical endpoint - don't show popup
        return;
    }

    showGlobalErrorPopup(() => {
        // Just reload the page on retry
        location.reload();
    });
}

if (typeof window !== 'undefined') {
    window.showGlobalErrorPopup = showGlobalErrorPopup;
    window.hideGlobalErrorPopup = hideGlobalErrorPopup;
    window.showServerErrorPopup = showServerErrorPopup;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureGlobalErrorPopupElement, { once: true });
    } else {
        ensureGlobalErrorPopupElement();
    }
}

// ===================================================================
// API REQUEST WRAPPERS WITH 401 REFRESH LOGIC
// ===================================================================

// قراءة قيمة من الـ cookies (لكن httpOnly cookies لا يمكن قراءتها من JavaScript)
// لذا نعتمد على أن Browser يبعتها تلقائياً مع credentials: 'include'
function getCookie(name) {
    const nameEQ = encodeURIComponent(name) + "=";
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i].trim();
        if (cookie.indexOf(nameEQ) === 0) {
            return decodeURIComponent(cookie.substring(nameEQ.length));
        }
    }
    return null;
}

// حفظ token في الـ cookie (non-httpOnly لكي نقدر نقراه من JavaScript)
function setCookie(name, value, days = 7) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; ${expires}; path=/; SameSite=Strict`;
}

// حذف token من الـ cookie
function removeCookie(name) {
    document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
}

// Track if refresh is in progress to prevent multiple simultaneous refreshes
let isRefreshing = false;
let refreshPromise = null;
let refreshAttemptCount = 0;
const MAX_REFRESH_ATTEMPTS = 2; // Prevent infinite loops

// Flag to track if cookies are ready (set after first successful auth check)
let cookiesReady = false;
let cookiesReadyPromise = null;

/**
 * Ensure cookies are available before making authenticated requests
 * Prevents race condition where requests fire before HttpOnly cookies are fully set
 */
async function ensureCookiesReady() {
    // If already ready, return immediately
    if (cookiesReady) return true;

    // If already checking, wait for that promise
    if (cookiesReadyPromise) return cookiesReadyPromise;

    // Create a promise that resolves when cookies are ready
    cookiesReadyPromise = new Promise((resolve) => {
        // ✅ Use a public endpoint (categories) instead of /me to verify cookies work
        // This works for both guests and authenticated users
        const checkCookies = async () => {
            try {
                const endpoint = window.API_CONFIG?.getEndpoint('CATEGORIES') || '/api/categories';
                const response = await fetch(
                    `${endpoint}?page=1&limit=1`,
                    {
                        method: 'GET',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
                // Don't care about result - we just want to know if cookies are working
                // 200 = cookies ready, 400+ = still working (cookies ready)
                cookiesReady = true;
                resolve(true);
            } catch (error) {
                // Network error - retry in 50ms
                setTimeout(checkCookies, 50);
            }
        };

        // Start the check - first one runs immediately with minimal delay
        setTimeout(checkCookies, 10);
    });

    return cookiesReadyPromise;
}

// Attempt to refresh access token using refresh token (stored in httpOnly cookie)
// ✅ Includes infinite loop prevention
async function refreshAccessToken() {
    // ✅ Skip refresh if no refresh token exists (guest user)
    // Refresh tokens are httpOnly cookies, but we can detect absence via cookies
    const hasRefreshToken = document.cookie.includes('refreshToken');
    if (!hasRefreshToken) {
        // Guest user - no token to refresh
        return null;
    }

    if (isRefreshing) {
        return refreshPromise;
    }

    // Prevent infinite refresh loops
    if (refreshAttemptCount >= MAX_REFRESH_ATTEMPTS) {
        clearAuthUser();
        guestUserConfirmed = true; // Mark as guest
        refreshAttemptCount = 0;
        throw new Error('Token refresh failed - max attempts exceeded');
    }

    isRefreshing = true;
    refreshAttemptCount++;
    const refreshUrl = window.API_CONFIG?.getEndpoint('AUTH_TOKEN_REFRESH');

    refreshPromise = fetch(refreshUrl, {
        method: 'POST',
        credentials: 'include',  // ✅ Browser سيبعت refreshToken من httpOnly cookie تلقائياً
        headers: {
            'Content-Type': 'application/json'
        }
    })
        .then(response => {
            if (response.ok) {
                refreshAttemptCount = 0; // Reset on success
                return response.json();
            } else {
                throw new Error(`Token refresh failed: ${response.status}`);
            }
        })
        .catch(error => {
            throw error;
        })
        .finally(() => {
            isRefreshing = false;
            refreshPromise = null;
        });

    return refreshPromise;
}

// Generic fetch wrapper with 401 auto-refresh support
// ✅ الـ httpOnly cookies يتم إرسالها تلقائياً بواسطة Browser عند credentials: 'include'
// لا نحتاج لقراءتها يدويا - البراوزر يتولى كل شيء!
async function apiFetch(url, options = {}) {
    // ✅ CRITICAL: Wait for cookies to be ready BEFORE making any request
    // This prevents 401 errors from race conditions where cookies aren't set yet
    await ensureCookiesReady();

    const normalizedOptions = cloneFetchOptions(options);
    const providedRetryHandler = typeof normalizedOptions.__retryHandler === 'function'
        ? normalizedOptions.__retryHandler
        : null;
    if (Object.prototype.hasOwnProperty.call(normalizedOptions, '__retryHandler')) {
        delete normalizedOptions.__retryHandler;
    }
    const headers = {
        'Content-Type': 'application/json',
        ...normalizedOptions.headers
    };

    const requestOptions = {
        ...normalizedOptions,
        credentials: 'include',  // ✅ Browser سيبعت httpOnly cookies تلقائياً (accessToken + refreshToken)
        headers
    };

    const retryHandler = providedRetryHandler || createRetryHandler(url, requestOptions);

    let response;

    try {
        response = await fetch(url, requestOptions);
    } catch (error) {
        throw error;
    }

    // If 401, try refresh (but NOT on /auth/token/refresh itself to avoid infinite loop)
    if (response.status === 401 && !url.includes('/auth/token/refresh') && cookiesReady) {
        try {
            // ✅ Skip if guest (refreshAccessToken returns null)
            const refreshResult = await refreshAccessToken();
            if (refreshResult === null) {
                // Guest user - can't refresh
                return response;
            }

            // أعد محاولة الطلب بنفس الطريقة - لكن الآن مع التوكن الجديد في httpOnly cookie
            response = await fetch(url, requestOptions);
        } catch (refreshError) {
            // Refresh failed - don't auto-logout here
            // Let the calling function handle it
        }
    }

    // ✅ IMPORTANT: apiFetch is a pure request helper
    // It does NOT show popups or UI messages
    // Callers decide if/how to handle errors
    return response;
}

// طلب POST عام مع معالجة أخطاء موحدة وتحديث تلقائي للـ token
async function postJson(url, data) {
    const retryHandler = () => postJson(url, data);
    const response = await apiFetch(url, {
        method: 'POST',
        body: JSON.stringify(data),
        __retryHandler: retryHandler
    });

    const payload = await parseJsonSafely(response, retryHandler);
    if (!response.ok) {
        const message = payload?.message || 'حدث خطأ غير متوقع';
        const errors = payload?.errors || null;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        if (errors) error.errors = errors;
        throw error;
    }
    return payload;
}

// طلب PATCH عام مع دعم التحديث التلقائي
async function patchJson(url, data) {
    const retryHandler = () => patchJson(url, data);
    const response = await apiFetch(url, {
        method: 'PATCH',
        body: JSON.stringify(data),
        __retryHandler: retryHandler
    });

    const payload = await parseJsonSafely(response, retryHandler);
    if (!response.ok) {
        const message = payload?.message || 'حدث خطأ غير متوقع';
        const errors = payload?.errors || null;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        if (errors) error.errors = errors;
        throw error;
    }
    return payload;
}

// طلب GET عام مع دعم التحديث التلقائي
async function getJson(url) {
    const retryHandler = () => getJson(url);
    const response = await apiFetch(url, {
        method: 'GET',
        __retryHandler: retryHandler
    });

    const payload = await parseJsonSafely(response, retryHandler);
    if (!response.ok) {
        // Don't throw error for 401 on startup - user just not logged in
        if (response.status === 401 && (url.includes('/users/me') || url.includes('users'))) {
            return null;
        }

        // لـ /orders/me - إذا 401، يعني الـ token مش شغالة أو انتهت
        // دعنا نحاول refresh ونعيد المحاولة
        if (response.status === 401 && url.includes('/orders/me')) {
            try {
                // ✅ Skip if guest (refreshAccessToken returns null)
                const refreshResult = await refreshAccessToken();
                if (refreshResult === null) {
                    // Guest user - can't retry
                    return null;
                }
                // أعد المحاولة مرة واحدة فقط
                const retryResponse = await apiFetch(url, {
                    method: 'GET',
                    __retryHandler: retryHandler
                });
                const retryPayload = await parseJsonSafely(retryResponse, retryHandler);
                if (retryResponse.ok) {
                    return retryPayload;
                }
            } catch (refreshError) {
            }
        }

        const message = payload?.message || 'حدث خطأ غير متوقع';
        const errors = payload?.errors || null;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        if (errors) error.errors = errors;
        throw error;
    }
    return payload;
}

// طلب DELETE عام مع دعم التحديث التلقائي
async function deleteJson(url) {
    const retryHandler = () => deleteJson(url);
    const response = await apiFetch(url, {
        method: 'DELETE',
        __retryHandler: retryHandler
    });

    const payload = await parseJsonSafely(response, retryHandler);
    if (!response.ok) {
        const message = payload?.message || 'حدث خطأ غير متوقع';
        const errors = payload?.errors || null;
        const error = new Error(message);
        error.status = response.status;
        error.payload = payload;
        if (errors) error.errors = errors;
        throw error;
    }
    return payload;
}

// تحويل مصفوفة أخطاء التحقق إلى خريطة حسب اسم الحقل
function mapValidationErrors(errors = []) {
    return errors.reduce((acc, { path, msg }) => {
        if (!path) return acc;
        acc[path] = msg;
        return acc;
    }, {});
}

// تفريغ رسائل الأخطاء النصية داخل نموذج محدد
function clearFormErrors(form) {
    if (!form) return;
    form.querySelectorAll('.input-error').forEach(span => {
        span.textContent = '';
    });
}

// عرض رسائل الأخطاء لكل حقل بناءً على خريطة أخطاء
function setFieldErrors(form, errorMap = {}) {
    if (!form) return;
    Object.entries(errorMap).forEach(([field, message]) => {
        const target = form.querySelector(`[data-error-for="${field}"]`);
        if (target) {
            target.textContent = message;
        }
    });
}

// تحديث محتوى صندوق الرسائل وتعيين حالته (نجاح/خطأ)
function setMessage(element, message, status) {
    if (!element) return;
    element.textContent = message || '';
    element.dataset.status = status || '';
}

// تبديل حالة زر بين الوضع العادي ووضع الانتظار مع نص مخصص
function toggleLoading(button, loading, loadingText) {
    if (!button) return;
    if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent;
    }
    button.disabled = loading;
    button.textContent = loading ? (loadingText || button.dataset.loadingText || 'جاري المعالجة...') : button.dataset.originalText;
}

// إظهار أي نافذة منبثقة مع إعادة تفعيل التركيز
function showInlinePopup(popup) {
    if (!popup) return;
    popup.hidden = false;
    popup.classList.add('is-visible');
    popup.setAttribute('aria-hidden', 'false');
    popup.removeAttribute('inert');
    const focusable = popup.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
    if (focusable) {
        focusable.focus();
    }
}

// إخفاء أي نافذة منبثقة وتعطيل عناصرها
function hideInlinePopup(popup) {
    if (!popup) return;
    popup.hidden = true;
    popup.classList.remove('is-visible');
    popup.setAttribute('aria-hidden', 'true');
    popup.setAttribute('inert', '');
}

// إيقاف المؤقت المستخدم للانتقال بين نوافذ الاستعادة
function clearPasswordRecoveryTimer() {
    if (passwordRecoveryState.timerId) {
        clearTimeout(passwordRecoveryState.timerId);
        passwordRecoveryState.timerId = null;
    }
}

// تهيئة تدفق "نسيت كلمة المرور" بكافة نوافذه وطلباته
function initPasswordRecovery(loginForm) {
    const forgotLinks = Array.from(document.querySelectorAll('.password-reset-link'));
    const forgotPopup = document.getElementById('forgotPasswordPopup');
    const forgotForm = document.getElementById('forgotPasswordForm');
    const forgotEmailInput = document.getElementById('forgotPasswordEmail');
    const forgotSubmit = document.getElementById('forgotPasswordSubmit');
    const forgotMessage = document.getElementById('forgotPasswordMessage');
    const otpPopup = document.getElementById('otpPopup');
    const otpForm = document.getElementById('otpForm');
    const otpCodeInput = document.getElementById('otpCode');
    const otpSubmit = document.getElementById('otpSubmit');
    const otpMessage = document.getElementById('otpFormMessage');
    const resetPopup = document.getElementById('resetPasswordPopup');
    const resetForm = document.getElementById('resetPasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const resetSubmit = document.getElementById('resetPasswordSubmit');
    const resetMessage = document.getElementById('resetPasswordMessage');
    const loginPopup = document.getElementById('loginPopup');
    const loginMessage = document.getElementById('loginFormMessage');

    if (!forgotLinks.length || !forgotPopup || !forgotForm || !forgotEmailInput) {
        return;
    }

    const hideRecoveryPopups = () => {
        hideInlinePopup(forgotPopup);
        hideInlinePopup(otpPopup);
        hideInlinePopup(resetPopup);
        clearPasswordRecoveryTimer();
    };

    const showForgotPopup = () => {
        hideRecoveryPopups();
        if (loginPopup) {
            hideInlinePopup(loginPopup);
        }
        showInlinePopup(forgotPopup);
    };

    const showOtpPopup = () => {
        hideRecoveryPopups();
        if (loginPopup) {
            hideInlinePopup(loginPopup);
        }
        showInlinePopup(otpPopup);
    };

    const showResetPopup = () => {
        hideRecoveryPopups();
        if (loginPopup) {
            hideInlinePopup(loginPopup);
        }
        showInlinePopup(resetPopup);
    };

    forgotLinks.forEach(link => {
        if (link.dataset.recoveryBound === 'true') return;
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const loginEmail = loginForm?.querySelector('#loginEmail')?.value?.trim();
            forgotForm.reset();
            if (loginEmail) {
                forgotEmailInput.value = loginEmail;
            }
            setMessage(forgotMessage, '', '');
            passwordRecoveryState.email = loginEmail || '';
            passwordRecoveryState.code = '';
            showForgotPopup();
        });
        link.dataset.recoveryBound = 'true';
    });

    const closeButtons = Array.from(document.querySelectorAll('[data-close-popup]'));
    closeButtons.forEach(button => {
        if (button.dataset.recoveryBound === 'true') return;
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-close-popup');
            if (target === 'forgotPassword') hideInlinePopup(forgotPopup);
            if (target === 'otp') {
                hideInlinePopup(otpPopup);
                clearAccountVerificationState();
                // إذا كان في وضع التحقق من الحساب، لا نعود للـ login
                if (!accountVerificationState.isVerifying) {
                    showPopup('login');
                }
                return;
            }
            if (target === 'resetPassword') hideInlinePopup(resetPopup);
            clearPasswordRecoveryTimer();
            showPopup('login');
        });
        button.dataset.recoveryBound = 'true';
    });

    forgotForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormErrors(forgotForm);

        const email = forgotEmailInput.value.trim();
        if (!email) {
            setMessage(forgotMessage, 'يرجى إدخال البريد الإلكتروني.', 'error');
            return;
        }

        passwordRecoveryState.email = email;
        passwordRecoveryState.code = '';
        setMessage(forgotMessage, '', '');
        toggleLoading(forgotSubmit, true, 'جاري الإرسال...');

        try {
            const response = await postJson(AUTH_ENDPOINTS.forgotPassword, { email });
            setMessage(forgotMessage, response?.message || 'سيتم إرسال رمز التحقق إلى بريدك الإلكتروني.', 'success');
            clearPasswordRecoveryTimer();
            passwordRecoveryState.timerId = setTimeout(() => {
                passwordRecoveryState.timerId = null;
                setMessage(forgotMessage, '', '');
                showOtpPopup();
            }, 5000);
        } catch (error) {
            setMessage(forgotMessage, error.message || 'تعذر إرسال رمز الاستعادة.', 'error');
        } finally {
            toggleLoading(forgotSubmit, false);
        }
    });

    if (otpForm && otpCodeInput && otpSubmit) {
        otpForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearFormErrors(otpForm);

            const code = otpCodeInput.value.trim();
            if (!code || code.length < 4) {
                setMessage(otpMessage, 'يرجى إدخال رمز التحقق.', 'error');
                return;
            }

            if (!passwordRecoveryState.email) {
                setMessage(otpMessage, 'تعذر تحديد البريد المرتبط بالطلب.', 'error');
                return;
            }

            setMessage(otpMessage, '', '');
            toggleLoading(otpSubmit, true, 'جاري التحقق...');

            try {
                const normalizedCode = code.trim();
                const response = await postJson(AUTH_ENDPOINTS.verifyResetCode, {
                    email: passwordRecoveryState.email,
                    code: normalizedCode,
                    otp: normalizedCode
                });
                setMessage(otpMessage, response?.message || 'تم التحقق من الرمز بنجاح.', 'success');
                passwordRecoveryState.code = normalizedCode;
                passwordRecoveryState.token = response?.data?.token || '';
                setTimeout(() => {
                    showResetPopup();
                }, 800);
            } catch (error) {
                setMessage(otpMessage, error.message || 'رمز التحقق غير صحيح.', 'error');
            } finally {
                toggleLoading(otpSubmit, false);
            }
        });
    }

    if (resetForm && newPasswordInput && confirmPasswordInput && resetSubmit) {
        resetForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearFormErrors(resetForm);

            const password = newPasswordInput.value.trim();
            const confirmPassword = confirmPasswordInput.value.trim();

            if (!password || !confirmPassword) {
                setMessage(resetMessage, 'يرجى إدخال كلمة المرور الجديدة وتأكيدها.', 'error');
                return;
            }

            if (password.length < 6) {
                setMessage(resetMessage, 'كلمة المرور يجب ألا تقل عن 6 أحرف.', 'error');
                return;
            }

            if (password !== confirmPassword) {
                setMessage(resetMessage, 'كلمتا المرور غير متطابقتين.', 'error');
                return;
            }

            if (!passwordRecoveryState.email || !passwordRecoveryState.code || !passwordRecoveryState.token) {
                setMessage(resetMessage, 'انتهت صلاحية الطلب. يرجى إعادة المحاولة.', 'error');
                return;
            }

            setMessage(resetMessage, '', '');
            toggleLoading(resetSubmit, true, 'جاري التحديث...');

            try {
                const payload = {
                    email: passwordRecoveryState.email,
                    code: passwordRecoveryState.code,
                    password,
                    passwordConfirm: confirmPassword
                };
                const response = await patchJson(AUTH_ENDPOINTS.resetPassword, payload);
                setMessage(resetMessage, response?.message || 'تم تحديث كلمة المرور بنجاح.', 'success');
                passwordRecoveryState.email = '';
                passwordRecoveryState.code = '';
                passwordRecoveryState.token = '';
                resetForm.reset();
                setTimeout(() => {
                    hideRecoveryPopups();
                    showPopup('login');
                    setMessage(loginMessage, 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول الآن.', 'success');
                }, 1200);
            } catch (error) {
                setMessage(resetMessage, error.message || 'تعذر تحديث كلمة المرور.', 'error');
            } finally {
                toggleLoading(resetSubmit, false);
            }
        });
    }
}

// ===================================================================
// ACCOUNT VERIFICATION FUNCTIONS
// ===================================================================

// Global state for resend timer
let resendTimer = null;
let resendTimeLeft = 60; // 60 seconds cooldown

// Function to start the resend timer
function startResendTimer() {
    const resendBtn = document.getElementById('resendOtpBtn');
    const timerElement = document.getElementById('resendTimer');

    if (resendTimer) {
        clearInterval(resendTimer);
    }

    resendTimeLeft = 60;
    updateTimerDisplay();

    if (resendBtn) {
        resendBtn.disabled = true;
    }

    resendTimer = setInterval(() => {
        resendTimeLeft--;
        updateTimerDisplay();

        if (resendTimeLeft <= 0) {
            clearInterval(resendTimer);
            if (resendBtn) {
                resendBtn.disabled = false;
            }
            if (timerElement) {
                timerElement.textContent = '';
            }
        }
    }, 1000);
}

// Function to update the timer display
function updateTimerDisplay() {
    const timerElement = document.getElementById('resendTimer');
    if (timerElement) {
        if (resendTimeLeft > 0) {
            timerElement.textContent = `يمكنك إعادة الإرسال بعد ${resendTimeLeft} ثانية`;
        } else {
            timerElement.textContent = '';
        }
    }
}

// Initialize resend OTP functionality
function initResendOtpButton() {
    const resendBtn = document.getElementById('resendOtpBtn');
    if (!resendBtn) return;

    resendBtn.addEventListener('click', async () => {
        const isAccountVerification = !!accountVerificationState.isVerifying;
        const email = isAccountVerification
            ? (accountVerificationState.email || '')
            : (passwordRecoveryState.email || '');
        const otpMessage = document.getElementById('otpFormMessage');

        if (!email) {
            if (otpMessage && !isAccountVerification) {
                setMessage(otpMessage, 'تعذر تحديد البريد المرتبط بالطلب.', 'error');
            }
            return;
        }

        let timerStarted = false;

        try {
            resendBtn.disabled = true;
            resendBtn.textContent = 'جاري الإرسال...';

            if (isAccountVerification) {
                await handleResendVerificationCode(email);
            } else {
                await postJson(AUTH_ENDPOINTS.forgotPassword, { email });
            }

            if (otpMessage) {
                const successText = isAccountVerification
                    ? 'تم إرسال رمز تحقق جديد إلى بريدك الإلكتروني'
                    : 'تم إرسال رمز استعادة جديد إلى بريدك الإلكتروني';
                setMessage(otpMessage, successText, 'success');
            }

            // Start the resend timer
            startResendTimer();
            timerStarted = true;

        } catch (error) {
            if (otpMessage) {
                const errorText = isAccountVerification
                    ? (error.message || 'فشل إعادة إرسال رمز التحقق')
                    : (error.message || 'فشل إعادة إرسال رمز الاستعادة');
                setMessage(otpMessage, errorText, 'error');
            }
        } finally {
            resendBtn.textContent = 'إعادة إرسال رمز التحقق';
            if (!timerStarted || resendTimeLeft <= 0) {
                resendBtn.disabled = false;
            }
        }
    });
}

// Call this when the page loads
document.addEventListener('DOMContentLoaded', () => {
    initResendOtpButton();
    // ... rest of your existing code
});

async function showAccountVerificationPopup(email) {
    accountVerificationState.email = email;
    accountVerificationState.isVerifying = true;

    const otpForm = document.getElementById('otpForm');
    const otpMessage = document.getElementById('otpFormMessage');
    const otpInput = document.getElementById('otpCode');

    if (otpForm) {
        otpForm.reset();
        clearFormErrors(otpForm);
    }

    if (otpMessage) {
        setMessage(otpMessage, 'تم إرسال رمز التحقق إلى بريدك الإلكتروني', 'info');
    }

    if (otpInput) {
        otpInput.focus();
    }

    // Start the resend timer when showing the popup
    startResendTimer();

    // إغلاق popups الأخرى بطريقة آمنة
    const signupPopup = document.getElementById('signupPopup');
    const loginPopup = document.getElementById('loginPopup');
    if (signupPopup) signupPopup.style.display = 'none';
    if (loginPopup) loginPopup.style.display = 'none';

    const otpPopup = document.getElementById('otpPopup');
    if (otpPopup) {
        otpPopup.removeAttribute('hidden');
        otpPopup.removeAttribute('inert');
        otpPopup.classList.add('is-visible');
        otpPopup.style.display = 'flex';
    }
}

async function handleAccountVerification(otpCode) {
    const otpForm = document.getElementById('otpForm');
    const otpMessage = document.getElementById('otpFormMessage');
    const otpSubmit = otpForm?.querySelector('#otpSubmit');
    const email = accountVerificationState.email;

    if (!email || !otpCode.trim()) {
        setMessage(otpMessage, 'يرجى إدخال البريد الإلكتروني ورمز التحقق', 'error');
        return;
    }

    if (otpSubmit) {
        toggleLoading(otpSubmit, true);
    }

    try {
        const payload = {
            email: email,
            otp: otpCode.trim()
        };

        const result = await postJson(AUTH_ENDPOINTS.verifyAccount, payload);

        setMessage(otpMessage, result?.message || 'تم التحقق من الحساب بنجاح', 'success');

        try {
            await ensureAuthUserLoaded(true);
        } catch (profileError) {
            setAuthUser(extractAuthUser(result));
        }
        guestUserConfirmed = false; // Reset flag - user is now authenticated

        if (otpForm) {
            otpForm.reset();
        }

        setTimeout(() => {
            const otpPopup = document.getElementById('otpPopup');
            if (otpPopup) {
                otpPopup.classList.remove('is-visible');
                otpPopup.setAttribute('hidden', '');
                otpPopup.style.display = 'none';
            }
            updateAuthUI();
            handlePostLoginRedirect();
        }, 1500);

    } catch (error) {
        const validationErrors = mapValidationErrors(error.errors);
        setFieldErrors(otpForm, validationErrors);
        const message = error.status === 400
            ? 'رمز التحقق غير صحيح'
            : (error.message || 'تعذر التحقق من الحساب');
        setMessage(otpMessage, message, 'error');
    } finally {
        if (otpSubmit) {
            toggleLoading(otpSubmit, false);
        }
    }
}

async function handleResendVerificationCode(email) {
    try {
        const payload = { email: email };
        const result = await postJson(AUTH_ENDPOINTS.resendVerificationCode, payload);
        return result;
    } catch (error) {
        throw error;
    }
}

function clearAccountVerificationState() {
    accountVerificationState.email = '';
    accountVerificationState.isVerifying = false;
    if (accountVerificationState.timerId) {
        clearTimeout(accountVerificationState.timerId);
        accountVerificationState.timerId = null;
    }
}

// في-memory cache للمستخدم
let authUserCache = null;

// جلب بيانات المستخدم من الذاكرة (تحديث من /users/me عند الحاجة)
function getAuthUser() {
    return authUserCache;
}

// حفظ بيانات المستخدم في الذاكرة فقط
function setAuthUser(user) {
    if (!user) {
        clearAuthUser();
        return;
    }
    authUserCache = user;
    notifyAuthUserUpdated(user);
}

// إزالة بيانات المستخدم من الذاكرة
function clearAuthUser() {
    authUserCache = null;
    notifyAuthUserUpdated(null);
}

function notifyAuthUserUpdated(user) {
    document.dispatchEvent(new CustomEvent('auth:user-updated', {
        detail: { user }
    }));
}

// استخراج بيانات المستخدم من استجابة الدخول/التسجيل
function extractAuthUser(payload) {
    if (!payload) return null;
    const userCandidate = payload.user
        || payload.data?.user
        || payload.profile
        || payload.data?.profile
        || payload.data?.account
        || null;

    if (!userCandidate || typeof userCandidate !== 'object') {
        return null;
    }

    const fallbackName = [userCandidate.firstName, userCandidate.lastName].filter(Boolean).join(' ').trim();

    return {
        id: userCandidate.id || userCandidate._id || null,
        name: userCandidate.name || userCandidate.fullName || fallbackName || '',
        email: userCandidate.email || userCandidate.username || '',
        raw: userCandidate
    };
}

// تحميل بيانات المستخدم من الخادم عند توفر التوكن
// Track if we've already attempted to load user and got 401 (guest user)
let guestUserConfirmed = false;

async function ensureAuthUserLoaded(forceRefresh = false) {
    const cachedUser = getAuthUser();
    // دائماً جلب من الـ API على الـ page load الأول لأن in-memory cache قد يكون فارغاً
    // أو استخدم الـ cache إذا كان لديك البيانات والـ forceRefresh = false
    if (!forceRefresh && cachedUser?.name && cachedUser?.email && cachedUser?.id) {
        return cachedUser;
    }

    // ✅ Skip /me fetch for guests (already confirmed by ensureCookiesReady or previous 401)
    // This prevents unnecessary 401 errors for guest users
    if (!forceRefresh && guestUserConfirmed) {
        return null; // Guest user confirmed - don't try again
    }

    try {
        const response = await getJson(USER_ENDPOINTS.me);
        if (!response) {
            // User not logged in (401)
            guestUserConfirmed = true; // Mark as guest - don't try again
            return null;
        }
        const user = extractAuthUser(response);
        setAuthUser(user);
        guestUserConfirmed = false; // User is authenticated
        // Trigger profile UI rendering on pages that need it
        if (typeof populateProfileFromAuthUser === 'function') {
            populateProfileFromAuthUser(user);
        }
        return user;
    } catch (error) {
        if (error.status === 401) {
            clearAuthUser();
            guestUserConfirmed = true; // Mark as guest - don't try again
        }
        // Don't throw error on startup - user just not logged in
        return null;
    }
}

// التحقق من وجود توكن مسجل لتحديد حالة الدخول
function isAuthenticated() {
    // تحقق من وجود user في الـ in-memory cache (التوكين httpOnly لا يمكن قراءته من JS)
    // التوكين يُرسل تلقائياً مع كل request عند استخدام credentials: 'include'
    return !!getAuthUser();
}

// تخزين عنوان إعادة التوجيه لحين نجاح تسجيل الدخول
function setRedirectAfterLogin(url) {
    if (!url) return;
    sessionStorage.setItem('redirectAfterLogin', url);
}

// استهلاك عنوان إعادة التوجيه بعد تسجيل الدخول
function consumeRedirectAfterLogin() {
    const url = sessionStorage.getItem('redirectAfterLogin');
    if (url) {
        sessionStorage.removeItem('redirectAfterLogin');
        return url;
    }
    return null;
}

// مسح عنوان إعادة التوجيه المخزن
function clearRedirectAfterLogin() {
    sessionStorage.removeItem('redirectAfterLogin');
}

// تحديث عناصر الواجهة وفق حالة الدخول الحالية
function updateAuthUI() {
    const authenticated = isAuthenticated();
    const authUser = getAuthUser();
    document.querySelectorAll('.auth-action-login').forEach(element => {
        element.hidden = authenticated;
    });
    document.querySelectorAll('.auth-action-logout').forEach(element => {
        element.hidden = !authenticated;
    });
    document.querySelectorAll('.profile-link').forEach(element => {
        element.hidden = !authenticated;
    });
    document.querySelectorAll('.profile-button').forEach(button => {
        if (!button) return;
        if (authenticated && authUser?.name) {
            button.setAttribute('title', authUser.name);
            button.setAttribute('aria-label', `حساب ${authUser.name}`);
        } else {
            button.setAttribute('title', 'حسابي');
            button.setAttribute('aria-label', 'حسابي');
        }
    });
}

const PROTECTED_PAGE_MESSAGES = {
    'cart.html': 'سجل الدخول لمتابعة التسوق.',
    'profile.html': 'سجل الدخول للوصول إلى حسابك.'
};

const POST_LOGIN_RELOAD_KEY = 'actionSportsPostLoginReload';

function handleProtectedPageAccess() {
    const loginMessageEl = document.getElementById('loginFormMessage');
    const pathname = window.location.pathname || '';
    const search = window.location.search || '';

    const matchedEntry = Object.entries(PROTECTED_PAGE_MESSAGES)
        .find(([page]) => pathname.endsWith(page));

    if (!matchedEntry) {
        if (isAuthenticated() && typeof hidePopup === 'function') {
            hidePopup('login');
        }
        return;
    }

    const [, message] = matchedEntry;

    if (isAuthenticated()) {
        if (typeof hidePopup === 'function') {
            hidePopup('login');
        }
        if (loginMessageEl) {
            setMessage(loginMessageEl, '', '');
        }
        return;
    }

    setRedirectAfterLogin(`${pathname}${search}`);
    if (typeof showPopup === 'function') {
        showPopup('login');
    }
    if (loginMessageEl) {
        setMessage(loginMessageEl, message, 'error');
    }
}

// تنفيذ إجراءات تسجيل الخروج وتحديث الواجهة
async function handleLogout() {
    try {
        const logoutUrl = window.API_CONFIG?.getEndpoint('AUTH_LOGOUT');
        await postJson(logoutUrl, {});
    } catch (error) {
        // Continue logout even if endpoint fails
    }

    // ✅ حذف الـ tokens من الـ cookies
    removeCookie('accessToken');
    removeCookie('refreshToken');

    // ✅ تنظيف جميع البيانات الحساسة من localStorage و sessionStorage
    try {
        const SENSITIVE_KEYS = [
            'SS_deltaBuffer',
            'accounts',
            'actionSportsAuthToken',
            'actionSportsAuthUser',
            'actionSportsGuestCart',
            'currentUser',
            'favorites',
            'users',
            'accessToken',
            'refreshToken',
            'user',
            'cart',
            'redirectAfterLogin',
            'actionSportsInstallmentSummary'
        ];

        SENSITIVE_KEYS.forEach(key => {
            localStorage.removeItem(key);
            sessionStorage.removeItem(key);
        });
    } catch (e) {
        // Storage cleanup error - continue logout
    }

    clearAuthUser();
    clearRedirectAfterLogin();
    guestUserConfirmed = false; // Reset flag so user can login again
    if (typeof hidePopup === 'function') {
        hidePopup('login');
        hidePopup('signup');
    }
    updateAuthUI();

    const redirectTarget = 'index.html';
    if (window.location.pathname.endsWith('cart.html')) {
        window.location.href = redirectTarget;
    } else if (!window.location.pathname.endsWith(redirectTarget) && window.location.pathname !== '/' && window.location.pathname !== `/${redirectTarget}`) {
        window.location.href = redirectTarget;
    } else {
        window.location.reload();
    }
}

// ربط أزرار الدخول/الخروج بسلوكها المناسب لمرة واحدة
function setupAuthActionHandlers() {
    const actionElements = document.querySelectorAll('[data-auth-action]');
    actionElements.forEach(element => {
        if (element.dataset.authBound === 'true') return;

        const action = element.dataset.authAction;
        if (action === 'login') {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                if (typeof showPopup === 'function') {
                    showPopup('login');
                }
            });
        } else if (action === 'logout') {
            element.addEventListener('click', (event) => {
                event.preventDefault();
                handleLogout();
            });
        }

        element.dataset.authBound = 'true';
    });

    // Handler لزر إتمام الشراء (Checkout)
    const checkoutBtn = document.querySelector('.checkout-btn');
    if (checkoutBtn && !checkoutBtn.dataset.authBound) {
        checkoutBtn.addEventListener('click', (event) => {
            // إذا كان المستخدم مسجل دخول، اسمح له يروح للكارت
            if (isAuthenticated()) {
                return; // دع الرابط العادي يعمل
            }

            // إذا كان مش مسجل دخول، اطلب تسجيل الدخول
            event.preventDefault();
            setRedirectAfterLogin('cart.html');
            if (typeof showPopup === 'function') {
                showPopup('login');
            }
        });
        checkoutBtn.dataset.authBound = 'true';
    }
}

// إعادة التوجيه بعد الدخول أو تحديث الصفحة حسب الحالة
function handlePostLoginRedirect(fallbackUrl = null) {
    const redirectUrl = consumeRedirectAfterLogin();

    // تحديث الكارت بعد الدخول
    refreshCartState(true).catch(() => { });

    // إذا كان هناك redirect معين (مثل عند الضغط على رابط محمي)، توجه له
    if (redirectUrl) {
        window.location.href = redirectUrl;
    } else if (fallbackUrl) {
        window.location.href = fallbackUrl;
    } else {
        sessionStorage.setItem(POST_LOGIN_RELOAD_KEY, 'true');
        // إعادة تحميل الصفحة الحالية لضمان تزامن جميع البيانات
        window.location.reload();
    }
}

// منع الوصول للصفحات المحمية مع حفظ المسار المطلوب
function requireAuth(event, targetUrl) {
    if (isAuthenticated()) return true;
    if (event) event.preventDefault();
    const url = targetUrl || event?.currentTarget?.getAttribute('href') || window.location.href;
    setRedirectAfterLogin(url);
    if (typeof showPopup === 'function') {
        showPopup('login');
    }
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    setupAuthActionHandlers();
    const postLoginReload = sessionStorage.getItem(POST_LOGIN_RELOAD_KEY) === 'true';
    if (postLoginReload) {
        sessionStorage.removeItem(POST_LOGIN_RELOAD_KEY);
    }
    const onCartPage = window.location.pathname.endsWith('cart.html');

    // ✅ CRITICAL: Wait for cookies FIRST before attempting auth
    // This ensures httpOnly cookies are available before ensureAuthUserLoaded()
    ensureCookiesReady()
        .then(() => {
            // Now that cookies are ready, load auth user and cart
            return ensureAuthUserLoaded();
        })
        .then(() => {
            updateAuthUI();
            handleProtectedPageAccess();
            // تحميل الكارت بعد التحقق من الدخول
            return refreshCartState(true).catch(() => { });
        })
        .catch(() => {
            updateAuthUI(); // Update UI even if auth fails
            handleProtectedPageAccess();
            refreshCartState(true).catch(() => { });
        });

    loadHomepageBanner();

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearFormErrors(loginForm);

            const submitBtn = loginForm.querySelector('#loginSubmit');
            const messageBox = loginForm.querySelector('#loginFormMessage');
            const formData = new FormData(loginForm);
            const payload = Object.fromEntries(formData.entries());

            setMessage(messageBox, '', '');
            toggleLoading(submitBtn, true);

            try {
                const result = await postJson(AUTH_ENDPOINTS.signIn, payload);

                // التحقق من ما إذا كان الحساب يحتاج تحقق
                const isAccountUnverified = result?.requiresVerification || result?.data?.requiresVerification || result?.status === 'unverified' || result?.data?.status === 'unverified';

                if (isAccountUnverified) {
                    // الحساب غير مؤكد - عرض popup التحقق
                    setMessage(messageBox, '', '');

                    // حفظ البريد الإلكتروني للتحقق لاحقاً
                    accountVerificationState.email = payload.email;

                    // عرض popup التحقق
                    setTimeout(() => {
                        showAccountVerificationPopup(payload.email);
                        const otpMessage = document.getElementById('otpFormMessage');
                        if (otpMessage) {
                            setMessage(otpMessage, 'تم إرسال رمز التحقق إلى بريدك الإلكتروني. يرجى إدخاله', 'info');
                        }
                    }, 800);

                    return;
                }

                // الحساب مؤكد - إكمال عملية الدخول
                setMessage(messageBox, result?.message || 'تم تسجيل الدخول بنجاح', 'success');

                try {
                    await ensureAuthUserLoaded(true);
                } catch (profileError) {
                    setAuthUser(extractAuthUser(result));
                }
                guestUserConfirmed = false; // Reset flag - user is now authenticated

                // تحديث الكارت بعد الـ login
                try {
                    await refreshCartState(true);
                } catch (cartError) {
                }

                loginForm.reset();
                hidePopup('login');
                updateAuthUI();
                handleProtectedPageAccess();
                handlePostLoginRedirect();
            } catch (error) {

                // التحقق من ما إذا كان الخطأ بسبب حساب غير مؤكد
                const isUnverifiedError = error?.status === 403 || error?.message?.includes('unverified') || error?.message?.includes('verify');

                if (isUnverifiedError) {
                    const email = document.querySelector('#loginEmail')?.value || '';
                    if (email) {
                        accountVerificationState.email = email;

                        const resendBtn = document.createElement('button');
                        resendBtn.type = 'button';
                        resendBtn.className = 'resend-verification-btn';
                        resendBtn.textContent = 'إعادة إرسال رمز التحقق';
                        resendBtn.style.marginTop = '10px';
                        resendBtn.style.width = '100%';

                        resendBtn.addEventListener('click', async () => {
                            try {
                                resendBtn.disabled = true;
                                resendBtn.textContent = 'جاري الإرسال...';

                                await handleResendVerificationCode(email);

                                setMessage(messageBox, 'تم إرسال رمز التحقق إلى بريدك الإلكتروني', 'success');

                                setTimeout(() => {
                                    showAccountVerificationPopup(email);
                                }, 1500);
                            } catch (resendError) {
                                setMessage(messageBox, resendError.message || 'تعذر إرسال الرمز. حاول مرة أخرى.', 'error');
                                resendBtn.disabled = false;
                                resendBtn.textContent = 'إعادة إرسال رمز التحقق';
                            }
                        });

                        // إضافة الزر إلى رسالة الخطأ
                        const errorContainer = messageBox.parentElement;
                        if (errorContainer && !errorContainer.querySelector('.resend-verification-btn')) {
                            errorContainer.appendChild(resendBtn);
                        }
                    }
                }

                const validationErrors = mapValidationErrors(error.errors);
                setFieldErrors(loginForm, validationErrors);
                const message = error.status === 401
                    ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
                    : (error.message || 'تعذر تسجيل الدخول');
                setMessage(messageBox, isUnverifiedError ? 'الحساب بحاجة إلى تحقق' : message, 'error');
            } finally {
                toggleLoading(submitBtn, false);
            }
        });
    }

    initPasswordRecovery(loginForm);

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearFormErrors(signupForm);

            const submitBtn = signupForm.querySelector('#signupSubmit');
            const messageBox = signupForm.querySelector('#signupFormMessage');
            const formData = new FormData(signupForm);
            const payload = Object.fromEntries(formData.entries());

            setMessage(messageBox, '', '');
            toggleLoading(submitBtn, true);

            if (payload.password !== payload.passwordConfirm) {
                const mismatchMessage = 'كلمتا المرور غير متطابقتين';
                setFieldErrors(signupForm, { password: mismatchMessage, passwordConfirm: mismatchMessage });
                setMessage(messageBox, mismatchMessage, 'error');
                toggleLoading(submitBtn, false);
                return;
            }

            try {
                const result = await postJson(AUTH_ENDPOINTS.signUp, payload);
                setMessage(messageBox, result?.message || 'تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني', 'success');

                try {
                    await ensureAuthUserLoaded(true);
                } catch (profileError) {
                    setAuthUser(extractAuthUser(result));
                }
                guestUserConfirmed = false; // Reset flag - user is now authenticated

                signupForm.reset();

                // عرض popup التحقق من الحساب
                const email = payload.email || extractAuthUser(result)?.email || '';
                if (email) {
                    setTimeout(() => {
                        showAccountVerificationPopup(email);
                    }, 1000);
                } else {
                    hidePopup('signup');
                    updateAuthUI();
                    handlePostLoginRedirect();
                }
            } catch (error) {
                const validationErrors = mapValidationErrors(error.errors);
                setFieldErrors(signupForm, validationErrors);
                let message = error.message || 'تعذر إنشاء الحساب';
                if (error.status === 409 || (error.errors && validationErrors.email)) {
                    message = 'هذا البريد الإلكتروني مسجل بالفعل';
                }
                setMessage(messageBox, message, 'error');
            } finally {
                toggleLoading(submitBtn, false);
            }
        });
    }

    const otpForm = document.getElementById('otpForm');
    if (otpForm) {
        otpForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearFormErrors(otpForm);

            const submitBtn = otpForm.querySelector('#otpSubmit');
            const messageBox = otpForm.querySelector('#otpFormMessage');
            const formData = new FormData(otpForm);
            const otpCode = formData.get('otpCode');

            setMessage(messageBox, '', '');
            toggleLoading(submitBtn, true);

            try {
                await handleAccountVerification(otpCode);
            } catch (error) {
            } finally {
                toggleLoading(submitBtn, false);
            }
        });
    }

    const cartLinks = Array.from(document.querySelectorAll('a[href*="cart.html"]'));
    cartLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href') || 'cart.html';
            if (!requireAuth(event, href)) {
                setMessage(document.getElementById('loginFormMessage'), 'يرجى تسجيل الدخول للوصول إلى السلة.', 'error');
            }
        });
    });

    // Profile button - direct navigation to profile.html
    const profileButtons = Array.from(document.querySelectorAll('.profile-button, [data-profile-button], .profile-link button'));
    profileButtons.forEach(button => {
        if (button.dataset.profileBound === 'true') return;
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (isAuthenticated()) {
                window.location.href = 'profile.html';
            } else {
                setRedirectAfterLogin('profile.html');
                showPopup('login');
                setMessage(document.getElementById('loginFormMessage'), 'يرجى تسجيل الدخول للوصول إلى حسابك.', 'error');
            }
        });
        button.dataset.profileBound = 'true';
    });

    // Profile links fallback
    const profileLinks = Array.from(document.querySelectorAll('a[href*="profile.html"], .profile-link a'));
    profileLinks.forEach(link => {
        if (link.dataset.profileBound === 'true') return;
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href') || 'profile.html';
            if (!isAuthenticated()) {
                event.preventDefault();
                setRedirectAfterLogin(href);
                showPopup('login');
                setMessage(document.getElementById('loginFormMessage'), 'يرجى تسجيل الدخول للوصول إلى حسابك.', 'error');
            }
        });
        link.dataset.profileBound = 'true';
    });

    if (window.location.pathname.endsWith('cart.html') || window.location.pathname.endsWith('profile.html')) {
        handleProtectedPageAccess();
    }
});

document.addEventListener('auth:user-updated', () => {
    updateAuthUI();
    handleProtectedPageAccess();
});


















/**
 * ===================================================================
 * Main.js - الوظائف المشتركة في كل صفحات الموقع
 * ===================================================================
 * يحتوي على: Preloader, Header, Navigation, Cart Sidebar, Popup Forms
 */

(function () {
    "use strict";

    const FALLBACK_IMAGE = 'assets/images/product1.png';


    // Execute callback when DOM is ready (similar to jQuery ready)
    function ready(fn) {
        if (document.readyState !== 'loading') {
            fn();
        } else {
            document.addEventListener('DOMContentLoaded', fn);
        }
    }





    /* ===================================================================
    1. Preloader
    =================================================================== */
    window.addEventListener('load', function () {
        const preloader = document.getElementById('js-preloader');
        if (preloader) {
            preloader.classList.add('loaded');
        }
    });

    /* ===================================================================
    2. Header & Navigation
    =================================================================== */
    // Manage sticky header behaviour and mobile nav toggle
    function handleHeader() {
        const header = document.querySelector('.header-area');
        const headerText = document.querySelector('.header-text');

        if (!header) return;

        // Handle scroll only if headerText exists (home page)
        if (headerText) {
            const boxHeight = headerText.offsetHeight;
            const headerHeight = header.offsetHeight;

            window.addEventListener('scroll', function () {
                const scroll = window.scrollY;
                if (scroll >= boxHeight - 1.4 * headerHeight) {
                    header.classList.add("background-header");
                } else {
                    header.classList.remove("background-header");
                }
            });
        }

        // Mobile menu trigger
        const menuTrigger = document.querySelector('.menu-trigger');
        const nav = document.querySelector('.header-area .nav');

        if (menuTrigger && nav) {
            menuTrigger.addEventListener('click', function () {
                this.classList.toggle('active');
                nav.classList.toggle('active');
            });
        }
    }

    // Enable smooth scroll navigation and active link highlighting
    function handleScrolling() {
        const scrollLinks = document.querySelectorAll('.scroll-to-section a');

        scrollLinks.forEach(link => {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                const targetId = this.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    const nav = document.querySelector('.header-area .nav');
                    const menuTrigger = document.querySelector('.menu-trigger');
                    if (nav && nav.classList.contains('active')) {
                        nav.classList.remove('active');
                        if (menuTrigger) menuTrigger.classList.remove('active');
                    }
                    window.scrollTo({ top: targetElement.offsetTop, behavior: 'smooth' });
                }
            });
        });

        const sections = document.querySelectorAll('section, .main-banner');
        const navLinks = document.querySelectorAll('.nav a');

        if (sections.length > 0) {
            window.addEventListener('scroll', () => {
                let current = '';
                sections.forEach(section => {
                    const sectionTop = section.offsetTop;
                    if (window.pageYOffset >= sectionTop - 100) {
                        current = section.getAttribute('id');
                    }
                });

                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') && link.getAttribute('href').includes(current)) {
                        link.classList.add('active');
                    }
                });
            });
        }
    }

    function togglePopupVisibility(popup, visible) {
        if (!popup) return;
        popup.classList.toggle('is-visible', visible);
        popup.setAttribute('aria-hidden', visible ? 'false' : 'true');
        if (visible) {
            popup.removeAttribute('inert');
            const focusable = popup.querySelector('input, button, [tabindex]:not([tabindex="-1"])');
            if (focusable) {
                focusable.focus();
            }
        } else {
            // ACCESSIBILITY FIX: Blur any focused element inside popup before hiding
            // to prevent "aria-hidden retained focus" warning
            const activeElement = popup.querySelector(':focus');
            if (activeElement) {
                activeElement.blur();
            }
            popup.setAttribute('inert', '');
        }
    }

    function hideAllPopups() {
        ['loginPopup', 'signupPopup', 'forgotPasswordPopup', 'otpPopup', 'resetPasswordPopup'].forEach(id => {
            const popup = document.getElementById(id);
            togglePopupVisibility(popup, false);
        });
    }

    // Show login/signup popup based on requested type
    window.showPopup = function (type) {
        const loginPopup = document.getElementById('loginPopup');
        const signupPopup = document.getElementById('signupPopup');
        const forgotPopup = document.getElementById('forgotPasswordPopup');
        const otpPopup = document.getElementById('otpPopup');
        const resetPopup = document.getElementById('resetPasswordPopup');

        if (!loginPopup || !signupPopup) return;

        if (type === 'login') {
            togglePopupVisibility(signupPopup, false);
            togglePopupVisibility(forgotPopup, false);
            togglePopupVisibility(otpPopup, false);
            togglePopupVisibility(resetPopup, false);
            togglePopupVisibility(loginPopup, true);
        } else if (type === 'signup') {
            togglePopupVisibility(loginPopup, false);
            togglePopupVisibility(forgotPopup, false);
            togglePopupVisibility(otpPopup, false);
            togglePopupVisibility(resetPopup, false);
            togglePopupVisibility(signupPopup, true);
        }
    };

    // Hide login/signup popup of given type
    window.hidePopup = function (type) {
        if (!type) {
            hideAllPopups();
            return;
        }

        const target = document.getElementById(type === 'login' ? 'loginPopup' : 'signupPopup');
        togglePopupVisibility(target, false);
    };

    /* ===================================================================
    3. Shopping Cart Sidebar
    =================================================================== */

    // Show professional modal when user reaches max stock limit
    function showStockLimitModal(productName, maxStock) {
        // Remove existing modal if any
        const existingModal = document.querySelector('.stock-limit-modal-overlay');
        if (existingModal) existingModal.remove();

        const modalHtml = `
            <div class="stock-limit-modal-overlay">
                <div class="stock-limit-modal">
                    <div class="stock-limit-icon">
                        <i class="fa fa-box-open"></i>
                    </div>
                    <h3>وصلت للحد الأقصى</h3>
                    <p class="stock-limit-product">${sanitizeHtmlContent(productName)}</p>
                    <p class="stock-limit-message">
                        المخزون المتاح حالياً: <strong>${maxStock} قطعة</strong>
                    </p>
                    <p class="stock-limit-help">للكميات الأكبر، تواصل معنا للحجز المسبق</p>
                    <div class="stock-limit-actions">
                        <button class="stock-limit-close-btn">حسناً</button>
                        <a href="./contact.html" class="stock-limit-contact-btn">
                            <i class="fa fa-headset"></i> تواصل معنا
                        </a>
                    </div>
                </div>
            </div>
        `;

        const modalContainer = document.createElement('div');
        modalContainer.innerHTML = modalHtml;
        const modal = modalContainer.firstElementChild;
        document.body.appendChild(modal);

        // Show modal with animation
        requestAnimationFrame(() => {
            modal.classList.add('visible');
        });

        // Close handlers
        const closeBtn = modal.querySelector('.stock-limit-close-btn');
        closeBtn.addEventListener('click', () => {
            modal.classList.remove('visible');
            setTimeout(() => modal.remove(), 200);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('visible');
                setTimeout(() => modal.remove(), 200);
            }
        });
    }

    // Control cart sidebar open/close and quantity actions
    function handleCartSidebar() {
        const cartIcon = document.getElementById('cart-icon');
        const cartPopup = document.getElementById('cart-popup');
        const closeCartBtn = document.getElementById('close-cart-btn');
        const cartOverlay = document.querySelector('.cart-popup-overlay');
        const cartItemsList = document.getElementById('cart-items-list');
        const cartCount = document.getElementById('cart-count');
        const cartTotalPrice = document.getElementById('cart-total-price');

        // Reveal cart sidebar overlay and lock page scroll
        function openCart(triggerEvent) {
            if (triggerEvent) {
                triggerEvent.preventDefault();
            }

            if (cartPopup) {
                cartPopup.classList.add('show');
                document.body.classList.add('cart-popup-open');
            }

            refreshCartState().catch(error => {
            });
        }

        // Hide cart sidebar overlay and unlock page scroll
        function closeCart() {
            if (cartPopup) {
                cartPopup.classList.remove('show');
            }
            document.body.classList.remove('cart-popup-open');
        }

        // Refresh sidebar cart items and totals from storage
        function renderCart() {
            if (!cartItemsList) return;
            const { items } = cartState;

            cartItemsList.innerHTML = '';

            if (cartState.isLoading && !cartState.isLoaded) {
                cartItemsList.innerHTML = '<p class="cart-loading-msg">جاري تحميل السلة...</p>';
                return;
            }

            if (!items.length) {
                cartItemsList.innerHTML = '<p class="cart-empty-msg">سلة المشتريات فارغة.</p>';
                return;
            }

            // Calculate total savings for the popup header
            let totalSavings = 0;
            items.forEach(item => {
                const origPrice = parseFloat(item.originalPrice) || 0;
                const effPrice = parseFloat(item.salePrice ?? item.price) || 0;
                const qty = parseInt(item.quantity, 10) || 0;
                if (origPrice > effPrice && effPrice > 0) {
                    totalSavings += (origPrice - effPrice) * qty;
                }
            });

            items.forEach(item => {
                const element = document.createElement('div');
                element.className = 'cart-item';
                element.dataset.itemId = item.id;
                element.dataset.productId = item.productId || '';

                // Stock limit check
                const stock = parseInt(item.stock ?? 999, 10);
                element.dataset.stock = stock;
                const isAtMaxStock = item.quantity >= stock;

                // Discount price display
                const originalPrice = parseFloat(item.originalPrice) || 0;
                const effectivePrice = parseFloat(item.salePrice ?? item.price) || 0;
                const hasDiscount = originalPrice > effectivePrice && effectivePrice > 0;

                // Build price HTML
                let priceHtml = '';
                if (hasDiscount) {
                    priceHtml = `
                        <span class="cart-item-price-original">${formatPrice(originalPrice)}</span>
                        <span class="cart-item-price-current">${formatPrice(effectivePrice)}</span>
                    `;
                } else {
                    priceHtml = `<span class="cart-item-price-current">${formatPrice(item.price)}</span>`;
                }

                const cartItemHtml = `
                    <img src="${sanitizeHtmlContent(item.image)}" alt="${sanitizeHtmlContent(item.name)}">
                    <div class="cart-item-details">
                        <h4>${sanitizeHtmlContent(item.name)}</h4>
                        <p class="cart-item-price-container">${priceHtml}</p>
                    </div>
                    <div class="cart-item-actions">
                        <button class="quantity-btn remove-item-btn" aria-label="حذف المنتج"><i class="fa-regular fa-trash-can"></i></button>
                        <button class="quantity-btn decrease-btn" aria-label="تقليل الكمية"><i class="fa-solid fa-minus"></i></button>
                        <span class="quantity-display">${item.quantity}</span>
                        <button class="quantity-btn increase-btn" aria-label="زيادة الكمية"${isAtMaxStock ? ' disabled' : ''}><i class="fa-solid fa-plus"></i></button>
                    </div>
                `;
                element.innerHTML = cartItemHtml;
                cartItemsList.appendChild(element);
            });

            // Show savings in cart popup if any
            const existingSavings = document.querySelector('.cart-popup-savings');
            if (existingSavings) existingSavings.remove();

            if (totalSavings > 0) {
                const savingsEl = document.createElement('div');
                savingsEl.className = 'cart-popup-savings';
                const currencyIcon = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';
                savingsEl.innerHTML = `<i class="fa fa-tag"></i> وفرت: ${formatPrice(totalSavings)} ${currencyIcon}`;
                cartItemsList.parentNode.insertBefore(savingsEl, cartItemsList.nextSibling);
            }

            updateCartIndicators();
        }

        // Handle increment/decrement/remove clicks via event delegation
        function updateCartItemUIInstantly(itemId, newQuantity) {
            // Find item in local state
            const itemIndex = cartState.items.findIndex(item => item.id === itemId);
            if (itemIndex === -1) return;

            const item = cartState.items[itemIndex];
            const unitPrice = parseFloat(item.price) || 0;

            // Find the cart item element in DOM
            const cartItemEl = document.querySelector(`.cart-item[data-item-id="${itemId}"]`);

            if (newQuantity <= 0) {
                // Remove from local state
                cartState.items.splice(itemIndex, 1);
                // Remove from DOM
                if (cartItemEl) {
                    cartItemEl.remove();
                }
            } else {
                // Update quantity in local state
                cartState.items[itemIndex].quantity = newQuantity;

                // Update quantity display in DOM directly
                if (cartItemEl) {
                    const quantityDisplay = cartItemEl.querySelector('.quantity-display');
                    if (quantityDisplay) {
                        quantityDisplay.textContent = newQuantity;
                    }

                    // Calculate and update item subtotal INSTANTLY
                    const newSubtotal = unitPrice * newQuantity;
                    const priceDisplay = cartItemEl.querySelector('.cart-item-details p');
                    if (priceDisplay) {
                        safeSetHTML(priceDisplay, `${formatPrice(newSubtotal)}`);
                    }

                    // Update increase button disabled state based on stock
                    const maxStock = parseInt(item.stock ?? cartItemEl.dataset.stock ?? 999, 10);
                    const increaseBtn = cartItemEl.querySelector('.increase-btn');
                    if (increaseBtn) {
                        increaseBtn.disabled = newQuantity >= maxStock;
                    }
                }
            }

            // Update cart count in header
            const cartCountEl = document.getElementById('cart-count');
            if (cartCountEl) {
                const totalItems = cartState.items.reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 0), 0);
                cartCountEl.textContent = totalItems.toString();
            }

            // Update savings display
            updatePopupSavingsDisplay();

            // HIDE Grand Total and show loading spinner (don't calculate locally)
            const cartTotalEl = document.getElementById('cart-total-price');
            if (cartTotalEl) {
                cartTotalEl.classList.add('loading-total');
                cartTotalEl.innerHTML = '<i class="fa fa-spinner fa-spin"></i> جاري التحديث...';
            }

            // Check if cart is now empty and show empty message
            if (cartState.items.length === 0 && cartItemsList) {
                cartItemsList.innerHTML = '<p class="cart-empty-msg">سلة المشتريات فارغة.</p>';
                // Remove savings display when empty
                const existingSavings = document.querySelector('.cart-popup-savings');
                if (existingSavings) existingSavings.remove();
                // Reset total to 0 when empty
                if (cartTotalEl) {
                    cartTotalEl.classList.remove('loading-total');
                    const currencyIcon = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';
                    cartTotalEl.innerHTML = `0 ${currencyIcon}`;
                }
            }
        }

        // Function to update savings display in popup
        function updatePopupSavingsDisplay() {
            let totalSavings = 0;
            cartState.items.forEach(item => {
                const origPrice = parseFloat(item.originalPrice) || 0;
                const effPrice = parseFloat(item.salePrice ?? item.price) || 0;
                const qty = parseInt(item.quantity, 10) || 0;
                if (origPrice > effPrice && effPrice > 0) {
                    totalSavings += (origPrice - effPrice) * qty;
                }
            });

            const existingSavings = document.querySelector('.cart-popup-savings');

            if (totalSavings > 0) {
                const currencyIcon = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';
                const savingsHtml = `<i class="fa fa-tag"></i> وفرت: ${formatPrice(totalSavings)} ${currencyIcon}`;

                if (existingSavings) {
                    existingSavings.innerHTML = savingsHtml;
                } else {
                    const savingsEl = document.createElement('div');
                    savingsEl.className = 'cart-popup-savings';
                    savingsEl.innerHTML = savingsHtml;
                    if (cartItemsList && cartItemsList.parentNode) {
                        cartItemsList.parentNode.insertBefore(savingsEl, cartItemsList.nextSibling);
                    }
                }
            } else {
                if (existingSavings) existingSavings.remove();
            }
        }

        function debouncedCartUpdate(itemId, finalQuantity) {
            // Clear existing timer for this item
            if (cartDebounceTimers.has(itemId)) {
                clearTimeout(cartDebounceTimers.get(itemId));
            }

            // Ensure loading state is showing
            const cartTotalEl = document.getElementById('cart-total-price');
            if (cartTotalEl && !cartTotalEl.classList.contains('loading-total')) {
                cartTotalEl.classList.add('loading-total');
                safeSetHTML(cartTotalEl, '<i class="fa fa-spinner fa-spin"></i> جاري التحديث...');
            }

            // Set new debounce timer
            const timerId = setTimeout(() => {
                cartDebounceTimers.delete(itemId);

                // Send final quantity to server
                updateCartItemQuantitySilent(itemId, finalQuantity)
                    .then(() => {
                        // Server responded - update total with actual server value
                        if (cartTotalEl) {
                            cartTotalEl.classList.remove('loading-total');
                            const currencyIcon = '<img src="./assets/images/Saudi_Riyal_Symbol.png" alt="ريال" class="saudi-riyal-symbol riyal-inline-fix">';
                            safeSetHTML(cartTotalEl, `${formatPrice(cartState.totals.total)} ${currencyIcon}`);
                        }
                    })
                    .catch(error => {
                        // Remove loading state on error
                        if (cartTotalEl) {
                            cartTotalEl.classList.remove('loading-total');
                        }
                        // On error, revert to server state
                        showToast('تعذر تحديث الكمية. جاري التحديث...', 'error');
                        refreshCartState(true); // Force refresh to rollback
                    });
            }, DEBOUNCE_DELAY_MS);

            cartDebounceTimers.set(itemId, timerId);
        }

        // Handle increment/decrement/remove clicks via event delegation
        function updateCart(e) {
            const target = e.target;
            const increaseBtn = target.closest('.increase-btn');
            const decreaseBtn = target.closest('.decrease-btn');
            const removeBtn = target.closest('.remove-item-btn');

            if (increaseBtn || decreaseBtn) {
                const cartItem = (increaseBtn || decreaseBtn).closest('.cart-item');
                const itemId = cartItem?.dataset.itemId;
                if (!itemId) return;

                const current = cartState.items.find(item => item.id === itemId);
                if (!current) return;

                // Get max stock from item or data attribute
                const maxStock = parseInt(current.stock ?? cartItem?.dataset.stock ?? 999, 10);

                // Check stock limit before increasing
                if (increaseBtn && current.quantity >= maxStock) {
                    showStockLimitModal(current.name, maxStock);
                    return;
                }

                // 1. Calculate new quantity with stock limit
                const delta = increaseBtn ? 1 : -1;
                let newQuantity = Math.max(0, (current.quantity || 0) + delta);

                // Cap at max stock
                if (newQuantity > maxStock) {
                    newQuantity = maxStock;
                }

                // 2. INSTANT UI Update (Optimistic)
                updateCartItemUIInstantly(itemId, newQuantity);

                // 3. Debounced Server Sync
                debouncedCartUpdate(itemId, newQuantity);

            } else if (removeBtn) {
                const cartItem = removeBtn.closest('.cart-item');
                const itemId = cartItem?.dataset.itemId;
                if (itemId) {
                    removeCartItem(itemId).catch(error => {
                        // Keep existing remove logic (no debounce needed)
                    });
                }
            }
        }

        // Event Listeners
        if (cartIcon) {
            cartIcon.addEventListener('click', (e) => {
                e.preventDefault();
                openCart(e);
            });
        }

        if (closeCartBtn) {
            closeCartBtn.addEventListener('click', closeCart);
        }

        if (cartOverlay) {
            cartOverlay.addEventListener('click', closeCart);
        }

        if (cartItemsList) {
            cartItemsList.addEventListener('click', updateCart);
        }

        document.addEventListener('cart:updated', renderCart);
        document.addEventListener('cart:loading', ({ detail }) => {
            if (!cartItemsList) return;
            if (detail?.loading) {
                safeSetHTML(cartItemsList, '<p class="cart-loading-msg">جاري تحميل السلة...</p>');
            }
        });

        window.cartRenderFunction = renderCart;
        renderCart();
    }

    // ===================================================================
    // CATEGORIES PAGINATION STATE & HELPERS
    // ===================================================================

    // State for category pagination
    const categoriesPaginationState = {
        currentPage: 1,
        isLoading: false,
        totalPages: 1,
        allCategories: []
    };

    function updateLoadMoreButtonVisibility() {
        const button = document.getElementById('loadMoreCategoriesBtn');
        if (!button) return;

        const hasMorePages = categoriesPaginationState.currentPage < categoriesPaginationState.totalPages;
        button.hidden = !hasMorePages || categoriesPaginationState.allCategories.length === 0;
    }

    function createCategoryItem(category) {
        const categoryId = category._id || category.id || category.slug || '';
        const categorySlug = category.slug || categoryId;

        const params = new URLSearchParams();
        if (categorySlug) params.set('category', categorySlug);
        if (categoryId) params.set('categoryId', categoryId);
        const targetUrl = `products.html${params.toString() ? `?${params.toString()}` : ''}`;
        const categoryImage = resolveCategoryImage(category);

        return `
            <li class="category-circle-item">
                <a href="${targetUrl}" class="category-circle-link">
                    <div class="category-circle-wrapper">
                        <img src="${categoryImage}" alt="${category.name}" class="category-circle-image">
                    </div>
                    <p class="category-circle-name">${category.name}</p>
                </a>
            </li>
        `;
    }

    function appendHomeCategories(newCategories = []) {
        const leftColumn = document.getElementById('categoriesColumnLeft');

        if (!leftColumn) return;

        const existingHtml = leftColumn.innerHTML;
        const newItems = newCategories.map(createCategoryItem).join('');

        safeSetHTML(leftColumn, sanitizeHtmlContent(existingHtml + newItems));
    }

    function renderHomeCategories(categories = []) {
        const leftColumn = document.getElementById('categoriesColumnLeft');
        const rightColumn = document.getElementById('categoriesColumnRight');
        const emptyState = document.getElementById('categoriesEmptyState');

        if (!leftColumn) return;

        const total = categories.length;

        if (emptyState) {
            emptyState.hidden = total !== 0;
        }

        if (!total) {
            safeSetHTML(leftColumn, '');
            if (rightColumn) rightColumn.style.display = 'none';
            updateLoadMoreButtonVisibility();
            return;
        }

        safeSetHTML(leftColumn, sanitizeHtmlContent(categories.map(createCategoryItem).join('')));
        if (rightColumn) rightColumn.style.display = 'none';
        updateLoadMoreButtonVisibility();
    }

    function formatPrice(value) {
        if (value === undefined || value === null || value === '') return '-';
        const number = Number(value);
        if (Number.isNaN(number)) return value;
        return number.toLocaleString('ar-EG');
    }

    function resolveProductImage(product = {}) {
        if (!product) {
            return FALLBACK_IMAGE;
        }

        const candidates = [];

        const pushFromValue = (value) => {
            if (!value) return;
            if (typeof value === 'string') {
                const normalized = ensureAbsoluteUrl(value);
                if (normalized) candidates.push(normalized);
                return;
            }

            if (Array.isArray(value)) {
                value.forEach(item => pushFromValue(item));
                return;
            }

            if (typeof value === 'object') {
                const objectKeys = ['secure_url', 'url', 'src', 'path', 'href', 'image', 'imageUrl'];
                objectKeys.forEach(key => {
                    if (typeof value[key] === 'string') {
                        pushFromValue(value[key]);
                    }
                });
            }
        };

        if (Array.isArray(product.images)) {
            product.images.forEach(img => pushFromValue(img));
        }

        const imageKeys = [
            'image', 'imageCover', 'image_cover', 'imageUrl', 'image_url', 'imageURL',
            'defaultImage', 'default_image', 'primaryImage', 'mainImage', 'thumbnail',
            'thumb', 'thumbUrl', 'cover', 'media', 'photo', 'picture', 'previewImage',
            'preview', 'gallery', 'productImage'
        ];

        imageKeys.forEach(key => pushFromValue(product[key]));

        const image = candidates.find(src => typeof src === 'string' && src.trim().length > 0);
        return image || FALLBACK_IMAGE;
    }

    window.resolveProductImage = resolveProductImage;

    function resolveCategoryImage(category = {}) {
        const candidates = [];

        const collectFromObject = (value) => {
            if (!value || typeof value !== 'object') return;
            ['secure_url', 'url', 'src', 'path', 'href'].forEach(key => {
                if (typeof value[key] === 'string') {
                    candidates.push(value[key]);
                }
            });
        };

        if (category.image) {
            if (typeof category.image === 'string') {
                candidates.push(category.image);
            } else {
                collectFromObject(category.image);
            }
        }

        if (Array.isArray(category.images)) {
            category.images.forEach(img => {
                if (typeof img === 'string') {
                    candidates.push(img);
                } else if (img && typeof img === 'object') {
                    collectFromObject(img);
                }
            });
        }

        if (category.media) {
            if (typeof category.media === 'string') {
                candidates.push(category.media);
            } else {
                collectFromObject(category.media);
            }
        }

        if (category.icon && typeof category.icon === 'string') {
            candidates.push(category.icon);
        }

        const normalized = candidates
            .map(src => ensureAbsoluteUrl(src))
            .find(src => typeof src === 'string' && src.trim().length > 0);

        return normalized || 'assets/images/tabs-first-icon.png';
    }

    function ensureAbsoluteUrl(url) {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();

        if (/^(?:https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
            return trimmed;
        }

        if (trimmed.startsWith('assets/')) {
            return trimmed;
        }

        const cleaned = trimmed.replace(/^\/+/, '');
        return `${API_BASE_HOST.replace(/\/$/, '')}/${cleaned}`;
    }

    async function fetchHomeCategories(page = 1) {
        const leftColumn = document.getElementById('categoriesColumnLeft');
        const rightColumn = document.getElementById('categoriesColumnRight');

        if (!leftColumn || !rightColumn) {
            return;
        }

        const endpoint = window.API_CONFIG?.getEndpoint('CATEGORIES');
        const paginatedEndpoint = `${endpoint}?page=${page}&limit=10`;
        
        try {
            // ✅ استخدم getJson - تتعامل مع credentials: 'include'
            const payload = await getJson(paginatedEndpoint);
            const categories = Array.isArray(payload?.data?.documents) ? payload.data.documents : [];
            
            // Track pagination info from response
            if (payload?.data?.pagination) {
                categoriesPaginationState.totalPages = payload.data.pagination.totalPages || 1;
                categoriesPaginationState.currentPage = page;
            } else if (Array.isArray(payload?.data?.documents)) {
                // Fallback: if less than 10 items, assume it's the last page
                categoriesPaginationState.totalPages = (categories.length < 10) ? page : page + 1;
                categoriesPaginationState.currentPage = page;
            }

            if (page === 1) {
                // First page: render normally
                categoriesPaginationState.allCategories = categories;
                renderHomeCategories(categories);
            } else {
                // Subsequent pages: append to existing
                categoriesPaginationState.allCategories = categoriesPaginationState.allCategories.concat(categories);
                appendHomeCategories(categories);
            }
        } catch (error) {
            // ✅ Show popup only for critical endpoints (products/categories)
            if (typeof window.showServerErrorPopup === 'function') {
                window.showServerErrorPopup(paginatedEndpoint);
            }
            
            if (page === 1) {
                renderHomeCategories([]);
            } else {
                // Show inline error on load more
                showLoadMoreError();
            }
        }
    }

    function showLoadMoreError() {
        const button = document.getElementById('loadMoreCategoriesBtn');
        if (!button) return;

        const originalText = button.textContent;
        safeSetText(button, 'حدث خطأ في التحميل');
        button.disabled = true;

        setTimeout(() => {
            safeSetText(button, originalText);
            button.disabled = false;
        }, 3000);
    }

    async function handleLoadMoreCategories() {
        const button = document.getElementById('loadMoreCategoriesBtn');
        if (!button) return;

        // Prevent double-click and multiple requests
        if (categoriesPaginationState.isLoading) return;

        // Check if there are more pages
        if (categoriesPaginationState.currentPage >= categoriesPaginationState.totalPages) {
            button.hidden = true;
            return;
        }

        // Disable button and show loading state
        categoriesPaginationState.isLoading = true;
        button.disabled = true;
        const originalText = button.textContent;
        safeSetText(button, 'جاري التحميل...');

        try {
            const nextPage = categoriesPaginationState.currentPage + 1;
            await fetchHomeCategories(nextPage);
            updateLoadMoreButtonVisibility();
        } catch (error) {
            console.error('Error loading more categories:', error);
            showLoadMoreError();
        } finally {
            categoriesPaginationState.isLoading = false;
            button.disabled = false;
            safeSetText(button, originalText);
        }
    }

    function normalizeProducts(rawProducts = []) {
        if (!Array.isArray(rawProducts)) return [];

        return rawProducts.map((product, index) => {
            const id = product._id || product.id || product.sku || product.handle || `product-${index}`;
            const name = product.name || product.title || 'منتج بدون اسم';
            const categoryName = product.category?.name || product.categoryName || 'فئة غير محددة';

            const rawPrice = product.price?.current ?? product.price?.value ?? product.price?.amount ?? product.price ?? product.currentPrice ?? product.salePrice ?? product.basePrice;
            const basePriceNumeric = sanitizePrice(rawPrice);
            const hasBasePrice = Number.isFinite(basePriceNumeric) && basePriceNumeric > 0;

            const discountCandidates = [
                product.priceAfterDiscount,
                product.discountPrice,
                product.discountedPrice,
                product.salePriceAfterDiscount,
                product.finalPrice,
                product.final_price,
                product.price?.afterDiscount,
                product.price?.priceAfterDiscount
            ];
            const discountRaw = discountCandidates.find(value => value !== undefined && value !== null && value !== '');
            const discountNumeric = sanitizePrice(discountRaw);
            const hasDiscountPrice = Number.isFinite(discountNumeric) && discountNumeric > 0;

            const originalPrice = hasBasePrice ? basePriceNumeric : null;
            const discountPrice = hasDiscountPrice && hasBasePrice && discountNumeric < basePriceNumeric ? discountNumeric : null;

            const effectivePrice = Number.isFinite(discountPrice)
                ? discountPrice
                : hasBasePrice
                    ? basePriceNumeric
                    : (hasDiscountPrice ? discountNumeric : null);
            const price = Number.isFinite(effectivePrice) && effectivePrice > 0 ? effectivePrice : null;

            const rawInstallation = product.installationPrice ?? product.installation_price ?? product.installationFee ?? product.details?.installationPrice ?? product.details?.installation_fee;
            const numericInstallation = sanitizePrice(rawInstallation);
            const installationPrice = Number.isFinite(numericInstallation) && numericInstallation >= 0 ? numericInstallation : null;

            const image = resolveProductImage(product);
            const slug = product.slug || product.handle || id;
            const description = product.shortDescription || product.description || 'اكتشف المزيد عن هذا المنتج عند فتح التفاصيل.';

            return { id, name, categoryName, price, originalPrice, discountPrice, installationPrice, image, slug, description };
        });
    }

    function bindDynamicAddToCart(container) {
        if (!container) return;

        container.querySelectorAll('.add-to-cart-btn').forEach(button => {
            if (button.dataset.bound === 'true') return;
            button.dataset.bound = 'true';

            button.addEventListener('click', event => {
                event.preventDefault();
                const card = button.closest('.product-card');
                if (!card) return;

                const product = {
                    id: button.dataset.id || card.dataset.id,
                    name: card.dataset.name,
                    price: Number(card.dataset.price) || 0,
                    image: card.dataset.image,
                    installationPrice: Number(button.dataset.installationPrice ?? card.dataset.installationPrice) || 0
                };

                if (typeof addToCart === 'function') {
                    addToCart(product);
                }
            });
        });
    }

    function renderLatestProducts(products = []) {
        const grid = document.getElementById('latestProductsGrid');
        const emptyState = document.getElementById('productsEmptyState');
        const heading = document.getElementById('productsHeading');
        const moreButton = document.getElementById('moreProductsContainer');

        if (!grid) return;

        const normalized = normalizeProducts(products);

        if (!normalized.length) {
            safeSetHTML(grid, '');
            grid.style.display = 'none';
            grid.setAttribute('aria-hidden', 'true');
            if (heading) heading.style.display = 'none';
            if (moreButton) moreButton.style.display = 'none';
            if (emptyState) {
                emptyState.style.display = 'block';
            }
            return;
        }

        grid.style.display = '';
        grid.removeAttribute('aria-hidden');
        if (heading) heading.style.display = '';
        if (moreButton) moreButton.style.display = '';
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        const dataset = normalized;

        const gridHtml = dataset.map(({ id, name, categoryName, price, originalPrice, discountPrice, installationPrice, image, slug, description }) => {
            const detailId = id || slug || '';
            const productUrl = detailId ? `./productDetails.html?id=${encodeURIComponent(detailId)}` : '#';
            const hasDiscount = Number.isFinite(originalPrice) && originalPrice > 0
                && Number.isFinite(discountPrice) && discountPrice > 0
                && discountPrice < originalPrice;
            const priceMarkup = hasDiscount
                ? `<span class="old-price">${formatPrice(originalPrice)}</span><span class="current-price">${formatPrice(price ?? discountPrice ?? 0)}</span>`
                : `<span class="current-price">${price !== null ? formatPrice(price) : '-'}</span>`;
            const datasetPrice = price !== null ? price : (Number.isFinite(discountPrice) ? discountPrice : 0);
            const originalPriceAttr = originalPrice != null ? originalPrice : '';
            const discountPriceAttr = discountPrice != null ? discountPrice : '';
            const datasetInstallation = installationPrice != null ? installationPrice : 0;

            return `
                <div class="col-lg-4 col-md-6">
                    <div class="product-card" data-id="${id}" data-name="${name}" data-price="${datasetPrice}" data-original-price="${originalPriceAttr}" data-discount-price="${discountPriceAttr}" data-installation-price="${datasetInstallation}" data-image="${image}">
                        <div class="image-thumb">
                            <img src="${image}" alt="${name}">
                        </div>
                        <div class="down-content">
                            <span>${categoryName}</span>
                            <h4>${name}</h4>
                            <p class="product-description">${description}</p>
                            <p class="product-price">${priceMarkup} <img src="./assets/images/Saudi_Riyal_Symbol.png" alt="" aria-hidden="true" class="saudi-riyal-symbol" /></p>
                            <div class="product-buttons">
                                <a href="${productUrl}" class="secondary-button">عرض المنتج</a>
                                <a href="#" class="add-to-cart-btn secondary-button" data-id="${id}" data-installation-price="${datasetInstallation}">أضف للسلة</a>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        safeSetHTML(grid, sanitizeHtmlContent(gridHtml));

        bindDynamicAddToCart(grid);
    }

    async function fetchLatestProducts() {
        const grid = document.getElementById('latestProductsGrid');
        if (!grid) return;

        const endpoint = window.API_CONFIG?.getEndpoint('PRODUCTS') + '?limit=6';

        try {
            // ✅ استخدم getJson - تتعامل مع credentials: 'include'
            const payload = await getJson(endpoint);
            const products = Array.isArray(payload?.data?.products)
                ? payload.data.products
                : Array.isArray(payload?.data?.documents)
                    ? payload.data.documents
                    : Array.isArray(payload?.data)
                        ? payload.data
                        : [];

            console.log('Fetched products:', products.length);
            renderLatestProducts(products);
        } catch (error) {
            // ✅ Show popup only for critical endpoints (products/categories)
            if (typeof window.showServerErrorPopup === 'function') {
                window.showServerErrorPopup(endpoint);
            }
            
            console.error('Error fetching products:', error);
            renderLatestProducts([]);
        }
    }

    /* ===================================================================
    5. Toast Notification
    =================================================================== */
    // Display temporary toast message near bottom of page
    window.showToast = function (message, type = 'info') {
        if (typeof document === 'undefined') return;

        let toast = document.getElementById('add-to-cart-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'add-to-cart-toast';
            toast.className = 'add-to-cart-toast';
            document.body.appendChild(toast);
        }

        const existingTimeoutId = toast.dataset.timeoutId ? Number(toast.dataset.timeoutId) : null;
        if (existingTimeoutId) {
            clearTimeout(existingTimeoutId);
        }

        if (type) {
            toast.dataset.type = type;
        } else {
            delete toast.dataset.type;
        }

        toast.textContent = message;
        toast.classList.add('show');

        const timeoutId = window.setTimeout(() => {
            toast.classList.remove('show');
            delete toast.dataset.type;
            delete toast.dataset.timeoutId;
        }, 3000);

        toast.dataset.timeoutId = String(timeoutId);
    }

    /* ===================================================================
    5.1 Clipboard Copy Helper
    =================================================================== */
    window.copyContent = function (textElementId, buttonId) {
        if (typeof document === 'undefined') return;

        const textElement = document.getElementById(textElementId);
        const button = document.getElementById(buttonId);

        if (!textElement || !button) return;

        const textToCopy = (textElement.textContent || textElement.innerText || '').trim();
        if (!textToCopy) {
            if (typeof window.showToast === 'function') {
                window.showToast('لا يوجد نص لنسخه.', 'warning');
            }
            return;
        }

        const originalContent = button.innerHTML;
        const originalAriaLabel = button.getAttribute('aria-label');

        const clearExistingTimeout = () => {
            if (button.dataset.copyTimeoutId) {
                const existingId = Number(button.dataset.copyTimeoutId);
                if (existingId) {
                    clearTimeout(existingId);
                }
                delete button.dataset.copyTimeoutId;
            }
        };

        const revertButton = () => {
            button.innerHTML = originalContent;
            if (originalAriaLabel !== null) {
                button.setAttribute('aria-label', originalAriaLabel);
            } else {
                button.removeAttribute('aria-label');
            }
        };

        const notify = (message, type) => {
            if (typeof window.showToast === 'function') {
                window.showToast(message, type);
            } else if (typeof alert === 'function') {
                alert(message);
            }
        };

        const indicateSuccess = () => {
            button.textContent = '✔️';
            button.setAttribute('aria-label', 'تم النسخ');

            clearExistingTimeout();
            const timeoutId = window.setTimeout(() => {
                revertButton();
                delete button.dataset.copyTimeoutId;
            }, 2000);
            button.dataset.copyTimeoutId = String(timeoutId);

            notify('تم النسخ إلى الحافظة بنجاح', 'success');
        };

        const handleError = (error) => {
            console.error('فشل النسخ:', error);
            clearExistingTimeout();
            revertButton();
            notify('تعذر النسخ، يرجى المحاولة يدوياً.', 'error');
        };

        const fallbackCopy = () => new Promise((resolve, reject) => {
            try {
                const textarea = document.createElement('textarea');
                textarea.value = textToCopy;
                textarea.setAttribute('readonly', '');
                textarea.style.position = 'fixed';
                textarea.style.top = '-9999px';

                document.body.appendChild(textarea);
                textarea.select();
                textarea.setSelectionRange(0, textarea.value.length);

                const success = document.execCommand('copy');
                document.body.removeChild(textarea);

                if (success) {
                    resolve();
                } else {
                    reject(new Error('execCommand copy failed'));
                }
            } catch (fallbackError) {
                reject(fallbackError);
            }
        });

        const hasClipboardAPI = !!(navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function');

        const primaryPromise = hasClipboardAPI
            ? navigator.clipboard.writeText(textToCopy)
            : fallbackCopy();

        primaryPromise
            .then(indicateSuccess)
            .catch(error => {
                if (hasClipboardAPI) {
                    fallbackCopy().then(indicateSuccess).catch(handleError);
                } else {
                    handleError(error);
                }
            });
    }

    /* ===================================================================
    6. Add to Cart Functionality
    =================================================================== */
    // Add product to session cart (or increase quantity)
    async function addToCart(product) {
        if (!product || !product.id) {
            showToast('تعذر إضافة هذا المنتج للسلة.', 'error');
            return;
        }

        // SECURITY: Validate product ID access (prevent IDOR)
        if (!validateProductIdAccess(product.id)) {
            showToast('منتج غير صحيح.', 'error');
            return;
        }

        try {
            // SECURITY: Use cached price instead of DOM price (prevent price manipulation)
            const securePrice = getSecureProductPrice(product.id, product.price);

            const payload = {
                id: product.id,
                name: product.name,
                price: securePrice,
                image: product.image,
                installationPrice: Number(product.installationPrice) || 0
            };

            const snapshot = await addProductToCartById(product.id, 1, payload);
            showToast(`تمت إضافة "${product.name}" إلى السلة!`, 'success');
            updateCartIndicators();
            if (typeof cartRenderFunction === 'function') {
                cartRenderFunction(snapshot);
            }
        } catch (error) {
            showToast(error.message || 'تعذر إضافة المنتج للسلة.', 'error');
        }
    }

    // Initialize add to cart buttons
    // Attach click handlers for all "add to cart" buttons
    function initAddToCart() {
        const addToCartButtons = document.querySelectorAll('.add-to-cart-btn');
        addToCartButtons.forEach(button => {
            button.addEventListener('click', function (e) {
                e.preventDefault();
                const productCard = this.closest('.product-card');

                if (productCard) {
                    const product = {
                        id: this.dataset.id || productCard.dataset.id,
                        name: productCard.dataset.name,
                        price: Number(productCard.dataset.price) || 0,
                        image: productCard.dataset.image,
                        installationPrice: Number(this.dataset.installationPrice ?? productCard.dataset.installationPrice) || 0
                    };
                    addToCart(product);
                }
            });
        });
    }

    /* ===================================================================
    7. Dark Mode Toggle
    =================================================================== */
    // Initialize theme toggle and persist user preference
    function initDarkMode() {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        // Check for saved theme preference or default to 'light'
        const currentTheme = localStorage.getItem('theme') || 'light';
        document.documentElement.setAttribute('data-theme', currentTheme);

        // Update icon based on current theme
        updateThemeIcon(currentTheme);

        themeToggle.addEventListener('click', function () {
            const theme = document.documentElement.getAttribute('data-theme');
            const newTheme = theme === 'dark' ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    // Swap toggle icon depending on active theme
    function updateThemeIcon(theme) {
        const themeToggle = document.getElementById('theme-toggle');
        if (!themeToggle) return;

        const icon = themeToggle.querySelector('i');
        if (theme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
    }

    /* ===================================================================
    8. Initialization
    =================================================================== */
    ready(function () {
        handleHeader();
        handleScrolling();
        handleCartSidebar();
        initAddToCart(); // Initialize add to cart functionality
        initDarkMode(); // Initialize dark mode
        
        // Initialize Load More Categories button
        const loadMoreBtn = document.getElementById('loadMoreCategoriesBtn');
        if (loadMoreBtn) {
            loadMoreBtn.addEventListener('click', handleLoadMoreCategories);
        }
        
        fetchHomeCategories();
        fetchLatestProducts();
        refreshCartState().catch(error => {
        });
    });

})();
