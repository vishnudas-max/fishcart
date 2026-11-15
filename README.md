# Chanda Fresh

Chanda Fresh is a quick-commerce storefront for fresh sea and freshwater fish, with support for other catalog categories such as pickles. Customers can browse and filter products, configure fish weight and preparation, save delivery addresses with map coordinates, check out now or preorder, and review their orders. Staff manage catalog, customers, preparation options, and orders through a custom dashboard.

## Stack

- **Backend:** Python 3.12, Django 5.2, Django REST Framework, Simple JWT
- **Frontend:** Next.js 16, React 19, TypeScript
- **Database:** SQLite for local development; PostgreSQL in Docker Compose
- **Images:** Django media in development; use durable object storage and a CDN for production
- **Containers:** Docker Compose runs the backend, frontend, and PostgreSQL as one monolithic application

## Run with Docker Compose

From the repository root, create a local environment file if you do not already have one. Replace the example secrets with unique local values before use:

```powershell
Copy-Item .env.example .env
docker compose up --build -d
```

The frontend is at <http://localhost:3000>, the API is at <http://localhost:8000>, and the custom staff dashboard is at <http://localhost:3000/admin>. Django's built-in admin is at <http://localhost:8000/admin/>.

Useful commands:

```powershell
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
```

After changing backend code or dependencies, rebuild the backend service:

```powershell
docker compose up --build -d backend
```

After changing frontend code or dependencies, rebuild the frontend service:

```powershell
docker compose up --build -d frontend
```

To rebuild and start all services:

```powershell
docker compose up --build -d
```

The backend container applies migrations at startup. PostgreSQL data and uploaded media use named Docker volumes. `docker compose down` keeps those volumes; do not use `docker compose down -v` unless you intend to permanently delete local database and media data.

## Run locally without Docker

Use two PowerShell terminals from the repository root. Create a virtual environment once, then install backend dependencies:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env` if a local environment file does not already exist. In the first terminal, start Django with SQLite:

```powershell
Set-Location backend
python manage.py migrate
python manage.py runserver 127.0.0.1:8000
```

In the second terminal, start Next.js:

```powershell
Set-Location frontend
npm ci
npm run dev
```

Next.js proxies `/api` requests to `http://127.0.0.1:8000` by default. Set `BACKEND_URL` if your local backend uses a different URL.

## Environment configuration

The repository-root `.env.example` documents the supported local settings. Copy it to `.env` and keep that file private; `.env` and other environment files are excluded from Git. Never place production credentials in `.env.example`.

Relevant settings include:

- `DJANGO_SECRET_KEY`, `DJANGO_DEBUG`, `DJANGO_ALLOWED_HOSTS`, and `CSRF_TRUSTED_ORIGINS`
- PostgreSQL connection values for Docker Compose
- `OTP_PEPPER`, OTP lifetime, and attempt limits
- `SMS_PROVIDER=console` for local development or `SMS_PROVIDER=twilio` with Twilio credentials
- JWT refresh-cookie security and SameSite options

For production, set `DJANGO_DEBUG=false`, use strong secret values, HTTPS, exact trusted hosts and origins, secure cookies, a production media-storage service, and least-privilege database credentials. Do not use the local Compose fallback passwords in a deployed environment.

## Customer authentication and staff access

Customers sign in with a phone number and a one-time code. In local console mode, the development OTP is printed in backend logs. The API returns a short-lived access JWT for in-memory frontend use and stores the refresh JWT in an HttpOnly cookie. Refresh and other cookie-authenticated operations use CSRF protection.

Staff use Django username and password authentication. The custom dashboard uses the staff API and protects staff-only operations separately from customer endpoints. Create the first staff account with:

```powershell
docker compose exec backend python manage.py createsuperuser
```

The custom user model requires a unique phone number in E.164 format, including for staff accounts.

## Main features

