#!/usr/bin/env bash
set -e

cd app
npm install
npx drizzle-kit migrate
