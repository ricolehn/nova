// Detect Language
window.currentLang = (navigator.language || navigator.userLanguage || 'en').startsWith('de') ? 'de' : 'en';

window.t = function(key) {
    if (window.currentLang === 'de') return key;
    if (window.translations && window.translations[window.currentLang] && window.translations[window.currentLang][key.trim()]) {
        return window.translations[window.currentLang][key.trim()];
    }
    return key;
};

window.translateDOM = function(root = document.body) {
    if (window.currentLang === 'de') {
        document.documentElement.lang = 'de';
        return;
    }

    document.documentElement.lang = 'en';

    // Translate direct text nodes from data-i18n
    const elements = root.querySelectorAll ? root.querySelectorAll('[data-i18n]') : [];
    elements.forEach(el => {
        const original = el.getAttribute('data-i18n');
        const translated = window.t(original);
        if (translated !== original) {
            // we replace the first text node that roughly matches the original text or just replace its entire text if it has no child elements
            if (el.children.length === 0) {
                el.textContent = translated;
            } else {
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                let node;
                while (node = walker.nextNode()) {
                    if (node.nodeValue.includes(original) || node.nodeValue.trim() === original) {
                        node.nodeValue = node.nodeValue.replace(original, translated);
                        break;
                    }
                }
            }
        }
    });

    // Translate placeholders
    const placeholders = root.querySelectorAll ? root.querySelectorAll('[data-i18n-placeholder]') : [];
    placeholders.forEach(el => {
        const text = el.getAttribute('data-i18n-placeholder');
        const translated = window.t(text);
        if (translated !== text) {
            el.setAttribute('placeholder', translated);
        }
    });

    // Translate aria-labels
    const arias = root.querySelectorAll ? root.querySelectorAll('[data-i18n-aria]') : [];
    arias.forEach(el => {
        const text = el.getAttribute('data-i18n-aria');
        const translated = window.t(text);
        if (translated !== text) {
            el.setAttribute('aria-label', translated);
        }
    });
};

document.addEventListener('DOMContentLoaded', () => {
    window.translateDOM(document.body);
});

if (window.MutationObserver) {
    const observer = new MutationObserver(mutations => {
        let shouldTranslate = false;
        for (let m of mutations) {
            if (m.type === 'childList' && m.addedNodes.length > 0) {
                shouldTranslate = true;
                break;
            }
        }
        if (shouldTranslate) {
            observer.disconnect();
            window.translateDOM(document.body);
            observer.observe(document.body, { childList: true, subtree: true });
        }
    });

    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}
