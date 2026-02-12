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
    const QR_CODE_API = 'https://api.qrserver.com/v1/create-qr-code/';
    
    // DOM Elements Cache
    const DOM = {
        preloader: document.getElementById('js-preloader'),
        loadingState: document.getElementById('loadingState'),
        errorState: document.getElementById('errorState'),
        successState: document.getElementById('successState'),
        errorMessage: document.getElementById('errorMessage'),
        retryBtn: document.getElementById('retryBtn'),
        printBtn: document.getElementById('print-btn'),
        
        // Order Info
        orderNumber: document.getElementById('orderNumber'),
        orderDate: document.getElementById('orderDate'),
        
        // Customer Info
        customerName: document.getElementById('customerName'),
        customerPhone: document.getElementById('customerPhone'),
        
        // Shipping Address
        shippingArea: document.getElementById('shippingArea'),
        shippingStreet: document.getElementById('shippingStreet'),
        shippingBuilding: document.getElementById('shippingBuilding'),
        shippingCity: document.getElementById('shippingCity'),
        shippingCountry: document.getElementById('shippingCountry'),
        
        // Payment Info
        paymentMethod: document.getElementById('paymentMethod'),
        paymentStatus: document.getElementById('paymentStatus'),
        
        // Delivery Status
        deliveryStatus: document.getElementById('deliveryStatus'),
        
        // Summary
        subtotal: document.getElementById('subtotal'),
        shippingCost: document.getElementById('shippingCost'),
        taxValue: document.getElementById('taxValue'),
        grandTotal: document.getElementById('grandTotal'),
        
        // Products Table
        productsTableBody: document.getElementById('productsTableBody'),
        qrCodeImg: document.getElementById('qrCodeImg')
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
        const id = params.get('id');
        if (id) {
            return id;
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
     * إنشء رابط QR Code
     * @param {string} url - الرابط المراد تحويله لـ QR
     * @returns {string} - رابط صورة QR Code
     */
    function generateQRCodeUrl(url) {
        return `${QR_CODE_API}?size=200x200&data=${encodeURIComponent(url)}`;
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

    /**
     * معالجة بيانات التوصيل
     * @param {object} address - بيانات العنوان من API
     * @returns {object} - بيانات منسقة
     */
    function processShippingAddress(address) {
        if (!address) {
            return {
                area: '-',
                street: '-',
                building: '-',
                city: '-',
                country: '-'
            };
        }

        return {
            area: address.area || address.district || '-',
            street: address.street || '-',
            building: address.buildingNumber || address.building || '-',
            city: address.city || '-',
            country: address.country || '-'
        };
    }

    /**
     * معالجة حالة الطلب وتحويلها للعربية
     * @param {string} status - حالة الطلب
     * @returns {string} - الحالة بالعربية
     */
    function getDeliveryStatusArabic(status) {
        const statusMap = {
            'pending': 'قيد المراجعة',
            'confirmed': 'تم تأكيد الطلب',
            'processing': 'تحت المعالجة',
            'shipped': 'تم الشحن',
            'delivered': 'تم التسليم',
            'cancelled': 'تم الإلغاء',
            'returned': 'تم الإرجاع',
            'waiting_for_payment': 'بانتظار الدفع'
        };
        return statusMap[status?.toLowerCase()] || status || '-';
    }

    /**
     * معالجة طريقة الدفع وتحويلها للعربية
     * @param {string} method - طريقة الدفع
     * @returns {string} - طريقة الدفع بالعربية
     */
    function getPaymentMethodArabic(method) {
        const methodMap = {
            'credit_card': 'بطاقة ائتمان',
            'debit_card': 'بطاقة خصم',
            'cash': 'الدفع عند الاستلام',
            'bank_transfer': 'تحويل بنكي',
            'digital_wallet': 'محفظة رقمية',
            'paytabs': 'PayTabs',
            'tamara': 'تمارا',
            'tabby': 'Tabby',
            'invoice': 'على الحساب'
        };
        return methodMap[method?.toLowerCase()] || method || '-';
    }

    /**
     * منسق حالة الدفع
     * @param {boolean} isPaid - هل تم الدفع
     * @returns {string} - حالة الدفع المنسقة
     */
    function getPaymentStatusDisplay(isPaid) {
        return isPaid ? '✓ تم الدفع' : '⚠ قيد الانتظار';
    }

    /**
     * إضافة أيقونة لحالة الدفع
     * @param {boolean} isPaid - هل تم الدفع
     * @returns {string} - CSS class لإضافة أيقونة
     */
    function getPaymentStatusClass(isPaid) {
        return isPaid ? 'paid' : 'pending';
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

        // بيانات العميل
        const customer = data.shippingAddress || {};
        DOM.customerName.textContent = customer.customerName || data.customerName || '-';
        DOM.customerPhone.textContent = customer.phone || data.phone || '-';

        // عنوان التوصيل
        const shippingAddress = processShippingAddress(customer);
        DOM.shippingArea.textContent = shippingAddress.area;
        DOM.shippingStreet.textContent = shippingAddress.street;
        DOM.shippingBuilding.textContent = shippingAddress.building;
        DOM.shippingCity.textContent = shippingAddress.city;
        DOM.shippingCountry.textContent = shippingAddress.country;

        // معلومات الدفع
        DOM.paymentMethod.textContent = getPaymentMethodArabic(data.paymentMethod);
        const paymentStatusText = getPaymentStatusDisplay(data.isPaid);
        const paymentStatusClass = getPaymentStatusClass(data.isPaid);
        DOM.paymentStatus.textContent = paymentStatusText;
        DOM.paymentStatus.className = `info-value payment-status ${paymentStatusClass}`;

        // حالة الطلب
        DOM.deliveryStatus.textContent = getDeliveryStatusArabic(data.deliveryStatus);

        // المبالغ المالية
        DOM.subtotal.textContent = formatCurrency(data.subTotalPrice);
        DOM.shippingCost.textContent = formatCurrency(data.shippingPrice);
        DOM.taxValue.textContent = formatCurrency(data.taxPrice || 0);
        DOM.grandTotal.textContent = formatCurrency(data.totalOrderPrice);

        // المنتجات
        renderProducts(data.cartItems || []);

        // QR Code
        const currentUrl = window.location.href;
        DOM.qrCodeImg.src = generateQRCodeUrl(currentUrl);
        DOM.qrCodeImg.alt = `رمز الفاتورة ${data._id || data.id}`;

        // إظهار الفاتورة
        setState('success');
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
            const price = formatCurrency(item.priceAtPurchase || item.price || 0);
            const installationPrice = formatCurrency(item.installationPrice || 0);
            const quantity = item.quantity || 1;
            const totalPrice = formatCurrency((item.priceAtPurchase || item.price || 0) * quantity + (item.installationPrice || 0));

            row.innerHTML = `
                <td class="col-name">${item.productName || item.name || '-'}</td>
                <td class="col-quantity">${quantity}</td>
                <td class="col-price">${price}</td>
                <td class="col-installation">${installationPrice}</td>
                <td class="col-total">${totalPrice}</td>
            `;
            DOM.productsTableBody.appendChild(row);
        });
    }

    // ===================================================================
    // EVENT HANDLERS
    // ===================================================================

    /**
     * معالج زر الطباعة
     */
    function handlePrint() {
        // الانتظار قليلاً للتأكد من تحميل جميع الموارد
        setTimeout(() => {
            window.print();
        }, 100);
    }

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
        DOM.printBtn.addEventListener('click', handlePrint);
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
