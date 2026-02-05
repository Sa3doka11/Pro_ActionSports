/**
 * ===================================================================
 * config.js - المركز الموحد لإدارة جميع نقاط نهاية الـ API
 * ===================================================================
 * 
 * يحتوي على:
 * - تعريف مركزي للـ API_BASE_URL
 * - تعريف جميع ENDPOINTS المستخدمة
 * - استخدام Module Pattern (IIFE) لتجنب تلوث النطاق العام
 * - واجهة عامة عبر window.API_CONFIG
 */

(function () {
    'use strict';

    // ===================================================================
    // تعريف الـ Base URL الأساسي
    // ===================================================================
    const API_BASE_URL = 'https://api.actionsports4u.com/api';

    // ===================================================================
    // تعريف جميع نقاط النهاية (Endpoints)
    // ===================================================================
    const ENDPOINTS = {
        // Base URL للرجوع إليه عند الحاجة
        API_BASE_URL: API_BASE_URL,

        // ========== منتجات وفئات ==========
        PRODUCTS: `${API_BASE_URL}/products`,
        PRODUCT_BY_ID: (id) => `${API_BASE_URL}/products/${encodeURIComponent(id)}`,
        CATEGORIES: `${API_BASE_URL}/categories`,

        // ========== نموذج التواصل ==========
        CONTACT_FORM: `${API_BASE_URL}/messages`,

        // ========== السلة ==========
        CART_ITEMS: `${API_BASE_URL}/cart/items`,
        CART_BASE: `${API_BASE_URL}/cart`,
        CART_ADD: `${API_BASE_URL}/cart`,
        CART_LIST: `${API_BASE_URL}/cart`,
        CART_CLEAR: `${API_BASE_URL}/cart/clear`,

        // ========== المصادقة والتحقق ==========
        AUTH_LOGIN: `${API_BASE_URL}/auth/sign-in`,
        AUTH_SIGNUP: `${API_BASE_URL}/auth/sign-up`,
        AUTH_FORGOT_PASSWORD: `${API_BASE_URL}/auth/forgot-password`,
        AUTH_VERIFY_RESET_CODE: `${API_BASE_URL}/auth/verify-reset-code`,
        AUTH_RESET_PASSWORD: `${API_BASE_URL}/auth/reset-password`,
        AUTH_VERIFY_ACCOUNT: `${API_BASE_URL}/auth/verify-account`,
        AUTH_RESEND_VERIFICATION: `${API_BASE_URL}/auth/resend-verification-code`,
        AUTH_TOKEN_REFRESH: `${API_BASE_URL}/auth/token/refresh`,
        AUTH_LOGOUT: `${API_BASE_URL}/auth/log-out`,

        // ========== حساب المستخدم ==========
        USER_ME: `${API_BASE_URL}/users/me`,
        USER_CHANGE_PASSWORD: `${API_BASE_URL}/users/me/change-password`,
        USER_UPDATE_ACCOUNT: `${API_BASE_URL}/users/me/update-account`,
        USER_DEACTIVATE: `${API_BASE_URL}/users/me/deactivate-account`,
        USER_ADDRESSES: `${API_BASE_URL}/users/me/addresses`,

        // ========== الطلبات ==========
        ORDERS_CREATE: `${API_BASE_URL}/orders`,
        ORDERS_LIST: `${API_BASE_URL}/orders`,
        ORDERS_MY: `${API_BASE_URL}/orders/me`,
        ORDERS_PAY_PAYTABS: `${API_BASE_URL}/orders/pay-with-paytabs`,
        ORDERS_PAY_TAMARA: `${API_BASE_URL}/orders/pay-with-tamara`,
        ORDERS_PAY_TABBY: `${API_BASE_URL}/orders/pay-with-tabby`,

        // ========== الشحن والمناطق ==========
        SHIPPING_ZONES: `${API_BASE_URL}/shipping-zones`,

        // ========== الإعلانات والبانرات ==========
        BANNERS_PUBLIC: `${API_BASE_URL}/public/banners`,
        BANNERS_LIST: `${API_BASE_URL}/banners`,

        // ========== إعدادات الدفع ==========
        PAYMENT_SETTINGS: `${API_BASE_URL}/payment-settings`
    };

    // ===================================================================
    // كائن الواجهة العامة - يتم تصديره إلى window
    // ===================================================================
    const API_CONFIG = {
        /**
         * الحصول على عنوان Endpoint معين بناءً على المفتاح
         * @param {string} key - مفتاح الـ Endpoint (مثل: PRODUCTS, CATEGORIES)
         * @returns {string|null} - العنوان الكامل أو null إذا لم يوجد
         */
        getEndpoint: function(key) {
            return ENDPOINTS[key] || null;
        },

        /**
         * الحصول على الـ Base URL
         * @returns {string} - عنوان الـ API الأساسي
         */
        getBaseUrl: function() {
            return API_BASE_URL;
        },

        /**
         * بناء عنوان Endpoint ديناميكي باستخدام المعرّفات
         * مثال: buildEndpoint('USER_ADDRESSES', { id: '123' }) => .../users/me/addresses/123
         * @param {string} baseKey - مفتاح الـ Endpoint الأساسي
         * @param {object} params - معاملات إضافية (مثل: id, itemId)
         * @returns {string|null} - العنوان المكتمل
         */
        buildEndpoint: function(baseKey, params = {}) {
            const baseEndpoint = this.getEndpoint(baseKey);
            if (!baseEndpoint || typeof baseEndpoint !== 'string') {
                return null;
            }

            let endpoint = baseEndpoint;

            // معالجة معاملات شائعة
            if (params.id) {
                endpoint = `${endpoint}/${encodeURIComponent(params.id)}`;
            }
            if (params.itemId) {
                endpoint = `${endpoint}/${encodeURIComponent(params.itemId)}`;
            }
            if (params.cartId) {
                endpoint = `${endpoint}/${encodeURIComponent(params.cartId)}`;
            }

            return endpoint;
        }
    };

    // ===================================================================
    // تصدير الواجهة إلى النطاق العام (window)
    // ===================================================================
    if (typeof window !== 'undefined') {
        window.API_CONFIG = API_CONFIG;
    }
})();
