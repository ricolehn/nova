from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        # Mock config.js so app.js can load
        page.route("**/assets/config.js", lambda route: route.fulfill(
            status=200,
            content_type="application/javascript",
            body="export const config = { appName: 'Nova Test', apiBaseUrl: '/api' };"
        ))

        page.goto("http://localhost:8000")

        # Wait for the login modal, just to know the JS executed
        try:
            page.wait_for_selector("#login-modal", timeout=5000)
            print("Page loaded and login modal found.")
            time.sleep(1)

            # Since `cachedTransactions` is local to the module, we cannot directly check it using `window.cachedTransactions`.
            # But we can verify `showTransactionModal` doesn't crash on subsequent calls.
            page.evaluate("""
                () => {
                    window.showTransactionModal(true); // First time
                    window.showTransactionModal(false); // Load more - uses cache
                }
            """)

            empty_text = page.locator("#full-transaction-list").inner_text()
            print(f"Text after calling showTransactionModal twice: {empty_text}")

            print("Tests passed.")
        except Exception as e:
            print(f"Error during verification: {e}")
            raise e
        finally:
            browser.close()

if __name__ == "__main__":
    run()
