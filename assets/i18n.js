window.i18nData = {};
window.currentLanguage = navigator.language.startsWith('de') ? 'de' : 'en';

if (localStorage.getItem('nova-lang')) {
    window.currentLanguage = localStorage.getItem('nova-lang');
}

window.t = function(key) {
    return window.i18nData[key] || key;
};

window.translateDOM = function(root = document) {
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (window.i18nData[key]) {
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                el.value = window.i18nData[key];
            } else {
                el.textContent = window.i18nData[key];
            }
        }
    });

    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (window.i18nData[key]) {
            el.setAttribute('placeholder', window.i18nData[key]);
        }
    });
};

window.initI18n = async function() {
    try {
        const response = await fetch(`./assets/languages/${window.currentLanguage}.json`);
        if (response.ok) {
            window.i18nData = await response.json();
            document.documentElement.lang = window.currentLanguage;
        } else {
            const fallbackResponse = await fetch(`./assets/languages/de.json`);
            if (fallbackResponse.ok) {
                window.i18nData = await fallbackResponse.json();
            }
        }
    } catch (e) {
        console.error("Failed to load i18n data", e);
    }

    window.translateDOM();
};
