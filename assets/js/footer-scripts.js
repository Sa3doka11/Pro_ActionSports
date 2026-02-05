// ===================================================================
// FOOTER JAVASCRIPT - وظائف اختيارية لتحسين تجربة المستخدم
// ===================================================================

// 1. دالة لإضافة تأثير Smooth Scroll للروابط الداخلية
function initSmoothScroll() {
  const footerLinks = document.querySelectorAll('.footer-column a[href^="#"]');

  footerLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      const targetElement = document.querySelector(targetId);

      if (targetElement) {
        targetElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
}

// 2. دالة لتتبع نقرات الروابط (Google Analytics مثلاً)
function trackFooterClicks() {
  const footerLinks = document.querySelectorAll('.footer-column a, .social-link, .footer-links a');

  footerLinks.forEach(link => {
    link.addEventListener('click', function() {
      const linkText = this.textContent || this.getAttribute('aria-label') || 'Unknown';
      const linkHref = this.getAttribute('href') || '#';

      // مثال على Google Analytics (إذا كان متاح)
      // if (typeof gtag !== 'undefined') {
      //   gtag('event', 'footer_link_click', {
      //     'link_text': linkText,
      //     'link_url': linkHref
      //   });
      // }
    });
  });
}

// 3. دالة لإضافة تأثير Lazy Loading للصور
function initLazyLoadFooter() {
  const qrImage = document.querySelector('.qr-image');

  if (qrImage && 'IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          // إذا كانت الصورة تستخدم data-src
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        }
      });
    });

    imageObserver.observe(qrImage);
  }
}

// 4. دالة لإضافة تأثير النسخ عند الضغط على معلومات الاتصال
function initCopyContact() {
  const contactItems = document.querySelectorAll('.contact-item a');

  contactItems.forEach(item => {
    // إضافة أيقونة النسخ
    const copyIcon = document.createElement('span');
    copyIcon.innerHTML = '📋';
    copyIcon.style.cssText = 'margin-right: 8px; cursor: pointer; opacity: 0.6; transition: opacity 0.3s;';
    copyIcon.title = 'نسخ';

    copyIcon.addEventListener('mouseenter', () => {
      copyIcon.style.opacity = '1';
    });

    copyIcon.addEventListener('mouseleave', () => {
      copyIcon.style.opacity = '0.6';
    });

    copyIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const textToCopy = item.textContent.trim();

      // نسخ النص إلى الحافظة
      navigator.clipboard.writeText(textToCopy).then(() => {
        // إظهار رسالة نجاح
        showCopyNotification('تم النسخ بنجاح! ✓');
        copyIcon.innerHTML = '✓';

        setTimeout(() => {
          copyIcon.innerHTML = '📋';
        }, 2000);
      }).catch(() => {
        showCopyNotification('فشل النسخ!');
      });
    });

    item.parentElement.insertBefore(copyIcon, item);
  });
}

// 5. دالة لإظهار إشعار النسخ
function showCopyNotification(message) {
  // إزالة أي إشعار موجود
  const existingNotification = document.querySelector('.copy-notification');
  if (existingNotification) {
    existingNotification.remove();
  }

  const notification = document.createElement('div');
  notification.className = 'copy-notification';
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    bottom: 30px;
    right: 50%;
    transform: translateX(50%);
    background: var(--primary-color);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10002;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    animation: slideUp 0.3s ease-out;
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'slideDown 0.3s ease-out';
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 2000);
}

// 6. دالة لإضافة تأثير Parallax بسيط
function initFooterParallax() {
  const footer = document.querySelector('.site-footer');

  if (footer && window.innerWidth > 768) {
    window.addEventListener('scroll', () => {
      const scrolled = window.pageYOffset;
      const footerTop = footer.offsetTop;
      const windowHeight = window.innerHeight;

      if (scrolled + windowHeight > footerTop) {
        const offset = (scrolled + windowHeight - footerTop) * 0.1;
        footer.style.transform = `translateY(-${offset}px)`;
      }
    });
  }
}

// 7. دالة لإضافة عداد زوار (مثال)
function updateVisitorCount() {
  // هذا مثال بسيط - في الواقع ستحتاج API backend
  const countElement = document.querySelector('.visitor-count');

  if (countElement) {
    // محاكاة عداد
    let count = parseInt(localStorage.getItem('visitorCount') || '1000');
    count += Math.floor(Math.random() * 10) + 1;
    localStorage.setItem('visitorCount', count.toString());
    countElement.textContent = count.toLocaleString('ar-EG');
  }
}

// 8. تهيئة جميع الوظائف عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  // تفعيل Smooth Scroll
  initSmoothScroll();

  // تفعيل تتبع النقرات
  trackFooterClicks();

  // تفعيل Lazy Loading
  initLazyLoadFooter();

  // تفعيل خاصية النسخ (اختياري)
  // initCopyContact();

  // تفعيل Parallax (اختياري)
  // initFooterParallax();

  // تحديث عداد الزوار (اختياري)
  // updateVisitorCount();

  // Placeholder for analytics tracking if needed in future
});

// CSS Animation للإشعارات
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @keyframes slideDown {
    from {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    to {
      opacity: 0;
      transform: translate(-50%, 20px);
    }
  }
`;
document.head.appendChild(style);

// copy mail
// دالة نسخ شاملة لأي عنصر في الصفحة
function copyContent(textId, buttonId) {
    // 1. نجيب العنصر اللي فيه النص
    const textElement = document.getElementById(textId);
    // 2. نجيب الزرار اللي اتداس عليه
    const btnElement = document.getElementById(buttonId);

    // لو مفيش عنصر بالاسم ده، نوقف الدالة (حماية)
    if (!textElement || !btnElement) return;

    const textToCopy = textElement.innerText;

    // 3. عملية النسخ
    navigator.clipboard.writeText(textToCopy).then(() => {
        // حفظ الشكل القديم للأيقونة
        const originalIcon = btnElement.innerText;

        // تغيير الأيقونة لعلامة صح
        btnElement.innerText = "✔️";

        // إرجاعها بعد ثانيتين
        setTimeout(() => {
            btnElement.innerText = originalIcon;
        }, 2000);

    }).catch(() => {
    });
}