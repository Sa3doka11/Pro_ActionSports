(function() {
    "use strict";

    // 1. Get URL Params
    const urlParams = new URLSearchParams(window.location.search);
    const pageType = urlParams.get('type');

    // 2. Elements
    const headerTitle = document.getElementById('page-title-text');
    const headerHighlight = document.getElementById('page-title-highlight');
    const subtitle = document.getElementById('page-subtitle');
    const container = document.getElementById('dynamic-content-container');

    // 3. Find Data
    const data = staticPagesData[pageType];

    // 4. Function to render "Not Found"
    function renderNotFound() {
        document.title = "الصفحة غير موجودة | Action Sports";
        headerTitle.textContent = "الصفحة غير";
        headerHighlight.textContent = "موجودة";
        subtitle.textContent = "عذراً، الرابط الذي تحاول الوصول إليه غير صحيح.";
        container.innerHTML = `
            <div class="static-content-box" style="text-align: center; padding: 60px 20px;">
                <i class="fa fa-exclamation-triangle" style="font-size: 60px; color: #e74c3c; margin-bottom: 20px;"></i>
                <h3>404</h3>
                <p>يبدو أنك ضللت الطريق.</p>
                <a href="index.html" class="main-button" style="margin-top: 20px; display: inline-block;">العودة للرئيسية</a>
            </div>
        `;
    }

    // 5. Function to render FAQ (Accordion)
    function renderFaq(faqs) {
        let html = '<div class="faq-container static-content-box">';
        faqs.forEach((item, index) => {
            html += `
                <div class="faq-item">
                    <button class="faq-question" onclick="toggleFaq(this)">
                        ${item.q}
                        <span class="faq-icon"><i class="fa fa-chevron-down"></i></span>
                    </button>
                    <div class="faq-answer">
                        <p>${item.a}</p>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        return html;
    }



    // 6. Main Render Logic
    if (!data) {
        renderNotFound();
    } else {
        // Update Page Title & SEO
        document.title = `${data.title} ${data.highlight} | Action Sports`;

        // Update Header
        headerTitle.textContent = data.title;
        headerHighlight.textContent = data.highlight;
        subtitle.textContent = data.subtitle;

        // Update Content Body
        if (data.type === 'rich' || data.type === 'text') {
            // For About, Privacy, Terms, etc.
            container.innerHTML = `<div class="static-content-box policy-content">${data.content}</div>`;
        } else if (data.type === 'faq') {
            // For FAQ
            container.innerHTML = renderFaq(data.content);
        } else if (data.type === 'track-form') {
            // For Tracking
            container.innerHTML = renderTrackForm();
        }

        // Update Active Nav Link
        document.querySelectorAll('.nav a').forEach(link => {
            link.classList.remove('active');
            if(link.href.includes(`type=${pageType}`)) {
                link.classList.add('active');
            }
        });
    }

    // Helper: Toggle FAQ
    window.toggleFaq = function(button) {
        const answer = button.nextElementSibling;
        const icon = button.querySelector('.faq-icon i');

        // Close others (optional, remove if you want multiple open)
        /*
        document.querySelectorAll('.faq-answer').forEach(div => {
            if (div !== answer) {
                div.style.maxHeight = null;
                div.previousElementSibling.classList.remove('active');
            }
        });
        */

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
    window.handleTrackOrder = function(e) {
        e.preventDefault();
        const resultDiv = document.getElementById('trackResult');
        const btn = e.target.querySelector('button');

        btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> جاري البحث...';
        btn.disabled = true;

        // Simulate API call
        setTimeout(() => {
            btn.innerHTML = 'تتبع الآن';
            btn.disabled = false;
            resultDiv.style.display = 'block';

            // Fake Logic for demo
            const randomStatus = Math.random() > 0.5;
            if (randomStatus) {
                resultDiv.className = 'success-msg';
                resultDiv.style.backgroundColor = '#d4edda';
                resultDiv.style.color = '#155724';
                resultDiv.innerHTML = '<strong>حالة الطلب:</strong> قيد التوصيل 🚚<br>الموقع الحالي: الرياض - حي العليا.';
            } else {
                resultDiv.className = 'error-msg';
                resultDiv.style.backgroundColor = '#f8d7da';
                resultDiv.style.color = '#721c24';
                resultDiv.innerHTML = 'لم يتم العثور على طلب بهذا الرقم، يرجى التأكد من البيانات.';
            }
        }, 1500);
    };

})();