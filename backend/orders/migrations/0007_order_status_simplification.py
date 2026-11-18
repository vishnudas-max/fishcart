from django.db import migrations, models


def map_legacy_statuses(apps, schema_editor):
    Order = apps.get_model("orders", "Order")
    Order.objects.filter(status__in=["pending", "preparing"]).update(status="confirmed")
    Order.objects.filter(status="ready").update(status="out_for_delivery")


class Migration(migrations.Migration):
    dependencies = [("orders", "0006_straight_line_delivery_distance")]

    operations = [
        migrations.RunPython(map_legacy_statuses, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="order",
            name="status",
            field=models.CharField(
                choices=[
                    ("confirmed", "Confirmed"),
                    ("out_for_delivery", "Out for delivery"),
                    ("completed", "Completed"),
                    ("cancelled", "Cancelled"),
                ],
                db_index=True,
                default="confirmed",
                max_length=20,
            ),
        ),
    ]
