/**
 * ===================================================================
 * Products.js - وظائف خاصة بصفحات عرض المنتجات
 * ===================================================================
 */

(function () {
    "use strict";

    let allProducts = [];
    let categoriesFromApi = [];
    let categoryHierarchy = new Map();
    let currentCategory = 'all';
    let currentCategoryId = 'all';
    let currentSubCategory = 'all';
    let searchQuery = '';
    let minPriceFilter = 0;
    let maxPriceFilter = Infinity;
    let isBestSellingEnabled = false;
    let currentSortBy = 'none';
    let isFetchingProducts = false;
    let isFetchingCategories = false;
    let productsLoaded = false;

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

    function getTotalCartItems(items) {
        if (typeof getCartItemCount === 'function') {
            return getCartItemCount(items);
        }
        if (!Array.isArray(items)) return 0;
        return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    }

    /* ===================================================================
    1. Initialize Page
    =================================================================== */
    window.addEventListener('load', async function() {
        const urlParams = new URLSearchParams(window.location.search);
        const initialCategorySlug = urlParams.get('category');
        const initialCategoryId = urlParams.get('categoryId');

        currentCategory = initialCategorySlug || initialCategoryId || 'all';
        currentCategoryId = initialCategoryId || initialCategorySlug || 'all';
        currentSubCategory = urlParams.get('subcategory') || 'all';

        setupEventListeners();
        await loadCategories();
        await loadProducts();

        document.addEventListener('cart:updated', () => {
            updateCartCount();
            renderCart();
        });

        document.addEventListener('cart:loading', ({ detail }) => {
            if (detail?.loading) {
                const cartList = document.getElementById('cart-items-list');
                if (cartList) {
                    safeSetHTML(cartList, '<p class="cart-loading-msg">جاري تحميل السلة...</p>');
                }
            }
        });

        try {
            await ensureCartStateLoaded();
        } catch (error) {
        } finally {
            updateCartCount();
            renderCart();
        }
    });

    /* ===================================================================
    2. Setup Event Listeners
    =================================================================== */
    // Prepare UI event handlers for filters, search, and cart overlay
    function setupEventListeners() {
        const filtersContainer = document.getElementById('categoryFilters');

        if (filtersContainer) {
            filtersContainer.addEventListener('click', function(event) {
                const subButton = event.target.closest('.sub-filter-btn');
                if (subButton && filtersContainer.contains(subButton)) {
                    event.preventDefault();
                    handleSubCategoryClick(subButton);
                    return;
                }

                const categoryButton = event.target.closest('.filter-btn');
                if (categoryButton && filtersContainer.contains(categoryButton)) {
                    event.preventDefault();
                    handleCategoryClick(categoryButton);
                }
            });
        }

        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');

        if (searchInput) {
            searchInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    searchQuery = this.value.trim().toLowerCase();
                    if (clearSearch) {
                        clearSearch.classList.toggle('active', searchQuery !== '');
                    }
                    filterProducts();
                }
            });

            searchInput.addEventListener('input', function(e) {
                if (clearSearch) {
                    clearSearch.classList.toggle('active', e.target.value.trim() !== '');
                }
            });
        }

        if (clearSearch) {
            clearSearch.addEventListener('click', function() {
                if (searchInput) {
                    searchInput.value = '';
                    searchQuery = '';
                    clearSearch.classList.remove('active');
                    filterProducts();
                    searchInput.focus();
                }
            });
        }

        const productsGrid = document.getElementById('productsGrid');
        if (productsGrid) {
            productsGrid.addEventListener('click', function(event) {
                const addButton = event.target.closest('.add-to-cart-btn');
                if (!addButton || !productsGrid.contains(addButton)) return;

                event.preventDefault();
                const productId = addButton.dataset.id;
                const product = allProducts.find(p => p.id === productId);
                if (product) {
                    productMetadataCache.set(product.id, {
                        name: product.name,
                        price: product.price,
                        image: product.image
                    });
                    addToCart(product);
                }
            });
        }

        // Cart icon
        const cartIcon = document.getElementById('cart-icon');
        if (cartIcon) {
            cartIcon.addEventListener('click', function(e) {
                e.preventDefault();
                openCart(e);
            });
        }

        // Close cart button
        const closeCartBtn = document.getElementById('close-cart-btn');
        if (closeCartBtn) {
            closeCartBtn.addEventListener('click', closeCart);
        }

        // Cart overlay
        const cartOverlay = document.querySelector('.cart-popup-overlay');
        if (cartOverlay) {
            cartOverlay.addEventListener('click', closeCart);
        }

        // Filter/Sort Popup
        const filterBtn = document.getElementById('filterSortBtn');
        const filterPopup = document.getElementById('filterSortPopup');
        const closeFilterBtn = document.getElementById('closeFilterPopup');
        const applyFilterBtn = document.getElementById('applyFilters');
        const resetFilterBtn = document.getElementById('resetFilters');
        const filterOverlay = document.getElementById('filterSortOverlay');

        if (filterBtn) {
            filterBtn.addEventListener('click', function() {
                if (filterPopup) {
                    filterPopup.classList.add('active');
                    if (filterOverlay) filterOverlay.classList.add('active');
                }
            });
        }

        const closePopup = () => {
            if (filterPopup) filterPopup.classList.remove('active');
            if (filterOverlay) filterOverlay.classList.remove('active');
        };

        if (closeFilterBtn) {
            closeFilterBtn.addEventListener('click', closePopup);
        }

        if (filterOverlay) {
            filterOverlay.addEventListener('click', closePopup);
        }

        if (applyFilterBtn) {
            applyFilterBtn.addEventListener('click', function() {
                const sortSelect = document.querySelector('input[name="sortBy"]:checked');
                if (sortSelect) {
                    currentSortBy = sortSelect.value;
                }
                const popupMinPrice = document.getElementById('popupMinPrice');
                const popupMaxPrice = document.getElementById('popupMaxPrice');
                if (popupMinPrice) minPriceFilter = Number(popupMinPrice.value) || 0;
                if (popupMaxPrice) maxPriceFilter = Number(popupMaxPrice.value) || Infinity;
                filterProducts();
                closePopup();
            });
        }

        if (resetFilterBtn) {
            resetFilterBtn.addEventListener('click', function() {
                currentSortBy = 'none';
                minPriceFilter = 0;
                maxPriceFilter = Infinity;
                const popupMinPrice = document.getElementById('popupMinPrice');
                const popupMaxPrice = document.getElementById('popupMaxPrice');
                if (popupMinPrice) popupMinPrice.value = '0';
                if (popupMaxPrice) popupMaxPrice.value = '';
                document.querySelectorAll('input[name="sortBy"]').forEach(el => el.checked = false);
                filterProducts();
                closePopup();
            });
        }
    }

    /* ===================================================================
    3. Filter and Render Products
    =================================================================== */
    function applySorting(products) {
        if (currentSortBy === 'price-low-high') {
            return [...products].sort((a, b) => {
                const priceA = a.discountPrice || a.price || 0;
                const priceB = b.discountPrice || b.price || 0;
                return Number(priceA) - Number(priceB);
            });
        }
        if (currentSortBy === 'price-high-low') {
            return [...products].sort((a, b) => {
                const priceA = a.discountPrice || a.price || 0;
                const priceB = b.discountPrice || b.price || 0;
                return Number(priceB) - Number(priceA);
            });
        }
        if (currentSortBy === 'best-selling') {
            return [...products].sort((a, b) => {
                const soldA = Number(a.sold) || 0;
                const soldB = Number(b.sold) || 0;
                return soldB - soldA;
            });
        }
        return products;
    }

    // Render products matching current category/search filters
    function filterProducts() {
        const grid = document.getElementById('productsGrid');
        const emptyState = document.getElementById('no-products-message');

        if (!grid) return;

        const filteredProducts = applySorting(allProducts.filter(product => {
            const matchesCategory = matchesAnyFilter([currentCategory, currentCategoryId], product.categorySlug, product.categoryId, product.categoryName);
            const matchesSubCategory = matchesAnyFilter([currentSubCategory], product.subCategorySlug, product.subCategoryId, product.subCategoryName);
            const matchesSearch = !searchQuery ||
                product.name.toLowerCase().includes(searchQuery) ||
                (product.categoryName && product.categoryName.toLowerCase().includes(searchQuery)) ||
                (product.description && product.description.toLowerCase().includes(searchQuery));
            const productPrice = Number(product.price) || 0;
            const matchesPrice = productPrice >= minPriceFilter && productPrice <= maxPriceFilter;
            return matchesCategory && matchesSubCategory && matchesSearch && matchesPrice;
        }));

        if (filteredProducts.length === 0) {
            safeSetHTML(grid, '');
            grid.classList.add('hidden');
            grid.setAttribute('aria-hidden', 'true');
            if (emptyState) {
                let message = 'عذراً، لم نجد منتجات تطابق معايير البحث.';
                if (minPriceFilter > 0 || maxPriceFilter !== Infinity) {
                    message = `عذراً، لم نجد منتجات بالأسعار المختارة (${formatPrice(minPriceFilter)} - ${formatPrice(maxPriceFilter)} ﷼).`;
                }
                safeSetHTML(emptyState, sanitizeHtmlContent(`<h3>لا توجد منتجات</h3><p>${message}</p>`));
                emptyState.classList.remove('hidden');
            }
            return;
        }

        grid.classList.remove('hidden');
        grid.removeAttribute('aria-hidden');
        if (emptyState) {
            emptyState.classList.add('hidden');
        }

        const gridHtml = filteredProducts.map(product => {
            const hasDiscount = Number.isFinite(product.originalPrice) && product.originalPrice > 0
                && Number.isFinite(product.discountPrice) && product.discountPrice > 0
                && product.discountPrice < product.originalPrice;
            const priceMarkup = hasDiscount
                ? `<span class="old-price">${formatPrice(product.originalPrice)}</span><span class="current-price">${formatPrice(product.price)}</span>`
                : `<span class="current-price">${formatPrice(product.price)}</span>`;
            const originalPriceAttr = product.originalPrice != null ? product.originalPrice : '';
            const discountPriceAttr = product.discountPrice != null ? product.discountPrice : '';

            return `
            <div class="product-item product-card" data-id="${sanitizeHtmlContent(product.id)}" data-name="${sanitizeHtmlContent(product.name)}" data-price="${product.price}" data-original-price="${originalPriceAttr}" data-discount-price="${discountPriceAttr}" data-image="${sanitizeHtmlContent(product.image)}" data-category="${sanitizeHtmlContent(product.categorySlug)}">
                <div class="image-thumb">
                    <img src="${sanitizeHtmlContent(product.image)}" alt="${sanitizeHtmlContent(product.name)}">
                </div>
                <div class="down-content">
                    <span>${sanitizeHtmlContent(product.categoryName)}</span>
                    <div class="product-heading">
                        <h4>${sanitizeHtmlContent(product.name)}</h4>
                    </div>
                    <p class="product-description">${sanitizeHtmlContent(product.description)}</p>
                    <p class="product-price">${priceMarkup} <img src="./assets/images/Saudi_Riyal_Symbol.png" alt="" aria-hidden="true" class="saudi-riyal-symbol" /></p>
                    <div class="product-buttons">
                        <a href="productDetails.html?id=${sanitizeHtmlContent(product.id)}" class="secondary-button">عرض المنتج</a>
                        <a href="#" class="add-to-cart-btn secondary-button" data-id="${sanitizeHtmlContent(product.id)}">أضف للسلة</a>
                    </div>
                </div>
            </div>
        `;
        }).join('');
        safeSetHTML(grid, sanitizeHtmlContent(gridHtml));
    }

    /* ===================================================================
    4. Cart Functions
    =================================================================== */
    // Persist selected product into session cart storage
    async function addToCart(product) {
        if (!product || !product.id) {
            showToast('تعذر إضافة هذا المنتج للسلة.');
            return;
        }

        try {
            await ensureCartStateLoaded();
            await addProductToCartById(product.id, 1, {
                name: product.name,
                price: product.price
            });
            showToast(`تمت إضافة "${product.name}" إلى السلة!`);
        } catch (error) {
            showToast(error.message || 'تعذر إضافة المنتج للسلة.');
        }
    }

    // Populate sidebar cart with current session contents
    function renderCart() {
        const cartList = document.getElementById('cart-items-list');
        const cartTotalPrice = document.getElementById('cart-total-price');

        if (!cartList) return;

        const state = getCartStateSafe();

        if (state.isLoading && !state.isLoaded) {
            safeSetHTML(cartList, '<p class="cart-loading-msg">جاري تحميل السلة...</p>');
            return;
        }

        if (!state.items.length) {
            safeSetHTML(cartList, '<p class="cart-empty-msg">سلة المشتريات فارغة.</p>');
            if (cartTotalPrice) cartTotalPrice.textContent = '0 ﷼';
            return;
        }


        safeSetHTML(cartList, '');

        state.items.forEach(item => {
            const cartItemDiv = document.createElement('div');
            cartItemDiv.classList.add('cart-item');
            cartItemDiv.dataset.itemId = item.id;

            const cartItemHtml = `
                <div class="cart-item-info">
                    <img class="cart-item-image" src="${sanitizeHtmlContent(item.image)}" alt="${sanitizeHtmlContent(item.name)}">
                    <div class="cart-item-details">
                        <div class="cart-item-name">${sanitizeHtmlContent(item.name)}</div>
                        <div class="cart-item-price">${formatPrice(item.price)} </div>
                    </div>
                </div>
                <div class="cart-item-controls">
                    <button class="decrease-btn" data-id="${sanitizeHtmlContent(item.id)}">−</button>
                    <span class="quantity-display">${item.quantity}</span>
                    <button class="increase-btn" data-id="${sanitizeHtmlContent(item.id)}">+</button>
                    <button class="remove-btn" data-id="${sanitizeHtmlContent(item.id)}" title="إزالة">🗑</button>
                </div>
            `;
            safeSetHTML(cartItemDiv, sanitizeHtmlContent(cartItemHtml));

            cartList.appendChild(cartItemDiv);
        });

        // استخدم الـ total من الـ backend
        if (cartTotalPrice) {
            const backendTotal = state.totals?.total || 0;
            cartTotalPrice.textContent = `${formatPrice(backendTotal)} ﷼`;
        }

        // Add event listeners
        cartList.querySelectorAll('.increase-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (!id) return;
                ensureCartStateLoaded()
                    .then(() => updateCartItemQuantity(id, (getCartStateSafe().items.find(i => i.id === id)?.quantity || 0) + 1));
            });
        });

        cartList.querySelectorAll('.decrease-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (!id) return;
                ensureCartStateLoaded()
                    .then(() => updateCartItemQuantity(id, (getCartStateSafe().items.find(i => i.id === id)?.quantity || 0) - 1));
            });
        });

        cartList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = this.dataset.id;
                if (!id) return;
                ensureCartStateLoaded()
                    .then(() => removeCartItem(id));
            });
        });
    }

    // Update header badge with total number of cart items
    function updateCartCount() {
        const cartCount = document.getElementById('cart-count');
        if (cartCount) {
            const state = getCartStateSafe();
            const totalItems = getTotalCartItems(state.items);
            cartCount.textContent = totalItems || '0';
        }
    }

    // Display cart sidebar overlay and prevent body scroll
    function openCart(triggerEvent) {
        const cartPopup = document.getElementById('cart-popup');
        if (!requireAuth(triggerEvent, 'cart.html')) {
            return;
        }
        if (cartPopup) {
            cartPopup.classList.add('is-open');
            document.body.classList.add('cart-locked');
            ensureCartStateLoaded().finally(() => {
                renderCart();
            });
        }
    }

    // Hide cart sidebar overlay and restore body scroll
    function closeCart() {
        const cartPopup = document.getElementById('cart-popup');
        if (cartPopup) {
            cartPopup.classList.remove('is-open');
            document.body.classList.remove('cart-locked');
        }
    }

    // Proxy to global toast helper if available (fallback otherwise)
    function showToast(message) {
        // استخدام الـ toast من script.js 
        if (typeof window.showToast === 'function') {
            window.showToast(message);
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

    function handleCategoryClick(button) {
        const categoryId = button.dataset.category;
        if (categoryId === undefined) return;

        const categorySlug = button.dataset.category;
        const categoryUniqueId = button.dataset.categoryId;

        currentCategory = categorySlug || categoryUniqueId || 'all';
        currentCategoryId = categoryUniqueId || categorySlug || 'all';
        currentSubCategory = 'all';

        document.querySelectorAll('#categoryFilters .filter-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('#categoryFilters .filter-btn.has-subcategory').forEach(btn => btn.classList.remove('expanded'));
        button.classList.add('active');

        const subSections = document.querySelectorAll('#categoryFilters .sub-categories');
        subSections.forEach(section => section.classList.remove('show'));

        const subContainer = button.nextElementSibling;
        if (subContainer && subContainer.classList.contains('sub-categories')) {
            subContainer.classList.add('show');
            subContainer.querySelectorAll('.sub-filter-btn').forEach(btn => btn.classList.remove('active'));
            button.classList.add('expanded');
        }

        const url = new URL(window.location.href);
        const normalizedCategory = normalizeFilterValue(currentCategory);

        if (normalizedCategory === 'all') {
            url.searchParams.delete('category');
            url.searchParams.delete('categoryId');
            url.searchParams.delete('subcategory');
        } else {
            if (categorySlug) {
                url.searchParams.set('category', categorySlug);
            } else {
                url.searchParams.delete('category');
            }

            if (categoryUniqueId) {
                url.searchParams.set('categoryId', categoryUniqueId);
            } else {
                url.searchParams.delete('categoryId');
            }
            url.searchParams.delete('subcategory');
        }
        window.history.replaceState({}, '', url);

        filterProducts();
    }

    function handleSubCategoryClick(button) {
        const subCategoryId = button.dataset.subcategory;
        if (subCategoryId === undefined) return;

        currentSubCategory = subCategoryId;
        document.querySelectorAll('#categoryFilters .sub-filter-btn').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const parentCategoryButton = button.closest('.sub-categories')?.previousElementSibling;
        if (parentCategoryButton && parentCategoryButton.classList.contains('filter-btn')) {
            parentCategoryButton.classList.add('expanded');
        }

        const url = new URL(window.location.href);
        if (currentCategory && normalizeFilterValue(currentCategory) !== 'all') {
            url.searchParams.set('category', currentCategory);
        }
        if (currentCategoryId && normalizeFilterValue(currentCategoryId) !== 'all') {
            url.searchParams.set('categoryId', currentCategoryId);
        } else {
            url.searchParams.delete('categoryId');
        }
        url.searchParams.set('subcategory', subCategoryId);
        window.history.replaceState({}, '', url);

        filterProducts();
    }

    async function loadCategories() {
        if (isFetchingCategories) return;
        isFetchingCategories = true;

        try {
            // ✅ استخدم getJson - تتعامل مع credentials: 'include'
            const payload = await getJson(window.API_CONFIG.getEndpoint('CATEGORIES'));
            const documents = Array.isArray(payload?.data?.documents)
                ? payload.data.documents
                : Array.isArray(payload?.data)
                    ? payload.data
                    : Array.isArray(payload)
                        ? payload
                        : [];

            categoriesFromApi = documents
                .map((category, index) => normalizeCategory(category, index))
                .filter(Boolean);
        } catch (error) {
            categoriesFromApi = [];
        } finally {
            isFetchingCategories = false;
            buildCategoryFilters();
        }
    }

    async function loadProducts(params = {}) {
        if (isFetchingProducts) return;
        isFetchingProducts = true;

        try {
            // ✅ استخدم getJson - تتعامل مع credentials: 'include'
            const payload = await getJson(window.API_CONFIG.getEndpoint('PRODUCTS'));
            const products = Array.isArray(payload?.data?.products)
                ? payload.data.products
                : Array.isArray(payload?.data?.documents)
                    ? payload.data.documents
                    : [];

            allProducts = products.map(product => {
                const normalizedProduct = normalizeProduct(product);
                if (typeof window !== 'undefined' && typeof window.resolveProductImage === 'function') {
                    normalizedProduct.image = window.resolveProductImage(product);
                }
                return normalizedProduct;
            });
            
            productsLoaded = true; // Mark products as successfully loaded
            
            buildCategoryFilters();
            filterProducts();
            allProducts.forEach(product => {
                if (!product || !product.id) return;
                productMetadataCache.set(product.id, {
                    name: product.name,
                    price: product.price,
                    image: product.image
                });
            });
        } catch (error) {
            allProducts = [];
            productsLoaded = true; // Mark as loaded even on error to show empty state
            buildCategoryFilters();
            filterProducts();
        } finally {
            isFetchingProducts = false;
        }
    }

    function normalizeProduct(product, index) {
        const id = product._id || product.id || `product-${index}`;
        const name = product.name || product.title || 'منتج بدون اسم';
        let category = product.category || product.mainCategory || product.main_category || product.mainCategoryId || {};
        let subCategory = product.subCategory || product.subcategory || product.subCategoryId || {};

        if (typeof category === 'string') {
            category = { _id: category, slug: category };
        }
        if (typeof subCategory === 'string') {
            subCategory = { _id: subCategory, slug: subCategory };
        }

        const parsePriceValue = (value) => {
            if (value === undefined || value === null || value === '') return NaN;
            if (typeof value === 'string') {
                return Number(value.replace(/[^\d.]/g, ''));
            }
            return Number(value);
        };

        const rawPrice = product.price?.current ?? product.price?.value ?? product.price?.amount ?? product.price ?? product.currentPrice ?? product.salePrice ?? product.basePrice;
        const numericPrice = parsePriceValue(rawPrice);
        const hasBasePrice = Number.isFinite(numericPrice) && numericPrice > 0;

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
        const numericDiscount = parsePriceValue(discountRaw);
        const hasDiscountPrice = Number.isFinite(numericDiscount) && numericDiscount > 0;

        const basePriceValue = hasBasePrice ? numericPrice : 0;
        const originalPrice = hasBasePrice ? numericPrice : null;
        const discountPrice = hasDiscountPrice && hasBasePrice && numericDiscount < numericPrice ? numericDiscount : null;

        const effectivePrice = Number.isFinite(discountPrice)
            ? discountPrice
            : hasBasePrice
                ? numericPrice
                : (hasDiscountPrice ? numericDiscount : 0);
        const price = Number.isFinite(effectivePrice) && effectivePrice > 0 ? effectivePrice : 0;

        const imageUrl = (typeof window !== 'undefined' && typeof window.resolveProductImage === 'function')
            ? window.resolveProductImage(product)
            : (product.image || FALLBACK_IMAGE);

        const categoryId = category?._id || category?.id || product.categoryId || product.category || 'uncategorized';
        const categorySlug = category?.slug || product.categorySlug || categoryId;
        const categoryName = category?.title || category?.name || product.categoryName || product.categoryLabel || 'فئة غير محددة';

        const subCategoryId = subCategory?._id || subCategory?.id || product.subCategoryId || product.subcategoryId || product.subCategory || 'all';
        const subCategorySlug = subCategory?.slug || product.subCategorySlug || subCategoryId;
        const subCategoryName = subCategory?.title || subCategory?.name || product.subCategoryName || product.subCategoryLabel || '';

        const description = product.shortDescription || product.description || 'اكتشف المزيد عن هذا المنتج عند فتح التفاصيل.';

        const sold = Number(product.sold) || 0;

        return {
            id,
            name,
            description,
            price,
            originalPrice,
            discountPrice,
            image: imageUrl,
            categoryId,
            categorySlug,
            categoryName,
            subCategoryId,
            subCategorySlug,
            subCategoryName,
            brandName: product.brand?.name || '',
            warrantyInfo: product.warrantyInfo || '',
            deliveryInfo: product.deliveryInfo || '',
            sold,
            raw: product
        };
    }

    function buildCategoryFilters() {
        const filtersContainer = document.getElementById('categoryFilters');
        if (!filtersContainer) return;

        const apiCategoryLookup = new Map();
        categoriesFromApi.forEach(category => {
            if (!category) return;
            const key = normalizeFilterValue(category.slug || category.id || category.name);
            if (!key || apiCategoryLookup.has(key)) return;
            apiCategoryLookup.set(key, category);
        });

        const categoriesMap = new Map();

        const ensureCategoryEntry = (slugKey, data = {}) => {
            const normalizedKey = normalizeFilterValue(slugKey || data.slug || data.id || data.name);
            if (!normalizedKey) return null;

            if (!categoriesMap.has(normalizedKey)) {
                const apiCategory = apiCategoryLookup.get(normalizedKey);
                categoriesMap.set(normalizedKey, {
                    id: apiCategory?.id || data.id || data.slug || normalizedKey,
                    slug: apiCategory?.slug || data.slug || data.id || normalizedKey,
                    name: apiCategory?.name || data.name || 'فئة غير محددة',
                    productCount: 0,
                    subCategories: new Map()
                });
            }

            return categoriesMap.get(normalizedKey);
        };

        const ensureSubCategoryEntry = (categoryEntry, slugKey, data = {}) => {
            if (!categoryEntry) return null;
            const normalizedKey = normalizeFilterValue(slugKey || data.slug || data.id || data.name);
            if (!normalizedKey) return null;

            if (!categoryEntry.subCategories.has(normalizedKey)) {
                categoryEntry.subCategories.set(normalizedKey, {
                    id: data.id || data.slug || normalizedKey,
                    slug: data.slug || data.id || normalizedKey,
                    name: data.name || 'قسم فرعي',
                    productCount: 0
                });
            }

            return categoryEntry.subCategories.get(normalizedKey);
        };

        allProducts.forEach(product => {
            const categoryEntry = ensureCategoryEntry(product.categorySlug || product.categoryId, {
                id: product.categoryId,
                slug: product.categorySlug,
                name: product.categoryName
            });
            if (!categoryEntry) return;

            categoryEntry.productCount += 1;

            if (product.subCategorySlug && product.subCategorySlug !== 'all') {
                const subEntry = ensureSubCategoryEntry(categoryEntry, product.subCategorySlug || product.subCategoryId, {
                    id: product.subCategoryId,
                    slug: product.subCategorySlug,
                    name: product.subCategoryName
                });
                if (subEntry) {
                    subEntry.productCount += 1;
                }
            }
        });

        const filteredCategories = new Map();

        categoriesMap.forEach((category, key) => {
            const filteredSubCategories = new Map();
            category.subCategories.forEach((subCategory, subKey) => {
                if (subCategory.productCount > 0) {
                    filteredSubCategories.set(subKey, subCategory);
                }
            });

            if (category.productCount > 0 && filteredSubCategories.size > 0) {
                filteredCategories.set(key, {
                    ...category,
                    subCategories: filteredSubCategories
                });
            }
        });

        categoryHierarchy = filteredCategories;

        const fragment = document.createDocumentFragment();
        const normalizedCurrentCategory = normalizeFilterValue(currentCategory);
        const normalizedCurrentCategoryId = normalizeFilterValue(currentCategoryId);
        const normalizedCurrentSubCategory = normalizeFilterValue(currentSubCategory);

        const allButton = document.createElement('button');
        allButton.className = 'filter-btn';
        allButton.dataset.category = 'all';
        allButton.dataset.categoryId = 'all';
        const allButtonHtml = `
            <span class="filter-label">الكل</span>
            <span class="filter-meta">
                <span class="filter-count">${allProducts.length}</span>
            </span>
        `;
        safeSetHTML(allButton, sanitizeHtmlContent(allButtonHtml));
        fragment.appendChild(allButton);

        let hasActiveCategory = false;
        if (!normalizedCurrentCategory || normalizedCurrentCategory === 'all') {
            allButton.classList.add('active');
            hasActiveCategory = true;
        }

        categoryHierarchy.forEach(category => {
            const categoryButton = document.createElement('button');
            categoryButton.className = 'filter-btn' + (category.subCategories.size ? ' has-subcategory' : '');
            categoryButton.dataset.category = category.slug || category.id;
            categoryButton.dataset.categoryId = category.id || category.slug || '';
            const chevronHtml = category.subCategories.size
                ? '<span class="filter-chevron"><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></span>'
                : '';
            const catButtonHtml = `
                <span class="filter-label">${category.name}</span>
                <span class="filter-meta">
                    <span class="filter-count">${category.productCount}</span>
                    ${chevronHtml}
                </span>
            `;
            safeSetHTML(categoryButton, sanitizeHtmlContent(catButtonHtml));

            const isActiveCategory = [category.slug, category.id, category.name]
                .map(normalizeFilterValue)
                .some(value => value && (value === normalizedCurrentCategory || value === normalizedCurrentCategoryId));
            if (isActiveCategory) {
                categoryButton.classList.add('active');
                hasActiveCategory = true;
            }

            fragment.appendChild(categoryButton);

            if (category.subCategories.size) {
                const subContainer = document.createElement('div');
                subContainer.className = 'sub-categories';

                let hasActiveSub = false;

                category.subCategories.forEach(subCategory => {
                    const subButton = document.createElement('button');
                    subButton.className = 'sub-filter-btn';
                    subButton.dataset.subcategory = subCategory.slug || subCategory.id;
                    const subButtonHtml = `
                        <span class="sub-label">${subCategory.name}</span>
                        <span class="sub-count">${subCategory.productCount}</span>
                    `;
                    safeSetHTML(subButton, sanitizeHtmlContent(subButtonHtml));

                    const isActiveSub = isFilterMatch(subCategory.slug || subCategory.id || subCategory.name, currentSubCategory);
                    if (isActiveCategory && isActiveSub) {
                        subButton.classList.add('active');
                        hasActiveSub = true;
                    }

                    subContainer.appendChild(subButton);
                });

                if (isActiveCategory && hasActiveSub) {
                    subContainer.classList.add('show');
                    categoryButton.classList.add('expanded');
                }

                fragment.appendChild(subContainer);
            }
        });

        if (!hasActiveCategory) {
            allButton.classList.add('active');
        }

        safeSetHTML(filtersContainer, '');
        filtersContainer.appendChild(fragment);

        filterProducts();
    }

    function normalizeCategory(category = {}, index = 0) {
        if (!category || typeof category !== 'object') return null;

        const id = category._id || category.id || category.slug || `category-${index}`;
        const name = category.name || category.title || category.label || `فئة ${index + 1}`;
        const slugSource = category.slug || category.handle || category.permalink || name || id;
        const slug = createCategorySlug(slugSource, id);

        return {
            id,
            name,
            slug,
            description: category.description || ''
        };
    }

    function createCategorySlug(value = '', fallback = '') {
        const base = value || fallback;
        if (!base) {
            return fallback ? String(fallback) : `category-${Date.now()}`;
        }

        const slug = base
            .toString()
            .trim()
            .toLowerCase()
            .replace(/[\s_]+/g, '-')
            .replace(/[^\w\u0600-\u06FF-]+/g, '')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');

        return slug || (fallback ? String(fallback) : `category-${Date.now()}`);
    }

    function formatPrice(value) {
        const number = Number(value);
        if (Number.isNaN(number)) return value;
        return number.toLocaleString('ar-EG');
    }

    function normalizeFilterValue(value) {
        if (value === undefined || value === null) return '';
        return String(value).trim().toLowerCase();
    }

    function matchesFilter(target, ...candidates) {
        const normalizedTarget = normalizeFilterValue(target);
        if (!normalizedTarget || normalizedTarget === 'all') {
            return true;
        }

        return candidates.some(candidate => normalizeFilterValue(candidate) === normalizedTarget);
    }

    function matchesAnyFilter(targets, ...candidates) {
        const targetList = Array.isArray(targets) ? targets : [targets];
        return targetList.some(target => matchesFilter(target, ...candidates));
    }

    function isFilterMatch(candidate, target) {
        const normalizedCandidate = normalizeFilterValue(candidate);
        const normalizedTarget = normalizeFilterValue(target);
        if (!normalizedTarget || normalizedTarget === 'all') {
            return normalizedCandidate === 'all' || normalizedCandidate === '';
        }
        return normalizedCandidate === normalizedTarget;
    }
    
})();