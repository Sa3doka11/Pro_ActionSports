/**
 * ===================================================================
 * order-details.js - صفحة تفاصيل الفاتورة
 * ===================================================================
 * 
 * الوظائف الرئيسية:
 * - استخراج رقم الطلب من URL (مسار أو معامل الاستعلام)
 * - جلب بيانات الفاتورة من API
 * - عرض الفاتورة بناءً على حالة التحميل
 * - معالجة الأخطاء المختلفة
 * - طباعة الفاتورة
 * - عدم التعويض على أي كود موجود
 */

(function() {
    'use strict';

    // ===================================================================
    // CONFIG & CONSTANTS
    // ===================================================================
    
    const API_BASE_URL = 'https://api.actionsports4u.com/api';
    const ORDER_SCAN_ENDPOINT = `${API_BASE_URL}/orders/scan`;
    
    // DOM Elements Cache
    const DOM = {
        preloader: document.getElementById('js-preloader'),
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        successState: document.getElementById('successState'),
        errorMessage: document.getElementById('errorMessage'),
        retryBtn: document.getElementById('retryBtn'),
        
        // Order Info
        orderNumber: document.getElementById('orderNumber'),
        orderDate: document.getElementById('orderDate'),
        paymentMethodHeader: document.getElementById('paymentMethodHeader'),
        
        // Customer Info
        customerName: document.getElementById('customerName'),
        customerEmail: document.getElementById('customerEmail'),
        customerPhone: document.getElementById('customerPhone'),
        
        // Shipping Address
        shippingArea: document.getElementById('shippingArea'),
        shippingStreet: document.getElementById('shippingStreet'),
        shippingPostal: document.getElementById('shippingPostal'),
        
        // Payment
        // (Removed - now displayed in header)
        
        // Products Table
        productsTableBody: document.getElementById('productsTableBody'),
        
        // Summary
        subtotal: document.getElementById('subtotal'),
        shippingCost: document.getElementById('shippingCost'),
        taxValue: document.getElementById('taxValue'),
        grandTotal: document.getElementById('grandTotal'),
    };

    let currentOrderId = null;

    // ===================================================================
    // UTILITY FUNCTIONS
    // ===================================================================

    /**
     * استخراج رقم الطلب من URL
     * يدعم الصيغ التالية:
     * - /order-details/{id}
     * - /order-details?id={id}
     * - /order-details?{id}
     * @returns {string|null} - رقم الطلب أو null
     */
    function extractOrderId() {
        // حاول استخراج من مسار URL: /order-details/{id}
        const pathMatch = window.location.pathname.match(/order-details\/([^/]+)/);
        if (pathMatch && pathMatch[1]) {
            return pathMatch[1];
        }

        // حاول استخراج من معامل الاستعلام: ?id={id}
        const params = new URLSearchParams(window.location.search);
        let id = params.get('id');
        if (id) {
            return id;
        }

        // حاول استخراج من query string مباشرة: ?{id}
        const searchString = window.location.search.replace('?', '').trim();
        if (searchString && searchString.length > 0) {
            return searchString;
        }

        return null;
    }

    /**
     * تنسيق التاريخ بصيغة عربية
     * @param {string} dateString - تاريخ ISO
     * @returns {string} - التاريخ بصيغة عربية
     */
    function formatDate(dateString) {
        try {
            const date = new Date(dateString);
            const options = {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            return date.toLocaleDateString('ar-SA', options);
        } catch (error) {
            return dateString || '-';
        }
    }

    /**
     * تنسيق السعر بصيغة عملة
     * @param {number} amount - المبلغ
     * @returns {string} - المبلغ المنسق
     */
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '-';
        return `${Number(amount).toFixed(2)} ر.س`;
    }



    /**
     * إظهار حالة معينة وإخفاء الأخرى
     * @param {'loading'|'error'|'success'} state - الحالة المراد إظهارها
     */
    function setState(state) {
        DOM.loadingState.hidden = state !== 'loading';
        DOM.errorState.hidden = state !== 'error';
        DOM.successState.hidden = state !== 'success';

        // إخفاء الـ preloader عند انتهاء التحميل
        if (state !== 'loading') {
            DOM.preloader.style.display = 'none';
        }
    }

    /**
     * عرض رسالة الخطأ المناسبة
     * @param {number} statusCode - رمز الخطأ HTTP
     * @param {string} error - رسالة الخطأ
     */
    function showError(statusCode, error = '') {
        let message = 'تعذر تحميل الفاتورة';

        if (statusCode === 404) {
            message = 'الفاتورة غير موجودة';
        } else if (statusCode === 500) {
            message = 'خطأ في السيرفر';
        } else if (statusCode === 429) {
            message = 'عدد الطلبات كثير جداً، يرجى الانتظار';
        } else if (error === 'NetworkError') {
            message = 'خطأ في الاتصال بالإنترنت';
        }

        DOM.errorMessage.textContent = message;
        setState('error');
    }

    // ===================================================================
    // API FUNCTIONS
    // ===================================================================

    /**
     * جلب بيانات الفاتورة من API
     * @param {string} orderId - رقم الطلب
     * @returns {Promise<object>} - بيانات الفاتورة
     */
    async function fetchOrderDetails(orderId) {
        try {
            const url = `${ORDER_SCAN_ENDPOINT}/${encodeURIComponent(orderId)}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw { status: response.status, message: response.statusText };
            }

            const data = await response.json();
            return data;

        } catch (error) {
            // تمييز بين أنواع الأخطاء المختلفة
            if (error instanceof TypeError) {
                throw { status: 'NetworkError', message: 'خطأ في الاتصال' };
            }
            throw error;
        }
    }

    // ===================================================================
    // RENDERING FUNCTIONS
    // ===================================================================

    /**
     * عرض بيانات الفاتورة على الصفحة
     * @param {object} orderData - بيانات الفاتورة من API
     */
    function renderInvoice(orderData) {
        // إذا كانت البيانات ضمن كائن data، استخرجها
        const data = orderData.data || orderData;

        // معلومات الطلب الأساسية
        DOM.orderNumber.textContent = data._id || data.id || '-';
        DOM.orderDate.textContent = formatDate(data.createdAt);

        // بيانات العميل من userId
        const user = data.userId || {};
        DOM.customerName.textContent = user.name || '-';
        DOM.customerEmail.textContent = user.email || '-';
        DOM.customerPhone.textContent = user.phone || '-';

        // عنوان التوصيل
        const shipping = data.shippingAddress || {};
        DOM.shippingStreet.textContent = shipping.details || '-';
        DOM.shippingArea.textContent = shipping.city?.nameAr || '-';
        DOM.shippingPostal.textContent = shipping.postalCode || '-';

        // معلومات الدفع
        DOM.paymentMethodHeader.textContent = mapPaymentMethod(data.paymentMethod);

        // المبالغ المالية
        DOM.subtotal.textContent = formatCurrency(data.subTotalPrice);
        DOM.shippingCost.textContent = formatCurrency(data.shippingPrice);
        // لا يوجد ضريبة، نعرض هنا إجمالي سعر التركيب بدلاً منها
        DOM.taxValue.textContent = formatCurrency(data.totalInstallationPrice || 0);
        DOM.grandTotal.textContent = formatCurrency(data.totalOrderPrice);

        // المنتجات
        renderProducts(data.cartItems || []);

        // إظهار الفاتورة
        setState('success');
    }

    /**
     * تحويل طريقة الدفع إلى نص عربي
     * @param {string} method - طريقة الدفع
     * @returns {string} - النص العربي
     */
    function mapPaymentMethod(method) {
        const paymentMap = {
            'cash': 'دفع عند الاستلام',
            'credit_card': 'بطاقة ائتمان',
            'debit_card': 'بطاقة خصم',
            'bank_transfer': 'تحويل بنكي',
            'digital_wallet': 'محفظة رقمية',
            'paytabs': 'PayTabs',
            'tamara': 'تمارة',
            'tabby': 'تابي',
            'invoice': 'فاتورة'
        };
        return paymentMap[method?.toLowerCase()] || method || '-';
    }

    /**
     * عرض قائمة المنتجات في الجدول
     * @param {array} items - قائمة المنتجات
     */
    function renderProducts(items) {
        DOM.productsTableBody.innerHTML = '';

        if (!items || items.length === 0) {
            DOM.productsTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-message">لا توجد منتجات</td>
                </tr>
            `;
            return;
        }

        items.forEach(item => {
            const row = document.createElement('tr');
            const productName = item.productId?.name || item.name || '-';
            const quantity = item.qty || 1;
            const unitPrice = item.unitPrice || 0;
            const installationPrice = item.installationPrice || 0;
            
            const price = formatCurrency(unitPrice);
            const installPrice = formatCurrency(installationPrice);
            const itemTotal = formatCurrency((unitPrice * quantity) + installationPrice);

            row.innerHTML = `
                <td class="col-name">${productName}</td>
                <td class="col-quantity">${quantity}</td>
                <td class="col-price">${price}</td>
                <td class="col-installation">${installPrice}</td>
                <td class="col-total">${itemTotal}</td>
            `;
            DOM.productsTableBody.appendChild(row);
        });
    }

    // ===================================================================
    // EVENT HANDLERS
    // ===================================================================

    /**
     * معالج زر إعادة المحاولة
     */
    function handleRetry() {
        if (currentOrderId) {
            loadOrderDetails(currentOrderId);
        }
    }

    // ===================================================================
    // MAIN LOGIC
    // ===================================================================

    /**
     * تحميل وعرض تفاصيل الطلب
     * @param {string} orderId - رقم الطلب
     */
    async function loadOrderDetails(orderId) {
        setState('loading');

        try {
            const orderData = await fetchOrderDetails(orderId);
            renderInvoice(orderData);
        } catch (error) {
            const statusCode = error.status || 500;
            showError(statusCode, error.message);
        }
    }

    /**
     * بدء تطبيق الفاتورة
     */
    function init() {
        // استخراج رقم الطلب
        currentOrderId = extractOrderId();

        // التحقق من وجود رقم الطلب
        if (!currentOrderId) {
            showError(404);
            DOM.errorMessage.textContent = 'لم يتم العثور على رقم الطلب في الرابط';
            return;
        }

        // إضافة مستمعي الأحداث
        DOM.retryBtn.addEventListener('click', handleRetry);

        // تحميل بيانات الطلب
        loadOrderDetails(currentOrderId);
    }

    // ===================================================================
    // INITIALIZATION
    // ===================================================================

    // تشغيل التطبيق عند انتهاء تحميل DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
