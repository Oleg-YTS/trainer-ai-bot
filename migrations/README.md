Alembic migrations for the PostgreSQL schema defined in `app/database/models.py`.

```bash
alembic history                      # список ревизий
alembic upgrade head                 # применить миграции (нужен DATABASE_URL)
alembic current                      # текущая ревизия в БД
alembic check                        # сверить модели и БД (нет незакоммиченных изменений)
alembic downgrade base               # откатить всё
alembic upgrade head --sql           # offline: напечатать SQL без подключения к БД
```

`alembic.ini` не хранит URL: `migrations/env.py` берёт `DATABASE_URL` из переменных окружения и приводит драйвер к `postgresql+asyncpg://`.

Перед командами, работающими с БД, задайте URL явно (файл `.env` Alembic не читает, чтобы миграции не зависели от настроек бота):

```bash
export DATABASE_URL="postgresql://user:password@host:5432/database"   # Windows: $env:DATABASE_URL="..."
```


