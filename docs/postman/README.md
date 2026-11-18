# Fishcart Postman API collection

Import [`Seafood Commerce API.postman_collection.json`](Seafood%20Commerce%20API.postman_collection.json) into Postman. The collection uses `http://localhost:8000` by default. Change the `baseUrl` collection variable if the backend is hosted elsewhere. Use the same host consistently so Postman sends the refresh/session cookies it has stored.

## Recommended setup and test order

1. Start the Docker services and create a staff login if you do not have one:

   ```powershell
   docker compose up --build -d
   docker compose exec backend python manage.py createsuperuser
   ```

2. In **Staff dashboard (session authentication)**, run **Get staff CSRF cookie**, then **Staff login**. Set `staffUsername` and `staffPassword` in Postman before login. Postman retains Django's `sessionid` cookie.
3. Run **Set market location and straight-line delivery pricing** in the same folder. Set the market pin, maximum straight-line delivery distance, free first kilometres and fee per additional kilometre. No external route API key is needed.
4. In **Customer authentication**, run **Get customer CSRF cookie**, then **Request OTP** with your email address. Read the code from the mailbox configured for your SMTP provider. If you use **Resend OTP**, it invalidates the previous code; use only the newest code. Set `otpCode`, then run **Verify OTP and capture access token**. The collection saves the short-lived access token; Postman stores the HttpOnly refresh cookie.
5. Create an address in **Customer addresses**. The example coordinates are in Kochi; change the address and pin to a real test location inside the configured straight-line distance limit. Use **Get delivery quote** to check distance and fee. A collection script saves the returned ID to `addressId`.
6. Use **Staff categories** to create a top-level fish category and a subcategory. Use **Staff fish processing options** to create cleaning/cutting options on the top-level fish category. Use **Staff products** to create a product and select an image; the returned IDs are saved for later requests. For a pickle, create a pickle category and set the product category to that category.
7. In **Customer cart**, add a product and optionally set a processing option. Then use **Customer orders → Place order now (ASAP)**. It creates a confirmed order, reserves stock, clears the cart, and triggers the configured order-notification provider. For a preorder, add an item marked `preorder_eligible: true`, then run **Place future preorder**; the request script generates a future UTC time and current stock is not reserved.
8. Use **Staff orders** to list/detail the order and move it from `confirmed` to `out_for_delivery` to `completed`, or cancel an active order using a predefined reason. Cancellation reasons are `out_of_stock`, `delivery_unavailable`, `operational_issue`, and `customer_request`.

## Authentication and CSRF

- **Customers:** email OTP verification returns a short-lived access JWT. The collection sends it as `Authorization: Bearer {{accessToken}}`. The refresh JWT is HttpOnly and is kept by Postman's cookie jar; run **Refresh access token** to rotate it. Refresh and logout are CSRF protected.
- **Staff:** username/password login creates a Django session cookie. Staff mutations use `SessionAuthentication`, so run the staff CSRF request first and send `X-CSRFToken: {{csrfToken}}` on POST/PATCH/DELETE calls. Postman retains the session cookie.
- Collection variables may contain a live access token after use. Do not export or share an authenticated collection. Clear `accessToken`, `csrfToken`, and Postman's cookies when finished. Never put real passwords, OTPs, or provider tokens in the exported JSON.
- Each request has a Postman test for the expected HTTP status and JSON response (except `204` responses). The collection includes capture scripts for OTP access tokens, CSRF cookies, and newly created resource IDs.

## API endpoint coverage

| Area | Endpoints included |
| --- | --- |
| Customer auth/profile | `GET csrf`, `POST otp/request`, `POST otp/verify`, `POST refresh`, `GET/PATCH me`, profile photo upload, `POST logout` |
| Customer addresses | `GET/POST addresses`, `GET/PATCH/DELETE addresses/{id}`, `POST addresses/{id}/set-default` |
| Catalog | `GET categories`, `GET products` with paging/filter examples, `GET products/{slug}`, product review list/create/update/delete |
| Cart | `GET cart`, `POST items`, `PATCH/DELETE items/{id}` |
| Orders | `GET delivery-area`, `POST delivery-quote`, `GET/POST orders`, `GET orders/{id}` |
| Staff session/config | `GET csrf`, `POST login/logout`, `GET me/dashboard`, `GET/PATCH delivery-area` |
| Staff catalog | category, product and processing-option list/detail/create/update/soft-archive operations |
| Staff directory | customer list/detail/status update and customer-address list/detail |
| Staff orders | paginated/search/filter list, detail and status/note/cancellation updates |

Product filters use `category`, `subcategory`, `fish_type`, `min_price`, `max_price`, `search`, `ordering`, `page`, and `page_size`. Staff order filters include `preorder`, `status`, `search`, `page`, and `page_size`. Valid order statuses are `confirmed`, `out_for_delivery`, `completed`, and `cancelled`.

Reviews are public to read, but customers can create one only after an order containing that product is completed. Each customer can leave one review per product and may update or delete their own review. Staff can hide a review in Django admin; hidden reviews are excluded from product ratings and the public list. Reviews use a generic “Verified customer” display name to avoid publishing customer identifiers.

## Notes

- Pick local image files for multipart profile/product image requests; leave the `Content-Type` header unset so Postman supplies the multipart boundary.
- `DELETE` on staff-managed catalog records is a soft archive (`is_active=false`); it does not remove historical references.
- Creating an ASAP order changes available stock and empties the cart. Preorders do not reserve current stock. Use test data and avoid running checkout requests more than once unless you intend to create another order.
- `accessToken`, `csrfToken`, and `scheduledFor` are automatically managed by request scripts. Most created IDs are captured into collection variables; update a variable manually if testing an existing record.
