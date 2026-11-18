from django.db import migrations, models


def empty_emails_to_null(apps, schema_editor):
    User = apps.get_model("users", "User")
    User.objects.filter(email="").update(email=None)


def discard_phone_otps(apps, schema_editor):
    apps.get_model("users", "LoginOTP").objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [("users", "0003_alter_user_managers")]

    operations = [
        migrations.AlterField(
            model_name="user", name="email",
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.RunPython(empty_emails_to_null, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user", name="email",
            field=models.EmailField(blank=True, max_length=254, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="user", name="email_verified_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="user", name="phone_number",
            field=models.CharField(blank=True, db_index=True, max_length=16, null=True, unique=True),
        ),
        migrations.RemoveIndex(model_name="loginotp", name="users_login_phone_n_629b00_idx"),
        migrations.RenameField(model_name="loginotp", old_name="phone_number", new_name="email"),
        migrations.AlterField(
            model_name="loginotp", name="email",
            field=models.EmailField(db_index=True, max_length=254),
        ),
        migrations.RunPython(discard_phone_otps, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name="loginotp",
            index=models.Index(fields=["email", "created_at"], name="users_login_email_created_idx"),
        ),
    ]
