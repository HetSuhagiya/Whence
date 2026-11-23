import os
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import duckdb

DEMO_DB_PATH = Path("data/demo_ecommerce.duckdb")


def get_demo_db_path() -> str:
    DEMO_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return str(DEMO_DB_PATH)


def ensure_demo_ecommerce_dataset(db_path: str | None = None) -> str:
    """
    Ensures that a realistic ecommerce dataset exists in DuckDB.
    Matches the schema and field names of bigquery-public-data.thelook_ecommerce.
    Deterministic seed for repeatable analytical numbers and explain tests.
    """
    target_path = db_path or get_demo_db_path()
    if os.path.exists(target_path) and os.path.getsize(target_path) > 100_000:
        return target_path

    # Connect to duckdb
    conn = duckdb.connect(target_path)

    # Seed random for determinism
    rng = random.Random(42)

    categories = [
        "Jeans",
        "Tops & Tees",
        "Sweaters",
        "Shorts",
        "Dresses",
        "Accessories",
        "Outerwear",
        "Pants",
        "Swim",
        "Underwear",
    ]
    traffic_sources = ["Search", "Organic", "Facebook", "Email", "Display"]
    states = [
        "California",
        "Texas",
        "New York",
        "Florida",
        "Illinois",
        "Washington",
        "Ohio",
        "Pennsylvania",
    ]
    statuses = ["Complete", "Complete", "Complete", "Shipped", "Pending", "Cancelled", "Returned"]
    payment_methods = ["Credit Card", "PayPal", "Apple Pay", "Debit Card"]

    # Base price distribution by category
    base_prices = {
        "Jeans": 79.50,
        "Tops & Tees": 29.00,
        "Sweaters": 65.00,
        "Shorts": 38.00,
        "Dresses": 89.00,
        "Accessories": 24.50,
        "Outerwear": 125.00,
        "Pants": 55.00,
        "Swim": 45.00,
        "Underwear": 22.00,
    }

    # Generate 12 months of daily orders ending today
    end_date = datetime(2026, 11, 23, 12, 0, 0)
    start_date = end_date - timedelta(days=365)

    orders_data: list[dict[str, Any]] = []
    items_data: list[dict[str, Any]] = []

    order_id_counter = 10001
    item_id_counter = 50001

    current_day = start_date
    day_idx = 0

    while current_day <= end_date:
        weekday = current_day.weekday()  # 0=Monday, 6=Sunday
        # Weekend bump: +25%
        weekday_factor = 1.25 if weekday in (4, 5, 6) else 0.95
        # Seasonal trend: slight upward growth
        trend_factor = 1.0 + (day_idx / 365.0) * 0.35
        # Day base count
        num_orders_today = int(rng.gauss(65, 8) * weekday_factor * trend_factor)

        for _ in range(num_orders_today):
            order_id = order_id_counter
            order_id_counter += 1

            user_id = rng.randint(1001, 8000)
            order_status = rng.choice(statuses)
            user_state = rng.choice(states)
            traffic = rng.choice(traffic_sources)
            payment = rng.choice(payment_methods)

            # Random time during day
            order_time = current_day + timedelta(
                hours=rng.randint(0, 23),
                minutes=rng.randint(0, 59),
                seconds=rng.randint(0, 59),
            )

            # Number of items in order: 1 (65%), 2 (25%), 3 (10%)
            num_items = rng.choices([1, 2, 3], weights=[65, 25, 10])[0]
            order_total = 0.0

            for _ in range(num_items):
                item_id = item_id_counter
                item_id_counter += 1

                cat = rng.choice(categories)
                base = base_prices[cat]
                sale_price = round(rng.gauss(base, base * 0.15), 2)
                if sale_price < 5.0:
                    sale_price = 5.0
                order_total += sale_price

                items_data.append(
                    {
                        "id": item_id,
                        "order_id": order_id,
                        "user_id": user_id,
                        "product_id": rng.randint(1, 500),
                        "status": order_status,
                        "created_at": order_time,
                        "sale_price": sale_price,
                        "category": cat,
                        "traffic_source": traffic,
                        "state": user_state,
                        "country": "United States",
                    }
                )

            orders_data.append(
                {
                    "order_id": order_id,
                    "user_id": user_id,
                    "status": order_status,
                    "created_at": order_time,
                    "num_of_item": num_items,
                    "sale_price": round(order_total, 2),
                    "traffic_source": traffic,
                    "state": user_state,
                    "country": "United States",
                    "payment_method": payment,
                }
            )

        current_day += timedelta(days=1)
        day_idx += 1

    # Create tables in DuckDB
    conn.execute("DROP TABLE IF EXISTS orders;")
    conn.execute("DROP TABLE IF EXISTS order_items;")
    conn.execute("DROP TABLE IF EXISTS thelook_ecommerce_orders;")

    # Register and persist orders
    conn.execute(
        """
        CREATE TABLE orders (
            order_id BIGINT PRIMARY KEY,
            user_id BIGINT,
            status VARCHAR,
            created_at TIMESTAMP,
            num_of_item INTEGER,
            sale_price DOUBLE,
            traffic_source VARCHAR,
            state VARCHAR,
            country VARCHAR,
            payment_method VARCHAR
        );
        """
    )

    # Insert orders in batches
    conn.executemany(
        """
        INSERT INTO orders VALUES (
            $order_id, $user_id, $status, $created_at, $num_of_item, $sale_price,
            $traffic_source, $state, $country, $payment_method
        );
        """,
        orders_data,
    )

    # Create order_items
    conn.execute(
        """
        CREATE TABLE order_items (
            id BIGINT PRIMARY KEY,
            order_id BIGINT,
            user_id BIGINT,
            product_id BIGINT,
            status VARCHAR,
            created_at TIMESTAMP,
            sale_price DOUBLE,
            category VARCHAR,
            traffic_source VARCHAR,
            state VARCHAR,
            country VARCHAR
        );
        """
    )

    conn.executemany(
        """
        INSERT INTO order_items VALUES (
            $id, $order_id, $user_id, $product_id, $status, $created_at, $sale_price,
            $category, $traffic_source, $state, $country
        );
        """,
        items_data,
    )

    # Flattened comprehensive table matching thelook_ecommerce_orders
    conn.execute(
        """
        CREATE TABLE thelook_ecommerce_orders AS
        SELECT
            oi.id AS order_item_id,
            oi.order_id,
            oi.user_id,
            oi.created_at,
            oi.status,
            oi.sale_price,
            oi.category,
            oi.traffic_source,
            oi.state,
            oi.country,
            o.payment_method
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.order_id;
        """
    )

    conn.close()
    return target_path
