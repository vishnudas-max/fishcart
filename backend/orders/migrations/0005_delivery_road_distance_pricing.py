from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("orders", "0004_deliveryservicearea_order_cancellation_message_and_more"),
    ]

    operations = [
        migrations.RenameField(
            model_name="deliveryservicearea",
            old_name="radius_km",
            new_name="max_road_distance_km",
        ),
        migrations.AlterField(
            model_name="deliveryservicearea",
            name="latitude",
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                validators=[MinValueValidator(Decimal("-90")), MaxValueValidator(Decimal("90"))],
            ),
        ),
        migrations.AlterField(
            model_name="deliveryservicearea",
            name="longitude",
            field=models.DecimalField(
                blank=True,
                decimal_places=6,
                max_digits=9,
                null=True,
                validators=[MinValueValidator(Decimal("-180")), MaxValueValidator(Decimal("180"))],
            ),
        ),
        migrations.AlterField(
            model_name="deliveryservicearea",
            name="max_road_distance_km",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("50.00"),
                max_digits=7,
                validators=[MinValueValidator(Decimal("0.1")), MaxValueValidator(Decimal("500"))],
            ),
        ),
        migrations.AddField(
            model_name="deliveryservicearea",
            name="free_delivery_km",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("5.00"),
                max_digits=6,
                validators=[MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddField(
            model_name="deliveryservicearea",
            name="delivery_fee_per_km",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("10.00"),
                max_digits=8,
                validators=[MinValueValidator(Decimal("0"))],
            ),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_distance_km",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_free_distance_km",
            field=models.DecimalField(decimal_places=2, default=Decimal("5.00"), max_digits=6),
        ),
        migrations.AddField(
            model_name="order",
            name="delivery_fee_per_km",
            field=models.DecimalField(decimal_places=2, default=Decimal("0.00"), max_digits=8),
        ),
    ]
