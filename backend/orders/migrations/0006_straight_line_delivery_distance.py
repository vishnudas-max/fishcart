from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("orders", "0005_delivery_road_distance_pricing")]

    operations = [
        migrations.RenameField(
            model_name="deliveryservicearea",
            old_name="max_road_distance_km",
            new_name="max_delivery_distance_km",
        ),
    ]