- Public product catalog with category, subcategory, fish type, price, and text filters; pagination is responsive to the storefront layout.
- Cart configuration for quantity/weight and fish cleaning or cutting options.
- Address book with one default address and optional latitude/longitude selected from the map.
- Checkout for ASAP orders and future preorders. Preorders require a future date/time and are handled separately from immediate stock reservation.
- Orders are confirmed on placement. Staff can cancel an order with a predefined customer-facing reason, and cancellations restore stock reserved by ASAP orders.
- Delivery checkout is limited to the configured market pin and radius (50 km by default). Staff update the pin/radius from **Admin → Delivery area**; the API rechecks the saved map coordinates at checkout.
- Customer account pages for profile details, saved addresses, and order history.
- Staff dashboard for users, products and images, category management, fish preparation options, and order management.
- Configurable GST percentage by product category and fish preparation option. Orders snapshot applied rates and tax amounts; historical order totals are retained.

GST depends on the product/service classification and the seller's circumstances. Qualifying fresh or chilled fish under HSN heading 0302 is listed at nil GST in the [CBIC GST rate table](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html). Pickles and preparation services may have different classifications. Rates default to 0% and can be changed in the staff dashboard; confirm each rate with a qualified tax adviser before charging it.

Address forms request the browser's current location when opened (if the customer grants permission), and users can adjust the pin. Map integration is behind `frontend/app/components/map-picker.tsx`; replace its provider implementation to move to another map/geocoding service. The current provider uses OpenStreetMap tiles and displays attribution. Its tile URL can be changed with `NEXT_PUBLIC_MAP_TILE_URL`. The public tile service is best-effort; use a contracted tile provider for production traffic that requires an availability commitment.

### Order notifications

Order alerts support a provider switch with separate Telegram and WhatsApp adapters. Telegram is selected by default in `.env.example`; set `ORDER_NOTIFICATION_PROVIDER=telegram`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_ADMIN_CHAT_ID` in the private `.env`. Create a bot with Telegram's [@BotFather instructions](https://core.telegram.org/bots#how-do-i-create-a-bot), open it and send `/start`, then obtain the private chat ID from the bot's updates. For a group chat, add the bot and use that group's chat ID. Keep the bot token secret. Telegram alerts include order/customer details, items and processing options, amount breakdown, fulfillment schedule, delivery address, coordinates, and a Google Maps URL when coordinates are present.

For WhatsApp, set `ORDER_NOTIFICATION_PROVIDER=whatsapp` and configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ADMIN_PHONE`, `WHATSAPP_ORDER_TEMPLATE`, and `WHATSAPP_TEMPLATE_LANGUAGE` in `.env`. This adapter requires a Meta Cloud API account and an approved template with seven body placeholders in order: order ID, customer username, customer phone, delivery address, map link, items, and total. `WHATSAPP_GRAPH_API_VERSION` is configurable. Choose `ORDER_NOTIFICATION_PROVIDER=disabled` to turn order alerts off. Never commit provider credentials. Notifications are attempted after an order transaction commits; provider failures do not roll back the order.

## API and API collection

Customer endpoints are mounted under `/api/auth/`, `/api/catalog/`, `/api/cart/`, and `/api/orders/`. The staff API is mounted under `/api/staff/`. See the Postman collection and its usage notes in [`docs/postman`](docs/postman/README.md).

Common endpoints:

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/otp/request/` | Request a customer OTP |
| `POST` | `/api/auth/otp/verify/` | Verify a customer OTP and sign in/register |
| `GET`, `PATCH` | `/api/auth/me/` | Read or update the current profile |
| `GET`, `POST` | `/api/auth/addresses/` | List or create delivery addresses |
| `GET` | `/api/catalog/products/` | Browse/filter paginated products |
| `GET`, `POST` | `/api/cart/`, `/api/cart/items/` | Read the cart or add an item |
| `GET`, `POST` | `/api/orders/` | List customer orders or place an order |
| `GET` | `/api/orders/delivery-area/` | Read configured market pin and delivery radius |
| `GET`, `PATCH` | `/api/staff/delivery-area/` | Read or update market pin and delivery radius (staff session + CSRF) |

## Development notes

- Django migrations are in each backend app's `migrations/` folder. After model changes, create and review migrations, then apply them.
- The demo-data command is for local development only: `docker compose exec backend python manage.py seed_demo_data`.
- Customer access tokens are kept in frontend memory; do not persist them in local storage.
- The `.gitignore` excludes secrets, virtual environments, local databases/media, caches, and generated frontend output. Commit source, migrations, lockfiles, documentation, and non-sensitive static assets.

## License

No license has been selected yet. All rights remain with the project owner unless a license is added.
