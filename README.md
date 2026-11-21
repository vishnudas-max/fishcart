# തട്ട് — Fresh Seafood from Munambam

തട്ട് (Thatt) is a local seafood storefront based in Munambam, Kerala. It offers fresh sea and freshwater fish sourced from the coast, with customer-selected weight, cleaning and cutting, saved delivery locations, local delivery, and future preorders. The catalog can also support other categories such as pickles. Customers can browse and filter products, manage their profile and addresses, place orders, and review completed purchases. Staff manage products, categories, fish preparation options, customers, delivery settings, and orders in a custom dashboard.

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

Use separate private environment files for each responsibility; all are ignored by Git. Copy each template to the named private file. For example, copy `.env.example` to `.env`, `backend/.env.example` to `backend/.env`, and `frontend/.env.example` to `frontend/.env.local`:

| File | Copy from | Used for |
| --- | --- | --- |
| Project root `.env` | `.env.example` | Docker Compose interpolation: PostgreSQL database/user/password and public storefront values passed at frontend build time. |
| `backend/.env` | `backend/.env.example` | Django secret key, trusted hosts, OTP settings, SMTP and notification provider credentials. Docker Compose loads this file into the backend only. |
| `frontend/.env.local` | `frontend/.env.example` | Public `NEXT_PUBLIC_*` settings while running Next.js locally with `npm run dev`. Never put secrets here; these values are compiled into browser code. |

Django reads `backend/.env` when run locally. Inside Docker, Compose injects `backend/.env` values into the backend container and passes database values from the root `.env` as explicit service environment. Local Django defaults to SQLite; Docker Compose sets `DB_ENGINE=postgres` and `POSTGRES_HOST=db`.

`NEXT_PUBLIC_STORE_PHONE` is the public contact number (currently `9539833135`; the storefront formats it for India). `NEXT_PUBLIC_SITE_URL` is the canonical site origin, for example `https://thatt.example`, without a path; set it before a production frontend build so canonical metadata, sitemap, and robots URLs are correct. The banner is a static asset at `frontend/public/images/banner.webp`; replace that file to change the banner. The logo is `frontend/public/thatt-logo.webp`.

Compose requires `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in the root `.env`. It passes those to both the backend (to connect) and database container (to initialize Postgres); the backend `.env` remains isolated from the frontend and database service. If a Compose `.env` value contains `$`, escape it as `$$` so Compose passes a literal dollar sign. Production startup rejects placeholder database, Django, and OTP secrets. Also use HTTPS, exact trusted hosts and origins, secure cookies, a production media-storage service, and least-privilege database credentials.

## Customer authentication and staff access

Customers register or sign in with an email and a one-time code sent through the configured SMTP server. OTP values are not written to backend logs. A customer may add an optional E.164 profile phone number after sign-in; each delivery address still requires its own contact phone number. The API returns a short-lived access JWT for in-memory frontend use and stores the refresh JWT in an HttpOnly cookie. Refresh and other cookie-authenticated operations use CSRF protection.

Staff use Django username and password authentication. The custom dashboard uses the staff API and protects staff-only operations separately from customer endpoints. Create the first staff account with:

```powershell
docker compose exec backend python manage.py createsuperuser
```

Staff accounts continue to use Django username/password authentication. The customer email is unique; profile phone is optional and unique when provided.

## Main features

- Public product catalog with category, subcategory, fish type, price, and text filters; pagination is responsive to the storefront layout.
- Cart configuration for quantity/weight and fish cleaning or cutting options.
- Address book with one default address and optional latitude/longitude selected from the map.
- Checkout for ASAP orders and future preorders. Preorders require a future date/time and are handled separately from immediate stock reservation.
- Orders are confirmed on placement. Staff can move them through **Confirmed → Out for delivery → Completed**, or cancel an active order with a predefined customer-facing reason. Cancellations restore stock reserved by ASAP orders.
- Delivery checkout uses straight-line distance from the configured market pin. The first 5 km are free by default, and each additional kilometre is charged proportionally at the configured rate. The delivery radius (50 km by default), free radius, and per-kilometre fee are editable under **Admin → Delivery area**; the backend recalculates the quote when placing an order.
- Customer account pages for profile details, saved addresses, and order history.
- Staff dashboard for users, products and images, category management, fish preparation options, and order management.
- Configurable GST percentage by product category and fish preparation option. Orders snapshot applied rates and tax amounts; historical order totals are retained.

GST depends on the product/service classification and the seller's circumstances. Qualifying fresh or chilled fish under HSN heading 0302 is listed at nil GST in the [CBIC GST rate table](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html). Pickles and preparation services may have different classifications. Rates default to 0% and can be changed in the staff dashboard; confirm each rate with a qualified tax adviser before charging it.

Address forms use OpenStreetMap tiles for interactive pin placement. No Google Maps key or routing provider is used; straight-line distance is calculated in the backend. The checkout map preview marks the configured market and shows the customer pin coordinates without drawing a road route. OpenStreetMap tile use is subject to its tile usage policy and attribution requirements.

### Order notifications

Order alerts support a provider switch with separate Telegram and WhatsApp adapters. Telegram is selected by default in `.env.example`; set `ORDER_NOTIFICATION_PROVIDER=telegram`, `TELEGRAM_BOT_TOKEN`, and `TELEGRAM_ADMIN_CHAT_ID` in the private `.env`. Create a bot with Telegram's [@BotFather instructions](https://core.telegram.org/bots#how-do-i-create-a-bot), open it and send `/start`, then obtain the private chat ID from the bot's updates. For a group chat, add the bot and use that group's chat ID. Keep the bot token secret. Telegram alerts include order/customer details, items and processing options, amount breakdown, fulfillment schedule, delivery address, coordinates, and an OpenStreetMap location link when coordinates are present.

For WhatsApp, set `ORDER_NOTIFICATION_PROVIDER=whatsapp` and configure `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ADMIN_PHONE`, `WHATSAPP_ORDER_TEMPLATE`, and `WHATSAPP_TEMPLATE_LANGUAGE` in `.env`. This adapter requires a Meta Cloud API account and an approved template with seven body placeholders in order: order ID, customer username, customer email, delivery address, map link, items, and total. `WHATSAPP_GRAPH_API_VERSION` is configurable. Choose `ORDER_NOTIFICATION_PROVIDER=disabled` to turn order alerts off. Never commit provider credentials. Notifications are attempted after an order transaction commits; provider failures do not roll back the order.

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
| `GET` | `/api/orders/delivery-area/` | Read delivery settings (market coordinates are returned for authenticated checkout) |
| `POST` | `/api/orders/delivery-quote/` | Quote straight-line distance and delivery fee for a saved address or map pin |
| `GET`, `PATCH` | `/api/staff/delivery-area/` | Read or update market pin, straight-line delivery limit, free distance and per-km fee (staff session + CSRF) |

## Development notes

- Django migrations are in each backend app's `migrations/` folder. After model changes, create and review migrations, then apply them.
- Add real product images through the staff catalog dashboard. The storefront hero uses the static asset `frontend/public/images/banner.webp`; replace that file with your banner image and rebuild the frontend container. If it is absent, the page displays its gradient fallback. The site logo is `frontend/public/thatt-logo.webp`.
- Customer access tokens are kept in frontend memory; do not persist them in local storage.
- The `.gitignore` excludes secrets, virtual environments, local databases/media, caches, and generated frontend output. Commit source, migrations, lockfiles, documentation, and non-sensitive static assets.

## License

No license has been selected yet. All rights remain with the project owner unless a license is added.
