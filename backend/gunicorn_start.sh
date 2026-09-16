#!/bin/bash

# The name of your Django project
NAME="attendstack_backend"

# The directory where your project is located
DJANGODIR=/home/squarefit/AttendStack/backend

# The user and group to run as
USER=squarefit
GROUP=www-data

# Set the PATH to include the virtual environment's bin directory
PATH="/home/squarefit/AttendStack/backend/venv/bin:$PATH"

# The path to your project's settings module
export DJANGO_SETTINGS_MODULE=attendstack_backend.settings

# The path to your project's root directory
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Start Gunicorn
exec /home/squarefit/AttendStack/backend/venv/bin/daphne -b 127.0.0.1 -p 8001 ${NAME}.asgi:application