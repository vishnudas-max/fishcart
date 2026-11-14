# Postman API collection

Import `Seafood Commerce API.postman_collection.json` into Postman. The collection defaults to `http://localhost:8000`; edit the `baseUrl` collection variable if your API uses another host or port.

## Suggested first run

1. Start the backend and database, then run migrations and create a Django staff user if needed.
2. Run **Initialize customer CSRF cookie**, then **Request OTP**. Local development prints the OTP through the console SMS adapter. Set `otpCode` to that value and run **Verify OTP**. The response script saves the access token in the collection variable; Postman keeps the refresh cookie in its cookie jar.
3. Call **Current user** or create an address. Copy returned IDs into the collection variables as you create categories, products, cart items, and orders.
4. For staff requests, run **Initialize staff CSRF cookie**, then **Staff login** using `staffUsername` and `staffPassword`. Postman keeps the Django session cookie; the CSRF token is saved from the cookie for unsafe requests.

The collection includes customer auth/profile, addresses, public category/product catalog, cart, ASAP checkout and future preorder, plus staff dashboard, category/product/processing-option management, users, addresses, and order management. Product creation and profile-photo upload use multipart form data; select a local image in Postman. Postman will set the multipart content type and boundary automatically.

Use test data only. `DELETE` on staff-managed categories, products, and processing options soft archives the record (`is_active=false`). Checkout changes stock for ASAP orders and empties the current cart, so run it only when intentionally creating an order.
