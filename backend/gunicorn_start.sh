#!/bin/bash

# The name of your Django project
NAME="zuperhr_backend"

# The directory where your project is located
DJANGODIR=/home/squarefit/ZuperHR/backend

# The user and group to run as
USER=squarefit
GROUP=www-data

# Set the PATH to include the virtual environment's bin directory
PATH="/home/squarefit/ZuperHR/backend/venv/bin:$PATH"

# The path to your project's settings module
export DJANGO_SETTINGS_MODULE=zuperhr_backend.settings

# The path to your project's root directory
export PYTHONPATH=$DJANGODIR:$PYTHONPATH

# Start Gunicorn
exec /home/squarefit/ZuperHR/backend/venv/bin/daphne -b 127.0.0.1 -p 8001 ${NAME}.asgi:application