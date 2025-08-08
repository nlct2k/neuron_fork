#!/bin/bash


set -e  # Exit on any error
set -a
# 🔧 FIX #6: Use .env.localhost (which exists in container) instead of .env (which doesn't exist)
# This prevents ".env: No such file or directory" errors
source .env.localhost
set +a


echo "Running database migrations..."
npx prisma migrate deploy


echo "Running database seed..."
npx prisma db seed


echo "Database initialization completed successfully!"

