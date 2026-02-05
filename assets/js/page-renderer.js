(function () {
    "use strict";

    // ===================================================================
    // XSS PROTECTION: Sanitization Functions
    // ===================================================================

    /**
     * DOMPurify integration - sanitizes HTML to prevent XSS attacks
     * Matches the pattern used in script.js, products.js, profile.js
     */
    function sanitizeHtmlContent(html) {
        if (typeof html !== 'string') return '';

        if (typeof window !== 'undefined' && typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(html, {
                ALLOWED_TAGS: ['div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'br', 'strong', 'em', 'i', 'u', 'b', 'ul', 'ol', 'li', 'a', 'img', 'table', 'tbody', 'thead', 'tfoot', 'tr', 'td', 'th', 'caption', 'form', 'button', 'input', 'textarea', 'select', 'option', 'label', 'fieldset', 'legend', 'video', 'source', 'audio', 'picture', 'figure', 'figcaption', 'section', 'article', 'nav', 'footer', 'header'],
                ALLOWED_ATTR: ['style', 'class', 'id', 'role', 'data-*', 'href', 'src', 'alt', 'title', 'type', 'name', 'value', 'checked', 'disabled', 'selected', 'action', 'method', 'enctype', 'controls', 'aria-*', 'target', 'rel', 'datetime', 'width', 'height', 'loading', 'poster', 'placeholder', 'required', 'maxlength', 'minlength', 'pattern']
            });
        }

        // SECURITY: If DOMPurify is not available, return empty string
        console.warn('[Security] DOMPurify is not loaded. Content not rendered for security.');
        return '';
    }

    /**
     * Safe way to set innerHTML with sanitization
     */
    function safeSetHTML(element, html) {
        if (!element || typeof element.innerHTML === 'undefined') return;
        element.innerHTML = sanitizeHtmlContent(html);
    }

    /**
     * Escape text for safe insertion (prevents HTML injection in text nodes)
     */
    function escapeText(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===================================================================
    // PAGE RENDERER LOGIC
    // ===================================================================

    // 1. Get URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const pageType = urlParams.get('type');

    // 2. Elements
    const headerTitle = document.getElementById('page-title-text');
    const headerHighlight = document.getElementById('page-title-highlight');
    const subtitle = document.getElementById('page-subtitle');
    const container = document.getElementById('dynamic-content-container');

    // 3. Find Data
    const data = typeof staticPagesData !== 'undefined' ? staticPagesData[pageType] : null;

    // 4. Function to render "Not Found"
    function renderNotFound() {
        document.title = "الصفحة غير موجودة | Action Sports";
        if (headerTitle) headerTitle.textContent = "الصفحة غير";
        if (headerHighlight) headerHighlight.textContent = "موجودة";
        if (subtitle) subtitle.textContent = "عذراً، الرابط الذي تحاول الوصول إليه غير صحيح.";

        // SECURITY FIX: Use safeSetHTML for static content
        const notFoundHtml = `
            <div class="static-content-box" style="text-align: center; padding: 60px 20px;">
                <i class="fa fa-exclamation-triangle" style="font-size: 60px; color: #e74c3c; margin-bottom: 20px;"></i>
                <h3>404</h3>
                <p>يبدو أنك ضللت الطريق.</p>
                <a href="index.html" class="main-button" style="margin-top: 20px; display: inline-block;">العودة للرئيسية</a>
            </div>
        `;
        safeSetHTML(container, notFoundHtml);
    }

    // 5. Function to render FAQ (Accordion)
    // SECURITY FIX: Sanitize FAQ question and answer content
    function renderFaq(faqs) {
        if (!Array.isArray(faqs)) return '';

        let html = '<div class="faq-container static-content-box">';
        faqs.forEach((item, index) => {
            // SECURITY: Escape user-controlled content
            const safeQuestion = escapeText(item.q || '');
            const safeAnswer = escapeText(item.a || '');

            html += `
                <div class="faq-item">
                    <button class="faq-question" data-faq-index="${index}">
                        ${safeQuestion}
                        <span class="faq-icon"><i class="fa fa-chevron-down"></i></span>
                    </button>
                    <div class="faq-answer">
                        <p>${safeAnswer}</p>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }

    // 6. Bind FAQ toggle events after rendering
    // SECURITY FIX: Replace inline onclick with addEventListener
    function bindFaqEvents() {
        const faqButtons = document.querySelectorAll('.faq-question');
        faqButtons.forEach(button => {
            button.addEventListener('click', function () {
                window.toggleFaq(this);
            });
        });
    }

    // 7. Main Render Logic
    if (!data) {
        renderNotFound();
    } else {
        // Update Page Title & SEO (using textContent - safe)
        document.title = `${data.title || ''} ${data.highlight || ''} | Action Sports`;

        // Update Header (using textContent - safe, no HTML parsing)
        if (headerTitle) headerTitle.textContent = data.title || '';
        if (headerHighlight) headerHighlight.textContent = data.highlight || '';
        if (subtitle) subtitle.textContent = data.subtitle || '';

        // Update Content Body
        if (data.type === 'rich' || data.type === 'text') {
            // SECURITY FIX: Sanitize rich content before insertion
            const richContentHtml = `<div class="static-content-box policy-content">${data.content || ''}</div>`;
            safeSetHTML(container, richContentHtml);
        } else if (data.type === 'faq') {
            // SECURITY FIX: FAQ content is now sanitized in renderFaq
            safeSetHTML(container, renderFaq(data.content));
            // Bind click events after DOM is updated
            bindFaqEvents();
        } else if (data.type === 'track-form') {
            // For Tracking - renderTrackForm should also be sanitized
            if (typeof renderTrackForm === 'function') {
                safeSetHTML(container, renderTrackForm());
            }
        }

        // Update Active Nav Link
        document.querySelectorAll('.nav a').forEach(link => {
            link.classList.remove('active');
            if (link.href.includes(`type=${pageType}`)) {
                link.classList.add('active');
            }
        });
    }

    // Helper: Toggle FAQ
    window.toggleFaq = function (button) {
        const answer = button.nextElementSibling;
        const icon = button.querySelector('.faq-icon i');

        if (!answer || !icon) return;

        button.classList.toggle('active');

        if (answer.style.maxHeight) {
            answer.style.maxHeight = null;
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            answer.style.maxHeight = answer.scrollHeight + "px";
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    };

    // Helper: Handle Track Order (Simulation)
    window.handleTrackOrder = function (e) {
        e.preventDefault();
        const resultDiv = document.getElementById('trackResult');
        const btn = e.target.querySelector('button');

        if (!btn || !resultDiv) return;

        // SECURITY FIX: Use safeSetHTML for button content
        safeSetHTML(btn, '<i class="fa fa-spinner fa-spin"></i> جاري البحث...');
        btn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            // SECURITY FIX: Use safeSetHTML for button reset
            safeSetHTML(btn, 'تتبع الآن');
            btn.disabled = false;
            resultDiv.style.display = 'block';

            // Fake Logic for demo
            const randomStatus = Math.random() > 0.5;
            if (randomStatus) {
                resultDiv.className = 'success-msg';
                resultDiv.style.backgroundColor = '#d4edda';
                resultDiv.style.color = '#155724';
                // SECURITY FIX: Use safeSetHTML
                safeSetHTML(resultDiv, '<strong>حالة الطلب:</strong> قيد التوصيل 🚚<br>الموقع الحالي: الرياض - حي العليا.');
            } else {
                resultDiv.className = 'error-msg';
                resultDiv.style.backgroundColor = '#f8d7da';
                resultDiv.style.color = '#721c24';
                // SECURITY FIX: Use safeSetHTML
                safeSetHTML(resultDiv, 'لم يتم العثور على طلب بهذا الرقم، يرجى التأكد من البيانات.');
            }
        }, 1500);
    };

})();
